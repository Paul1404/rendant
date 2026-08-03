import { createHash } from "node:crypto";
import { and, inArray, isNull } from "drizzle-orm";
import type {
	HistoricalProtocolClassification,
	HistoricalProtocolClassificationOverrides,
	HistoricalProtocolParsedRow,
	HistoricalProtocolPreview,
} from "@/lib/historical-protocol-import";
import { isUmsatzbereich } from "@/lib/umsatzbereich";
import { db } from "@/server/db";
import { historicalRevenues, protokolle } from "@/server/db/schema";
import type { AuthUser } from "@/server/orpc/base";
import {
	type RecordAuditInput,
	recordAuditEventStrict,
} from "@/server/services/audit";
import { createHistoricalRevenueWithDb } from "@/server/services/historical-revenue";
import type { RevenueImportRow } from "@/server/services/revenue-import-xlsx";

export type HistoricalRevenueImportResult = {
	created: number;
	skipped: number;
};

function sourceUuid(sha256: string): string {
	const bytes = createHash("sha256")
		.update(`historical-protocol-folder:v1:${sha256}`)
		.digest()
		.subarray(0, 16);
	bytes[6] = (bytes[6] & 0x0f) | 0x50;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = bytes.toString("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function enrichHistoricalProtocolPreview(
	preview: HistoricalProtocolPreview,
): Promise<HistoricalProtocolPreview> {
	const candidates = preview.rows.filter(
		(row) =>
			(row.status === "ready" || row.status === "review") &&
			row.source &&
			row.date &&
			row.revenueCent != null,
	);
	if (candidates.length === 0) return preview;
	const hashes = candidates.map((row) => row.source?.sha256 ?? "");
	const dates = Array.from(
		new Set(candidates.flatMap((row) => (row.date ? [row.date] : []))),
	);
	const [existingSources, existingProtocols] = await Promise.all([
		db
			.select({ sha256: historicalRevenues.quelle_sha256 })
			.from(historicalRevenues)
			.where(inArray(historicalRevenues.quelle_sha256, hashes)),
		db
			.select({
				date: protokolle.anlass_datum,
				belegnummer: protokolle.belegnummer,
				revenueCashCent: protokolle.tageseinnahmen_cent,
				revenueCardCent: protokolle.kartenzahlung_cent,
				cashRegisterNumber: protokolle.kassennummer,
			})
			.from(protokolle)
			.where(
				and(
					inArray(protokolle.anlass_datum, dates),
					isNull(protokolle.storniert_am),
				),
			),
	]);
	const importedHashes = new Set(
		existingSources.flatMap((entry) => (entry.sha256 ? [entry.sha256] : [])),
	);
	for (const row of candidates) {
		if (!row.source || !row.date || row.revenueCent == null) continue;
		if (importedHashes.has(row.source.sha256)) {
			row.status = "already_imported";
			row.statusReason = "Diese Quelldatei wurde bereits importiert";
			continue;
		}
		const sourceNumber = row.source.protocolNumber?.replace(/^0+/, "");
		const exactProtocol = existingProtocols.find((entry) => {
			const existingNumber = entry.belegnummer.replace(/^0+/, "");
			const sameNumber =
				Boolean(sourceNumber) && existingNumber === sourceNumber;
			const sameRegister =
				Boolean(row.source?.cashRegisterNumber) &&
				entry.cashRegisterNumber === row.source?.cashRegisterNumber;
			return (
				entry.date === row.date &&
				entry.revenueCashCent + entry.revenueCardCent === row.revenueCent &&
				(sameNumber || sameRegister)
			);
		});
		if (exactProtocol) {
			row.status = "existing_protocol";
			row.statusReason = `Bereits als Rendant-Protokoll ${exactProtocol.belegnummer} vorhanden`;
		}
	}
	return recalculatePreview(preview);
}

function recalculatePreview(
	preview: HistoricalProtocolPreview,
): HistoricalProtocolPreview {
	const importable = preview.rows.filter(
		(row) => row.status === "ready" || row.status === "review",
	);
	for (const key of Object.keys(preview.statusCounts) as Array<
		keyof typeof preview.statusCounts
	>) {
		preview.statusCounts[key] = 0;
	}
	for (const row of preview.rows) preview.statusCounts[row.status] += 1;
	preview.toImport = importable.length;
	preview.reviewRequired = preview.statusCounts.review;
	preview.valid = importable.length > 0;
	preview.totals = importable.reduce(
		(sum, row) => ({
			revenueCent: sum.revenueCent + (row.revenueCent ?? 0),
			expensesCent: sum.expensesCent + (row.expensesCent ?? 0),
			cashCent: sum.cashCent + (row.source?.cashRevenueCent ?? 0),
			cardCent: sum.cardCent + (row.source?.cardCent ?? 0),
		}),
		{ revenueCent: 0, expensesCent: 0, cashCent: 0, cardCent: 0 },
	);
	preview.coverage = {
		years: Array.from(
			new Set(
				importable.flatMap((row) =>
					row.date ? [Number(row.date.slice(0, 4))] : [],
				),
			),
		).sort((a, b) => a - b),
		withDenominations: importable.filter((row) => row.source?.denominations)
			.length,
		withVat: importable.filter((row) =>
			row.source?.vat.some((split) => split.betrag_cent > 0),
		).length,
		withCard: importable.filter((row) => (row.source?.cardCent ?? 0) > 0)
			.length,
		withCashRegister: importable.filter(
			(row) => row.source?.cashRegisterLabel || row.source?.cashRegisterNumber,
		).length,
	};
	const classifications = new Map<string, HistoricalProtocolClassification>();
	for (const row of importable) {
		const key = row.classificationKey || row.detail.toLocaleLowerCase("de-DE");
		const previous = classifications.get(key);
		if (previous) previous.count += 1;
		else {
			classifications.set(key, {
				key,
				label:
					key === "kassenprotokoll" ? "Ohne Kassenbezeichnung" : row.detail,
				count: 1,
				suggestedArea: row.suggestedArea,
				confidence: row.classificationConfidence,
			});
		}
	}
	preview.classifications = Array.from(classifications.values()).sort(
		(a, b) => b.count - a.count || a.label.localeCompare(b.label, "de"),
	);
	return preview;
}

export async function importHistoricalProtocolFolder(
	rows: HistoricalProtocolParsedRow[],
	overrides: HistoricalProtocolClassificationOverrides,
	includedReviewIndices: Set<number>,
	actor: AuthUser,
	audit: Omit<RecordAuditInput, "category" | "action" | "actor">,
): Promise<HistoricalRevenueImportResult> {
	const selected = rows.filter(
		(row) =>
			row.status === "ready" ||
			(row.status === "review" && includedReviewIndices.has(row.fileIndex)),
	);
	const selectedRevenueCent = selected.reduce(
		(sum, row) => sum + (row.revenueCent ?? 0),
		0,
	);
	const selectedExpensesCent = selected.reduce(
		(sum, row) => sum + (row.expensesCent ?? 0),
		0,
	);
	return db.transaction(async (tx) => {
		let created = 0;
		let skipped = 0;
		for (const row of selected) {
			if (
				!row.source ||
				!row.date ||
				row.revenueCent == null ||
				row.expensesCent == null
			) {
				skipped += 1;
				continue;
			}
			const override = overrides[row.classificationKey];
			const area = isUmsatzbereich(override) ? override : row.suggestedArea;
			const result = await createHistoricalRevenueWithDb(
				tx,
				{
					idempotency_key: sourceUuid(row.source.sha256),
					anlass_datum: row.date,
					anlass_katalog_id: null,
					umsatzbereich: area,
					veranstaltungsbezeichnung: row.detail,
					umsatz_cent: row.revenueCent,
					ausgaben_cent: row.expensesCent,
					quellreferenz:
						`${row.source.path} · SHA256 ${row.source.sha256}`.slice(0, 500),
					bemerkung:
						row.source.warnings.length > 0
							? `Automatischer Altprotokoll-Import. ${row.source.warnings.join(". ")}.`.slice(
									0,
									2000,
								)
							: "Automatischer Altprotokoll-Import.",
				},
				actor,
				{ allowDifferentActor: true, source: row.source },
			);
			if (result.created) created += 1;
			else skipped += 1;
		}
		await recordAuditEventStrict(tx, {
			...audit,
			category: "umsaetze",
			action: "umsaetze.protocol_folder_imported",
			actor,
			metadata: {
				...audit.metadata,
				umsatz_cent: selectedRevenueCent,
				ausgaben_cent: selectedExpensesCent,
				dateien: rows.length,
				ausgewählt: selected.length,
				angelegt: created,
				übersprungen: skipped,
				prüffälle_eingeschlossen: selected.filter(
					(row) => row.status === "review",
				).length,
			},
		});
		return { created, skipped };
	});
}

function nullableText(value: string | null | undefined): string | null {
	return value || null;
}

function matchesImportedRow(
	existing: typeof historicalRevenues.$inferSelect,
	row: RevenueImportRow,
): boolean {
	return (
		existing.anlass_datum === row.anlass_datum &&
		existing.anlass_katalog_id === row.anlass_katalog_id &&
		existing.anlass ===
			`${existing.vergleichsgruppe} · ${row.veranstaltungsbezeichnung}` &&
		existing.umsatz_cent === row.umsatz_cent &&
		existing.ausgaben_cent === row.ausgaben_cent &&
		existing.bemerkung === nullableText(row.bemerkung) &&
		existing.quellreferenz === nullableText(row.quellreferenz)
	);
}

export async function inspectPreviouslyImportedRows(
	rows: RevenueImportRow[],
): Promise<{
	alreadyImported: Set<number>;
	conflicts: Set<number>;
}> {
	if (rows.length === 0) {
		return { alreadyImported: new Set(), conflicts: new Set() };
	}
	const existing = await db
		.select()
		.from(historicalRevenues)
		.where(
			inArray(
				historicalRevenues.idempotency_key,
				rows.map((row) => row.idempotency_key),
			),
		);
	const byKey = new Map(
		existing.map((entry) => [entry.idempotency_key, entry]),
	);
	const alreadyImported = new Set<number>();
	const conflicts = new Set<number>();
	for (const row of rows) {
		const previous = byKey.get(row.idempotency_key);
		if (!previous) continue;
		if (matchesImportedRow(previous, row)) alreadyImported.add(row.rowNumber);
		else conflicts.add(row.rowNumber);
	}
	return { alreadyImported, conflicts };
}

export async function findPotentialHistoricalRevenueDuplicates(
	rows: RevenueImportRow[],
): Promise<Set<number>> {
	if (rows.length === 0) return new Set();
	const dates = Array.from(new Set(rows.map((row) => row.anlass_datum)));
	const existing = await db
		.select()
		.from(historicalRevenues)
		.where(
			and(
				inArray(historicalRevenues.anlass_datum, dates),
				isNull(historicalRevenues.storniert_am),
			),
		);
	const duplicates = new Set<number>();
	for (const row of rows) {
		if (
			existing.some(
				(entry) =>
					entry.idempotency_key !== row.idempotency_key &&
					entry.anlass_datum === row.anlass_datum &&
					entry.anlass_katalog_id === row.anlass_katalog_id &&
					entry.anlass ===
						`${entry.vergleichsgruppe} · ${row.veranstaltungsbezeichnung}` &&
					entry.umsatz_cent === row.umsatz_cent &&
					entry.ausgaben_cent === row.ausgaben_cent,
			)
		) {
			duplicates.add(row.rowNumber);
		}
	}
	return duplicates;
}

export async function importHistoricalRevenues(
	rows: RevenueImportRow[],
	actor: AuthUser,
	audit: Omit<RecordAuditInput, "category" | "action" | "actor">,
): Promise<HistoricalRevenueImportResult> {
	return db.transaction(async (tx) => {
		let created = 0;
		let skipped = 0;
		for (const row of rows) {
			const result = await createHistoricalRevenueWithDb(tx, row, actor, {
				allowDifferentActor: true,
			});
			if (result.created) created += 1;
			else skipped += 1;
		}
		await recordAuditEventStrict(tx, {
			...audit,
			category: "umsaetze",
			action: "umsaetze.imported",
			actor,
			metadata: {
				...audit.metadata,
				zeilen: rows.length,
				angelegt: created,
				übersprungen: skipped,
			},
		});
		return { created, skipped };
	});
}
