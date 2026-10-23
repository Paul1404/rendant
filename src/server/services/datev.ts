import { createHash, randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { and, eq, sql } from "drizzle-orm";
import type * as v from "valibot";
import type { DatevDocument } from "@/lib/datev";
import type {
	DatevResolveSchema,
	DatevSendSchema,
	DatevSettingsSchema,
} from "@/lib/schemas";
import { db } from "@/server/db";
import { appSettings, datevDeliveries, protokolle } from "@/server/db/schema";
import { logger } from "@/server/logger";
import {
	type RecordAuditInput,
	recordAuditEventStrict,
} from "@/server/services/audit";
import { prepareDatevEmail } from "@/server/services/email";
import { downloadPdf } from "@/server/services/s3";
import { claimSettingsGroup } from "@/server/services/settings";

type Audit = {
	actor: NonNullable<RecordAuditInput["actor"]>;
	request?: RecordAuditInput["request"];
};
type SendInput = v.InferOutput<typeof DatevSendSchema>;
type ResolveInput = v.InferOutput<typeof DatevResolveSchema>;
type SettingsRow = typeof appSettings.$inferSelect;

function settingsView(row: SettingsRow) {
	return {
		enabled: row.datev_enabled,
		recipient: row.datev_recipient,
		sender: row.datev_sender,
		updated_at: row.datev_updated_at.toISOString(),
	};
}

export async function getDatevSettings() {
	const [row] = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.id, 1));
	if (!row)
		throw new ORPCError("PRECONDITION_FAILED", {
			message: "Die Einstellungen fehlen.",
		});
	return settingsView(row);
}

export async function updateDatevSettings(
	input: v.InferOutput<typeof DatevSettingsSchema>,
	audit: Audit,
) {
	if (input.enabled && (!input.sender || !input.recipient)) {
		throw new ORPCError("BAD_REQUEST", {
			message:
				"Für DATEV bitte Zieladresse und freigeschalteten Absender eintragen.",
		});
	}
	return db.transaction(async (tx) => {
		const stamp = await claimSettingsGroup(
			tx,
			"datev_updated_at",
			input.expected_updated_at,
		);
		stamp.setTime(
			Math.max(stamp.getTime(), Date.parse(input.expected_updated_at) + 1),
		);
		const [row] = await tx
			.update(appSettings)
			.set({
				datev_enabled: input.enabled,
				datev_recipient: input.recipient,
				datev_sender: input.sender,
				datev_updated_at: stamp,
				updated_at: stamp,
			})
			.where(eq(appSettings.id, 1))
			.returning();
		await recordAuditEventStrict(tx, {
			...audit,
			category: "settings",
			action: "settings.datev_changed",
			subject: { type: "settings", id: "datev", label: "DATEV Kasse" },
			metadata: {
				enabled: input.enabled,
				recipient: input.recipient,
				sender: input.sender,
			},
		});
		return settingsView(row);
	});
}

function deliveryWhere(id: string, document: DatevDocument) {
	return and(
		eq(datevDeliveries.protokoll_id, id),
		eq(datevDeliveries.document, document),
	);
}

function pdfKey(row: typeof protokolle.$inferSelect, document: DatevDocument) {
	return document === "original"
		? row.pdf_s3_key
		: row.storniert_am
			? row.storno_pdf_s3_key
			: null;
}

export async function getDatevStatus(id: string) {
	const [row] = await db.select().from(protokolle).where(eq(protokolle.id, id));
	if (!row)
		throw new ORPCError("NOT_FOUND", { message: "Protokoll nicht gefunden." });
	const [settings, deliveries] = await Promise.all([
		getDatevSettings(),
		db
			.select({
				document: datevDeliveries.document,
				state: datevDeliveries.state,
				attempt_id: datevDeliveries.attempt_id,
				revision: datevDeliveries.revision,
				recipient: datevDeliveries.recipient,
				sender: datevDeliveries.sender,
				started_at: datevDeliveries.started_at,
				sent_at: datevDeliveries.sent_at,
				can_resolve: sql<boolean>`${datevDeliveries.state} IN ('uncertain', 'sent') OR (${datevDeliveries.state} = 'sending' AND ${datevDeliveries.started_at} < now() - interval '5 minutes')`,
			})
			.from(datevDeliveries)
			.where(eq(datevDeliveries.protokoll_id, id)),
	]);
	return {
		settings,
		documents: (
			["original", ...(row.storniert_am ? ["storno"] : [])] as DatevDocument[]
		).map((document) => ({
			document,
			pdf_key: pdfKey(row, document),
			delivery: deliveries.find((d) => d.document === document) ?? null,
		})),
	};
}

export function validateDatevPdf(buffer: Buffer) {
	if (
		buffer.length > 20_000_000 ||
		buffer.subarray(0, 5).toString() !== "%PDF-" ||
		!buffer.subarray(-128).toString().includes("%%EOF")
	) {
		throw new ORPCError("PRECONDITION_FAILED", {
			message:
				"Bitte ein gültiges PDF bis 20 MB erzeugen und erneut versuchen.",
		});
	}
}

// Injection keeps integration tests on real PostgreSQL while SMTP and storage
// stay synthetic. HTTP callers cannot supply these dependencies.
export async function sendDatevProtocol(
	input: SendInput,
	audit: Audit,
	deps = { download: downloadPdf, prepareMail: prepareDatevEmail },
) {
	const settings = await getDatevSettings();
	if (!settings.enabled || !settings.recipient || !settings.sender) {
		throw new ORPCError("PRECONDITION_FAILED", {
			message: "Bitte DATEV in den Einstellungen einrichten und aktivieren.",
		});
	}
	const [proto] = await db
		.select()
		.from(protokolle)
		.where(eq(protokolle.id, input.id));
	if (!proto)
		throw new ORPCError("NOT_FOUND", { message: "Protokoll nicht gefunden." });
	if (
		!pdfKey(proto, input.document) ||
		pdfKey(proto, input.document) !== input.expected_pdf_key
	) {
		throw new ORPCError("CONFLICT", {
			message: "Das PDF fehlt oder wurde geändert. Bitte neu laden.",
		});
	}
	let content: Buffer;
	let send: Awaited<ReturnType<typeof prepareDatevEmail>>;
	try {
		content = await deps.download(input.expected_pdf_key);
		validateDatevPdf(content);
		send = await deps.prepareMail(settings.sender);
	} catch (err) {
		if (err instanceof ORPCError) throw err;
		logger.error("DATEV-Versand konnte nicht vorbereitet werden", {
			err,
			protokollId: input.id,
		});
		throw new ORPCError("PRECONDITION_FAILED", {
			message:
				"PDF oder E-Mail-Versand nicht verfügbar. Bitte die Einstellungen prüfen und erneut versuchen.",
		});
	}
	const attemptId = randomUUID();
	const messageId = `<rendant-datev-${attemptId}@${settings.sender.split("@")[1]}>`;
	const subject = { type: "protokoll", id: input.id, label: proto.belegnummer };
	const claimed = await db.transaction(async (tx) => {
		// Serialize send claims against protocol updates and verify the exact PDF
		// the person reviewed before reserving the delivery.
		const [current] = await tx
			.select()
			.from(protokolle)
			.where(eq(protokolle.id, input.id))
			.for("update");
		const [config] = await tx
			.select()
			.from(appSettings)
			.where(eq(appSettings.id, 1))
			.for("share");
		if (
			!current ||
			pdfKey(current, input.document) !== input.expected_pdf_key ||
			!config?.datev_enabled ||
			config.datev_updated_at.toISOString() !==
				input.expected_settings_updated_at ||
			config.datev_recipient !== settings.recipient ||
			config.datev_sender !== settings.sender
		) {
			throw new ORPCError("CONFLICT", {
				message:
					"PDF oder DATEV-Einstellungen wurden geändert. Bitte neu laden und erneut prüfen.",
			});
		}
		const [previous] = await tx
			.select()
			.from(datevDeliveries)
			.where(deliveryWhere(input.id, input.document))
			.for("update");
		if (previous && previous.state !== "ready") return false;
		if ((previous?.attempt_id ?? null) !== input.expected_delivery_attempt_id) {
			throw new ORPCError("CONFLICT", {
				message:
					"Der Versand wurde zwischenzeitlich geklärt. Bitte neu laden und den neuen Versuch ausdrücklich bestätigen.",
			});
		}
		const values = {
			protokoll_id: input.id,
			document: input.document,
			state: "sending" as const,
			attempt_id: attemptId,
			revision: 0,
			pdf_key: input.expected_pdf_key,
			pdf_bytes_sha256: createHash("sha256").update(content).digest("hex"),
			recipient: settings.recipient,
			sender: settings.sender,
			requested_by: audit.actor.id,
			started_at: new Date(),
			sent_at: null,
			message_id: messageId,
		};
		if (previous)
			await tx
				.update(datevDeliveries)
				.set(values)
				.where(deliveryWhere(input.id, input.document));
		else await tx.insert(datevDeliveries).values(values);
		await recordAuditEventStrict(tx, {
			...audit,
			category: "protokolle",
			action: "protokolle.datev_requested",
			subject,
			metadata: {
				document: input.document,
				attempt_id: attemptId,
				recipient: settings.recipient,
				sender: settings.sender,
				pdf_key: input.expected_pdf_key,
				pdf_bytes_sha256: values.pdf_bytes_sha256,
			},
		});
		return true;
	});
	if (!claimed) return { status: "already_claimed" as const };
	try {
		const filename = `Beleg_${proto.belegnummer.replace(/[^a-zA-Z0-9_-]/g, "_")}${input.document === "storno" ? "_STORNO" : ""}.pdf`;
		await send({
			to: settings.recipient,
			filename,
			content,
			messageId,
			subject: `Kassenbeleg ${proto.belegnummer}${input.document === "storno" ? " Storno" : ""}`,
		});
		await db.transaction(async (tx) => {
			await tx
				.update(datevDeliveries)
				.set({
					state: "sent",
					sent_at: new Date(),
					revision: sql`${datevDeliveries.revision} + 1`,
				})
				.where(
					and(
						deliveryWhere(input.id, input.document),
						eq(datevDeliveries.attempt_id, attemptId),
						eq(datevDeliveries.state, "sending"),
					),
				);
			await recordAuditEventStrict(tx, {
				...audit,
				category: "protokolle",
				action: "protokolle.datev_sent",
				subject,
				metadata: {
					document: input.document,
					attempt_id: attemptId,
					message_id: messageId,
				},
			});
		});
		return { status: "sent" as const };
	} catch (err) {
		logger.error("DATEV-Versand unklar", {
			err,
			protokollId: input.id,
			attemptId,
		});
		// Never auto-retry after SMTP started, even if persistence failed after
		// acceptance. A process crash leaves 'sending' for manual reconciliation.
		await db
			.transaction(async (tx) => {
				await tx
					.update(datevDeliveries)
					.set({
						state: "uncertain",
						revision: sql`${datevDeliveries.revision} + 1`,
					})
					.where(
						and(
							deliveryWhere(input.id, input.document),
							eq(datevDeliveries.attempt_id, attemptId),
							eq(datevDeliveries.state, "sending"),
						),
					);
				await recordAuditEventStrict(tx, {
					...audit,
					category: "protokolle",
					action: "protokolle.datev_uncertain",
					success: false,
					subject,
					metadata: { document: input.document, attempt_id: attemptId },
				});
			})
			.catch((persistErr) =>
				logger.error("DATEV-Versandstatus konnte nicht gespeichert werden", {
					err: persistErr,
					attemptId,
				}),
			);
		throw new ORPCError("BAD_GATEWAY", {
			message:
				"Der Versand ist unklar. Bitte zuerst DATEV und die DATEV-Rückmeldung per E-Mail prüfen. Nicht erneut senden.",
		});
	}
}

export async function resolveDatevDelivery(input: ResolveInput, audit: Audit) {
	return db.transaction(async (tx) => {
		const rows = await tx
			.update(datevDeliveries)
			.set({
				state: input.outcome,
				revision: sql`${datevDeliveries.revision} + 1`,
				sent_at: input.outcome === "sent" ? new Date() : null,
			})
			.where(
				and(
					deliveryWhere(input.id, input.document),
					eq(datevDeliveries.attempt_id, input.attempt_id),
					eq(datevDeliveries.revision, input.expected_revision),
					sql`(${datevDeliveries.state} IN ('uncertain', 'sent') OR (${datevDeliveries.state} = 'sending' AND ${datevDeliveries.started_at} < now() - interval '5 minutes'))`,
				),
			)
			.returning();
		if (!rows.length)
			throw new ORPCError("CONFLICT", {
				message:
					"Der Versand läuft noch oder wurde bereits geklärt. Bitte neu laden.",
			});
		await recordAuditEventStrict(tx, {
			...audit,
			category: "protokolle",
			action: "protokolle.datev_resolved",
			subject: { type: "protokoll", id: input.id },
			metadata: {
				document: input.document,
				attempt_id: input.attempt_id,
				outcome: input.outcome,
				reason: input.reason,
			},
		});
		return { ok: true };
	});
}
