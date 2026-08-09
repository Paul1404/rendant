import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emptyCounts } from "@/lib/denominations";
import { db, pool } from "@/server/db";
import {
	anlassKatalog,
	auditEvents,
	historicalProtocolImportDrafts,
	historicalRevenues,
	protokolle,
} from "@/server/db/schema";
import {
	analyzeHistoricalProtocolImportDraft,
	createHistoricalProtocolImportDraft,
	HistoricalProtocolDraftConflictError,
	queryHistoricalProtocolImportDraftItems,
	updateHistoricalProtocolImportDraftItem,
} from "@/server/services/historical-protocol-import-draft";
import {
	cancelHistoricalRevenue,
	createHistoricalRevenue,
	HistoricalRevenueConflictError,
} from "@/server/services/historical-revenue";
import { createProtokoll } from "@/server/services/protokoll";

const actor = {
	id: "integration-user",
	email: "integration@example.invalid",
	name: "Integration Test",
	role: "admin",
};
const audit = { request: { id: randomUUID(), ip: "127.0.0.1" } };

beforeAll(async () => {
	if (process.env.RENDANT_INTEGRATION_TEST !== "1") {
		throw new Error(
			"Integration tests require RENDANT_INTEGRATION_TEST=1 and an isolated database",
		);
	}
	const result = await pool.query<{ database: string }>(
		"select current_database() as database",
	);
	if (!result.rows[0]?.database.endsWith("_test")) {
		throw new Error("Integration tests refuse to use a database without _test suffix");
	}
});

afterAll(async () => {
	await pool.end();
});

describe("PostgreSQL production paths", () => {
	it("has applied the business and auth migrations", async () => {
		const result = await db.execute<{
			protokolle: boolean;
			historical_revenues: boolean;
			auth_user: boolean;
		}>(sql`
			select
				to_regclass('public.protokolle') is not null as protokolle,
				to_regclass('public.historical_revenues') is not null as historical_revenues,
				to_regclass('public.user') is not null as auth_user
		`);

		expect(result.rows[0]).toEqual({
			protokolle: true,
			historical_revenues: true,
			auth_user: true,
		});
	});

	it("keeps idempotent creation single-winner under concurrent requests", async () => {
		const catalogId = randomUUID();
		const idempotencyKey = randomUUID();
		await db.insert(anlassKatalog).values({
			id: catalogId,
			name: `Integration ${catalogId}`,
			typ: "einmalig",
		});

		try {
			const input = {
				idempotency_key: idempotencyKey,
				anlass_datum: "2026-01-15",
				anlass_katalog_id: catalogId,
				umsatzbereich: "sonstiges" as const,
				veranstaltungsbezeichnung: "Paralleltest",
				umsatz_cent: 12_345,
				ausgaben_cent: 123,
				bemerkung: "",
				quellreferenz: "Integration",
			};
			const results = await Promise.all([
				createHistoricalRevenue(input, actor, audit),
				createHistoricalRevenue(input, actor, audit),
			]);

			expect(results.map((result) => result.created).sort()).toEqual([
				false,
				true,
			]);
			const rows = await db
				.select()
				.from(historicalRevenues)
				.where(eq(historicalRevenues.idempotency_key, idempotencyKey));
			expect(rows).toHaveLength(1);

			const cancellation = await Promise.allSettled([
				cancelHistoricalRevenue(rows[0].id, "Integrationstest", actor, audit),
				cancelHistoricalRevenue(rows[0].id, "Integrationstest", actor, audit),
			]);
			expect(cancellation.filter((result) => result.status === "fulfilled")).toHaveLength(
				1,
			);
			const rejected = cancellation.find(
				(result) => result.status === "rejected",
			);
			expect(rejected?.status).toBe("rejected");
			if (rejected?.status === "rejected") {
				expect(rejected.reason).toBeInstanceOf(HistoricalRevenueConflictError);
			}
		} finally {
			await db
				.delete(historicalRevenues)
				.where(eq(historicalRevenues.idempotency_key, idempotencyKey));
			await db.delete(anlassKatalog).where(eq(anlassKatalog.id, catalogId));
		}
	});

	it("rejects concurrent edits against the same import draft revision", async () => {
		const digest = randomUUID().replaceAll("-", "").padEnd(64, "a");
		const sourceHash = randomUUID().replaceAll("-", "").padEnd(64, "b");
		const preview = {
			valid: true,
			digest,
			folderName: "Integration/Zählprotokolle",
			files: 1,
			spreadsheetFiles: 1,
			statusCounts: {
				ready: 1,
				review: 0,
				already_imported: 0,
				existing_protocol: 0,
				duplicate_file: 0,
				skipped: 0,
				error: 0,
			},
			toImport: 1,
			reviewRequired: 0,
			totals: {
				revenueCent: 10_000,
				expensesCent: 0,
				cashCent: 10_000,
				cardCent: 0,
			},
			coverage: {
				years: [2020],
				withDenominations: 0,
				withVat: 0,
				withCard: 0,
				withCashRegister: 1,
			},
			classifications: [],
			rows: [
				{
					fileIndex: 0,
					path: "2020/Test.xlsx",
					status: "ready" as const,
					statusReason: "Vollständig erkannt",
					date: "2020-01-15",
					detail: "Integration",
					classificationKey: "integration",
					suggestedArea: "sonstiges" as const,
					classificationConfidence: "high" as const,
					revenueCent: 10_000,
					expensesCent: 0,
					source: {
						sha256: sourceHash,
						contentFingerprint: sourceHash,
						path: "2020/Test.xlsx",
						format: "xlsx" as const,
						protocolNumber: "1",
						cashRegisterNumber: "1",
						cashRegisterLabel: "Integration",
						countedBy: "Integration Test",
						openingCent: 0,
						cardCent: 0,
						countedCent: 10_000,
						cashRevenueCent: 10_000,
						denominations: null,
						vat: [],
						warnings: [],
						dateOrigin: "workbook" as const,
					},
				},
			],
		};

		const draft = await createHistoricalProtocolImportDraft(preview, actor, audit);
		try {
			const analysis = await analyzeHistoricalProtocolImportDraft({
				id: draft.id,
				decision: "include",
			});
			expect(analysis).toMatchObject({
				matched: 1,
				totals: { revenueCent: 10_000, expensesCent: 0, cardCent: 0 },
			});
			expect(analysis.facets.classificationKeys).toEqual([
				{ value: "integration", count: 1 },
			]);

			const page = await queryHistoricalProtocolImportDraftItems({
				id: draft.id,
				page: 1,
				page_size: 1,
				sort: "file_index",
				direction: "asc",
				include_evidence: false,
			});
			expect(page).toMatchObject({ total: 1, pageCount: 1 });
			expect(page.items[0]).toMatchObject({
				path: "2020/Test.xlsx",
				evidence: { dateOrigin: "workbook", warnings: [] },
			});

			const input = {
				draft_id: draft.id,
				item_id: draft.items[0].id,
				expected_revision: draft.revision,
			};
			const results = await Promise.allSettled([
				updateHistoricalProtocolImportDraftItem(
					{ ...input, decision: "exclude" as const },
					actor,
					audit,
				),
				updateHistoricalProtocolImportDraftItem(
					{ ...input, decision: "review" as const },
					actor,
					audit,
				),
			]);
			expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(
				1,
			);
			const rejected = results.find((result) => result.status === "rejected");
			if (rejected?.status === "rejected") {
				expect(rejected.reason).toBeInstanceOf(
					HistoricalProtocolDraftConflictError,
				);
			}
		} finally {
			await db
				.delete(historicalProtocolImportDrafts)
				.where(eq(historicalProtocolImportDrafts.id, draft.id));
		}
	});

	it("creates one protocol and one audit event for concurrent replays", async () => {
		const idempotencyKey = randomUUID();
		const requestId = randomUUID();
		const input = {
			...emptyCounts(),
			idempotency_key: idempotencyKey,
			anlass_datum: "2026-01-16",
			veranstaltungsbezeichnung: "Paralleles Kassenprotokoll",
			umsatzbereich: "sonstiges" as const,
			kassennummer: "INTEGRATION",
			kassenbezeichnung: "Integrationstest",
			gezaehlt_von: "Integration Test",
			geprueft_von: "",
			bemerkung: "",
			wechselgeld_cent: 0,
			kartenzahlung_cent: 0,
			ausgaben: [],
			umsatz_ust: [],
			umsatz_ust_basis: "post_card" as const,
		};

		const results = await Promise.all([
			createProtokoll(input, actor, { request: { id: requestId } }),
			createProtokoll(input, actor, { request: { id: requestId } }),
		]);
		const protocolId = results[0].id;

		try {
			expect(results.map((result) => result.created).sort()).toEqual([
				false,
				true,
			]);
			expect(new Set(results.map((result) => result.id))).toEqual(
				new Set([protocolId]),
			);
			const stored = await db
				.select({ id: protokolle.id })
				.from(protokolle)
				.where(eq(protokolle.idempotency_key, idempotencyKey));
			expect(stored).toHaveLength(1);
			const audits = await db
				.select({ id: auditEvents.id })
				.from(auditEvents)
				.where(
					and(
						eq(auditEvents.action, "protokolle.created"),
						eq(auditEvents.subject_id, protocolId),
					),
				);
			expect(audits).toHaveLength(1);
			await expect(
				pool.query("update audit_events set success = false where id = $1", [
					audits[0].id,
				]),
			).rejects.toThrow(/append-only/);
		} finally {
			await db.delete(protokolle).where(eq(protokolle.id, protocolId));
		}
	});

	it("cancels an overlong query and leaves the pool usable", async () => {
		const startedAt = Date.now();
		await expect(pool.query("select pg_sleep(5)")).rejects.toThrow();
		expect(Date.now() - startedAt).toBeLessThan(4_000);
		await expect(pool.query("select 1 as ok")).resolves.toMatchObject({
			rows: [{ ok: 1 }],
		});
	});
});
