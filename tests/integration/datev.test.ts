import { randomUUID, createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { db, pool } from "@/server/db";
import {
	appSettings,
	auditEvents,
	datevDeliveries,
	protokolle,
} from "@/server/db/schema";
import {
	getDatevSettings,
	getDatevStatus,
	resolveDatevDelivery,
	sendDatevProtocol,
	updateDatevSettings,
} from "@/server/services/datev";

const actor = {
	id: "datev-integration",
	email: "test@example.invalid",
	name: "DATEV Test",
	role: "admin",
};
const audit = { actor };
const content = Buffer.from(
	"%PDF-1.7\nSynthetic DATEV integration attachment\n%%EOF",
);
const send = vi.fn(
	async (_mail: {
		to: string;
		filename: string;
		content: Buffer;
		messageId: string;
		subject: string;
	}) => {},
);
const deps = {
	download: vi.fn(async (_key: string) => content),
	prepareMail: vi.fn(async (_sender: string) => send),
};
const ids: string[] = [];
let isolatedDatabaseVerified = false;

beforeAll(async () => {
	if (process.env.RENDANT_INTEGRATION_TEST !== "1")
		throw new Error(
			"DATEV integration tests require an isolated test database",
		);
	const result = await pool.query("select current_database() as name");
	if (!result.rows[0].name.endsWith("_test"))
		throw new Error("Refusing a non-test database");
	isolatedDatabaseVerified = true;
});
beforeEach(async () => {
	send.mockReset();
	send.mockResolvedValue(undefined);
	deps.download.mockReset();
	deps.download.mockResolvedValue(content);
	deps.prepareMail.mockReset();
	deps.prepareMail.mockResolvedValue(send);
	await db
		.update(appSettings)
		.set({
			datev_enabled: true,
			datev_sender: "datev@example.invalid",
			datev_recipient:
				"11111111-2222-3333-4444-555555555555@uploadmail.datev.de",
			datev_updated_at: new Date(),
		})
		.where(eq(appSettings.id, 1));
});
afterAll(async () => {
	if (!isolatedDatabaseVerified) {
		await pool.end();
		return;
	}
	for (const id of ids) {
		await db
			.delete(datevDeliveries)
			.where(eq(datevDeliveries.protokoll_id, id));
		await db.delete(protokolle).where(eq(protokolle.id, id));
	}
	await db
		.update(appSettings)
		.set({ datev_enabled: false, datev_sender: "", datev_recipient: "" })
		.where(eq(appSettings.id, 1));
	await pool.end();
});

async function fixture() {
	const id = randomUUID();
	ids.push(id);
	await db.insert(protokolle).values({
		id,
		belegnummer: `DATEV-${id}`,
		anlass_datum: "2026-10-23",
		anlass: "Synthetischer Test",
		gezaehlt_von: "Test",
		geprueft_von: "",
		wechselgeld_cent: 0,
		gezaehlt_cent: 10000,
		ausgaben_cent: 0,
		bestand_cent: 10000,
		tageseinnahmen_cent: 10000,
		pdf_s3_key: `synthetic/${id}.pdf`,
	});
	const settings = await getDatevSettings();
	return {
		id,
		document: "original" as const,
		expected_delivery_attempt_id: null as string | null,
		expected_pdf_key: `synthetic/${id}.pdf`,
		expected_settings_updated_at: settings.updated_at,
	};
}

describe("DATEV PostgreSQL delivery state", () => {
	it("keeps an accepted email blocked when persisting the completion fails", async () => {
		const input = await fixture();
		await db.execute(
			sql`create function datev_test_fail_completion() returns trigger language plpgsql as $$ begin raise exception 'synthetic completion failure'; end; $$`,
		);
		await db.execute(
			sql.raw(
				`create trigger datev_test_fail_completion before update on datev_deliveries for each row when (new.state = 'sent' and new.protokoll_id = '${input.id}'::uuid) execute function datev_test_fail_completion()`,
			),
		);
		try {
			await expect(sendDatevProtocol(input, audit, deps)).rejects.toMatchObject(
				{ code: "BAD_GATEWAY" },
			);
			expect(
				(await getDatevStatus(input.id)).documents[0].delivery?.state,
			).toBe("uncertain");
			await sendDatevProtocol(input, audit, deps);
			expect(send).toHaveBeenCalledOnce();
		} finally {
			await db.execute(
				sql`drop trigger datev_test_fail_completion on datev_deliveries`,
			);
			await db.execute(sql`drop function datev_test_fail_completion()`);
		}
	});
	it("allows only one concurrent manual decision for the reviewed revision", async () => {
		const input = await fixture();
		await sendDatevProtocol(input, audit, deps);
		const delivery = (await getDatevStatus(input.id)).documents[0].delivery;
		const resolution = {
			id: input.id,
			document: input.document,
			attempt_id: delivery?.attempt_id ?? "",
			expected_revision: delivery?.revision ?? 0,
			reason: "Synthetisches Ergebnis nach manueller Prüfung.",
		};
		const results = await Promise.allSettled([
			resolveDatevDelivery({ ...resolution, outcome: "sent" }, audit),
			resolveDatevDelivery({ ...resolution, outcome: "ready" }, audit),
		]);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
		expect(send).toHaveBeenCalledOnce();
	});
	it("sends once for simultaneous clicks and replays, retaining the exact bytes hash and audit", async () => {
		const input = await fixture();
		const results = await Promise.all([
			sendDatevProtocol(input, audit, deps),
			sendDatevProtocol(input, audit, deps),
		]);
		expect(results.map((r) => r.status).sort()).toEqual([
			"already_claimed",
			"sent",
		]);
		await sendDatevProtocol(input, audit, deps);
		expect(send).toHaveBeenCalledOnce();
		const [row] = await db
			.select()
			.from(datevDeliveries)
			.where(eq(datevDeliveries.protokoll_id, input.id));
		expect(row).toMatchObject({
			state: "sent",
			pdf_bytes_sha256: createHash("sha256").update(content).digest("hex"),
		});
		expect(row.sent_at).toBeInstanceOf(Date);
		const events = await db
			.select()
			.from(auditEvents)
			.where(eq(auditEvents.subject_id, input.id));
		expect(events.map((e) => e.action)).toEqual(
			expect.arrayContaining([
				"protokolle.datev_requested",
				"protokolle.datev_sent",
			]),
		);
	});
	it("blocks stale destinations and regenerated PDFs without submitting an email", async () => {
		const input = await fixture();
		await db
			.update(appSettings)
			.set({ datev_updated_at: new Date(Date.now() + 1000) })
			.where(eq(appSettings.id, 1));
		await expect(sendDatevProtocol(input, audit, deps)).rejects.toMatchObject({
			code: "CONFLICT",
		});
		input.expected_settings_updated_at = (await getDatevSettings()).updated_at;
		await db
			.update(protokolle)
			.set({ pdf_s3_key: "synthetic/new.pdf" })
			.where(eq(protokolle.id, input.id));
		await expect(sendDatevProtocol(input, audit, deps)).rejects.toMatchObject({
			code: "CONFLICT",
		});
		expect(send).not.toHaveBeenCalled();
		expect((await getDatevStatus(input.id)).documents[0].delivery).toBeNull();
	});
	it("allows retry after a preflight storage failure without reserving a send", async () => {
		const input = await fixture();
		deps.download.mockRejectedValueOnce(new Error("synthetic storage failure"));
		await expect(sendDatevProtocol(input, audit, deps)).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
		});
		expect((await getDatevStatus(input.id)).documents[0].delivery).toBeNull();
		await sendDatevProtocol(input, audit, deps);
		expect(send).toHaveBeenCalledOnce();
	});
	it("blocks retries after an ambiguous SMTP outcome until an audited manual release", async () => {
		const input = await fixture();
		send.mockRejectedValueOnce(new Error("synthetic lost SMTP reply"));
		await expect(sendDatevProtocol(input, audit, deps)).rejects.toMatchObject({
			code: "BAD_GATEWAY",
		});
		const delivery = (await getDatevStatus(input.id)).documents[0].delivery;
		expect(delivery).toMatchObject({ state: "uncertain", can_resolve: true });
		await sendDatevProtocol(input, audit, deps);
		expect(send).toHaveBeenCalledOnce();
		const resolution = {
			id: input.id,
			document: input.document,
			attempt_id: delivery?.attempt_id ?? "",
			expected_revision: delivery?.revision ?? 0,
			outcome: "ready" as const,
			reason: "DATEV und Rückmeldung geprüft: Beleg fehlt.",
		};
		await resolveDatevDelivery(resolution, audit);
		await expect(resolveDatevDelivery(resolution, audit)).rejects.toMatchObject(
			{ code: "CONFLICT" },
		);
		await expect(sendDatevProtocol(input, audit, deps)).rejects.toMatchObject({
			code: "CONFLICT",
		});
		input.expected_delivery_attempt_id = delivery?.attempt_id ?? null;
		await sendDatevProtocol(input, audit, deps);
		expect(send).toHaveBeenCalledTimes(2);
		await expect(resolveDatevDelivery(resolution, audit)).rejects.toMatchObject(
			{ code: "CONFLICT" },
		);
	});
	it("retains a crash claim and permits reconciliation only after five minutes", async () => {
		const input = await fixture();
		await sendDatevProtocol(input, audit, deps);
		await db
			.update(datevDeliveries)
			.set({ state: "sending", sent_at: null })
			.where(eq(datevDeliveries.protokoll_id, input.id));
		const delivery = (await getDatevStatus(input.id)).documents[0].delivery;
		const resolution = {
			id: input.id,
			document: input.document,
			attempt_id: delivery?.attempt_id ?? "",
			expected_revision: delivery?.revision ?? 0,
			outcome: "sent" as const,
			reason: "DATEV geprüft: Beleg ist bereits vorhanden.",
		};
		await expect(resolveDatevDelivery(resolution, audit)).rejects.toMatchObject(
			{ code: "CONFLICT" },
		);
		await db
			.update(datevDeliveries)
			.set({ started_at: sql`now() - interval '6 minutes'` })
			.where(eq(datevDeliveries.protokoll_id, input.id));
		await resolveDatevDelivery(resolution, audit);
		await sendDatevProtocol(input, audit, deps);
		expect(send).toHaveBeenCalledOnce();
	});
	it("sends cancellation separately and permits deliberate release after DATEV rejection", async () => {
		const input = await fixture();
		await expect(
			sendDatevProtocol({ ...input, document: "storno" }, audit, deps),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await db
			.update(protokolle)
			.set({
				storniert_am: new Date(),
				storno_pdf_s3_key: "synthetic/cancel.pdf",
			})
			.where(eq(protokolle.id, input.id));
		await sendDatevProtocol(input, audit, deps);
		await sendDatevProtocol(
			{
				...input,
				document: "storno",
				expected_pdf_key: "synthetic/cancel.pdf",
			},
			audit,
			deps,
		);
		expect(send).toHaveBeenCalledTimes(2);
		expect(send.mock.calls[1][0].filename).toMatch(/_STORNO\.pdf$/);
		const delivery = (await getDatevStatus(input.id)).documents[0].delivery;
		await resolveDatevDelivery(
			{
				id: input.id,
				document: "original",
				attempt_id: delivery?.attempt_id ?? "",
				expected_revision: delivery?.revision ?? 0,
				outcome: "ready",
				reason: "DATEV hat den Absender abgelehnt. Freischaltung korrigiert.",
			},
			audit,
		);
		input.expected_delivery_attempt_id = delivery?.attempt_id ?? null;
		await sendDatevProtocol(input, audit, deps);
		expect(send).toHaveBeenCalledTimes(3);
	});
	it("rejects concurrent settings edits instead of overwriting the destination", async () => {
		const current = await getDatevSettings();
		const patch = {
			...current,
			expected_updated_at: current.updated_at,
			recipient: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee@uploadmail.datev.de",
		};
		const results = await Promise.allSettled([
			updateDatevSettings(patch, audit),
			updateDatevSettings(patch, audit),
		]);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
	});
});
