import { and, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import type * as v from "valibot";
import type {
	HistoricalProtocolDraftDecision,
	HistoricalProtocolDraftDetail,
	HistoricalProtocolDraftItem,
	HistoricalProtocolDraftSummary,
	HistoricalProtocolParsedRow,
	HistoricalProtocolPreview,
} from "@/lib/historical-protocol-import";
import type {
	HistoricalProtocolDraftBulkUpdateSchema,
	HistoricalProtocolDraftUpdateItemSchema,
} from "@/lib/schemas";
import { isUmsatzbereich } from "@/lib/umsatzbereich";
import { type DbOrTx, db } from "@/server/db";
import {
	historicalProtocolImportDrafts,
	historicalProtocolImportItems,
} from "@/server/db/schema";
import type { AuthUser } from "@/server/orpc/base";
import {
	type RecordAuditInput,
	recordAuditEventStrict,
} from "@/server/services/audit";
import { createHistoricalRevenueWithDb } from "@/server/services/historical-revenue";
import { historicalProtocolSourceUuid } from "@/server/services/historical-revenue-import";

type UpdateItemInput = v.InferOutput<
	typeof HistoricalProtocolDraftUpdateItemSchema
>;
type BulkUpdateInput = v.InferOutput<
	typeof HistoricalProtocolDraftBulkUpdateSchema
>;

export class HistoricalProtocolDraftNotFoundError extends Error {}
export class HistoricalProtocolDraftConflictError extends Error {}
export class HistoricalProtocolDraftValidationError extends Error {
	constructor(
		message: string,
		readonly validation: HistoricalProtocolDraftValidation,
	) {
		super(message);
	}
}

export type HistoricalProtocolDraftValidation = {
	valid: boolean;
	include: number;
	review: number;
	exclude: number;
	invalidIncluded: Array<{
		id: string;
		path: string;
		reasons: string[];
	}>;
};

function defaultDecision(
	row: HistoricalProtocolParsedRow,
): HistoricalProtocolDraftDecision {
	if (row.status === "ready") return "include";
	if (row.status === "review") return "review";
	return "exclude";
}

function itemReasons(item: HistoricalProtocolDraftItem): string[] {
	if (item.decision !== "include") return [];
	const reasons: string[] = [];
	if (!item.detected.source) reasons.push("Keine lesbare Quelldatei");
	if (!item.date) reasons.push("Datum fehlt");
	if (!item.detail.trim()) reasons.push("Details fehlen");
	if (!item.area) reasons.push("Umsatzbereich fehlt");
	if (item.revenueCent == null) reasons.push("Umsatz fehlt");
	if (item.expensesCent == null) reasons.push("Ausgaben fehlen");
	return reasons;
}

function mapItem(
	row: typeof historicalProtocolImportItems.$inferSelect,
): HistoricalProtocolDraftItem {
	return {
		id: row.id,
		draftId: row.draft_id,
		fileIndex: row.file_index,
		path: row.path,
		parserStatus:
			row.parser_status as HistoricalProtocolDraftItem["parserStatus"],
		parserReason: row.parser_reason,
		decision: row.decision as HistoricalProtocolDraftDecision,
		date: row.effective_date,
		detail: row.detail,
		area: isUmsatzbereich(row.umsatzbereich) ? row.umsatzbereich : null,
		revenueCent: row.revenue_cent,
		expensesCent: row.expenses_cent,
		classificationKey: row.classification_key,
		classificationConfidence:
			row.classification_confidence as HistoricalProtocolDraftItem["classificationConfidence"],
		correctionNote: row.correction_note,
		detected: row.detected_row,
		revision: row.revision,
		updatedAt: row.updated_at,
		updatedByName: row.updated_by_name,
	};
}

function summarize(
	draft: typeof historicalProtocolImportDrafts.$inferSelect,
	items: HistoricalProtocolDraftItem[],
): HistoricalProtocolDraftSummary {
	const included = items.filter((item) => item.decision === "include");
	return {
		id: draft.id,
		folderName: draft.folder_name,
		digest: draft.digest,
		status: draft.status as HistoricalProtocolDraftSummary["status"],
		revision: draft.revision,
		files: draft.files,
		spreadsheetFiles: draft.spreadsheet_files,
		createdAt: draft.created_at,
		updatedAt: draft.updated_at,
		createdByName: draft.created_by_name,
		importedAt: draft.imported_at,
		resultCreated: draft.result_created,
		resultSkipped: draft.result_skipped,
		counts: {
			include: included.length,
			review: items.filter((item) => item.decision === "review").length,
			exclude: items.filter((item) => item.decision === "exclude").length,
			invalidIncluded: included.filter((item) => itemReasons(item).length > 0)
				.length,
		},
		totals: included.reduce(
			(sum, item) => ({
				revenueCent: sum.revenueCent + (item.revenueCent ?? 0),
				expensesCent: sum.expensesCent + (item.expensesCent ?? 0),
				cardCent: sum.cardCent + (item.detected.source?.cardCent ?? 0),
			}),
			{ revenueCent: 0, expensesCent: 0, cardCent: 0 },
		),
	};
}

async function loadDraft(
	database: DbOrTx,
	id: string,
): Promise<HistoricalProtocolDraftDetail | null> {
	const [draft] = await database
		.select()
		.from(historicalProtocolImportDrafts)
		.where(eq(historicalProtocolImportDrafts.id, id))
		.limit(1);
	if (!draft) return null;
	const items = (
		await database
			.select()
			.from(historicalProtocolImportItems)
			.where(eq(historicalProtocolImportItems.draft_id, id))
			.orderBy(historicalProtocolImportItems.file_index)
	).map(mapItem);
	return { ...summarize(draft, items), items };
}

export async function getHistoricalProtocolImportDraft(
	id: string,
): Promise<HistoricalProtocolDraftDetail> {
	const draft = await loadDraft(db, id);
	if (!draft) {
		throw new HistoricalProtocolDraftNotFoundError(
			"Import-Entwurf nicht gefunden",
		);
	}
	return draft;
}

export async function listHistoricalProtocolImportDrafts(): Promise<
	HistoricalProtocolDraftSummary[]
> {
	const drafts = await db
		.select()
		.from(historicalProtocolImportDrafts)
		.orderBy(desc(historicalProtocolImportDrafts.updated_at));
	if (drafts.length === 0) return [];
	const rows = await db
		.select()
		.from(historicalProtocolImportItems)
		.where(
			inArray(
				historicalProtocolImportItems.draft_id,
				drafts.map((draft) => draft.id),
			),
		);
	const byDraft = new Map<string, HistoricalProtocolDraftItem[]>();
	for (const row of rows) {
		const items = byDraft.get(row.draft_id) ?? [];
		items.push(mapItem(row));
		byDraft.set(row.draft_id, items);
	}
	return drafts.map((draft) => summarize(draft, byDraft.get(draft.id) ?? []));
}

export async function createHistoricalProtocolImportDraft(
	preview: HistoricalProtocolPreview,
	actor: AuthUser,
	audit: Omit<RecordAuditInput, "category" | "action" | "actor">,
): Promise<HistoricalProtocolDraftDetail> {
	const id = await db.transaction(async (tx) => {
		const [created] = await tx
			.insert(historicalProtocolImportDrafts)
			.values({
				digest: preview.digest,
				folder_name: preview.folderName.slice(0, 500),
				files: preview.files,
				spreadsheet_files: preview.spreadsheetFiles,
				created_by_user_id: actor.id,
				created_by_name: actor.name,
				created_by_email: actor.email,
			})
			.onConflictDoNothing({
				target: historicalProtocolImportDrafts.digest,
			})
			.returning({ id: historicalProtocolImportDrafts.id });
		if (!created) {
			const [existing] = await tx
				.select({ id: historicalProtocolImportDrafts.id })
				.from(historicalProtocolImportDrafts)
				.where(eq(historicalProtocolImportDrafts.digest, preview.digest))
				.limit(1);
			if (!existing)
				throw new Error("Import-Entwurf konnte nicht geladen werden");
			return existing.id;
		}

		for (let offset = 0; offset < preview.rows.length; offset += 250) {
			const chunk = preview.rows.slice(offset, offset + 250);
			await tx.insert(historicalProtocolImportItems).values(
				chunk.map((row) => ({
					draft_id: created.id,
					file_index: row.fileIndex,
					path: row.path,
					parser_status: row.status,
					parser_reason: row.statusReason,
					decision: defaultDecision(row),
					effective_date: row.date,
					detail: (row.detail || "Unbekannter Altumsatz").slice(0, 120),
					umsatzbereich:
						row.source && row.classificationConfidence !== "low"
							? row.suggestedArea
							: null,
					revenue_cent: row.revenueCent,
					expenses_cent: row.expensesCent,
					classification_key: row.classificationKey.slice(0, 160),
					classification_confidence: row.classificationConfidence,
					detected_row: row,
					updated_by_user_id: actor.id,
					updated_by_name: actor.name,
				})),
			);
		}
		await recordAuditEventStrict(tx, {
			...audit,
			category: "umsaetze",
			action: "umsaetze.protocol_import_draft_created",
			actor,
			subject: {
				type: "historischer_protokollordner_entwurf",
				id: created.id,
				label: preview.folderName,
			},
			metadata: {
				...audit.metadata,
				dateien: preview.files,
				erkannt: preview.spreadsheetFiles,
				importierbar: preview.statusCounts.ready,
				prüffälle: preview.statusCounts.review,
			},
		});
		return created.id;
	});
	return getHistoricalProtocolImportDraft(id);
}

function assertCorrectionNote(
	current: HistoricalProtocolDraftItem,
	input: UpdateItemInput,
): void {
	const changedWorkingValue =
		(input.date !== undefined && input.date !== current.date) ||
		(input.detail !== undefined && input.detail !== current.detail) ||
		(input.umsatzbereich !== undefined &&
			input.umsatzbereich !== current.area) ||
		(input.umsatz_cent !== undefined &&
			input.umsatz_cent !== current.revenueCent) ||
		(input.ausgaben_cent !== undefined &&
			input.ausgaben_cent !== current.expensesCent);
	const note = input.korrekturhinweis ?? current.correctionNote;
	const confirmsUncertainRow =
		input.decision === "include" &&
		current.decision !== "include" &&
		current.parserStatus !== "ready";
	if (
		(changedWorkingValue || confirmsUncertainRow) &&
		(!note || note.trim().length < 3)
	) {
		throw new HistoricalProtocolDraftValidationError(
			"Für korrigierte oder unsicher erkannte Werte ist ein kurzer Korrekturhinweis erforderlich",
			{ valid: false, include: 0, review: 0, exclude: 0, invalidIncluded: [] },
		);
	}
}

async function advanceEditingDraft(
	database: DbOrTx,
	id: string,
	expectedRevision: number,
): Promise<number> {
	const [updated] = await database
		.update(historicalProtocolImportDrafts)
		.set({
			revision: sql`${historicalProtocolImportDrafts.revision} + 1`,
			updated_at: new Date(),
		})
		.where(
			and(
				eq(historicalProtocolImportDrafts.id, id),
				eq(historicalProtocolImportDrafts.status, "editing"),
				eq(historicalProtocolImportDrafts.revision, expectedRevision),
			),
		)
		.returning({ revision: historicalProtocolImportDrafts.revision });
	if (!updated) {
		throw new HistoricalProtocolDraftConflictError(
			"Der Import-Entwurf wurde zwischenzeitlich geändert. Bitte neu laden.",
		);
	}
	return updated.revision;
}

export async function updateHistoricalProtocolImportDraftItem(
	input: UpdateItemInput,
	actor: AuthUser,
	audit: Omit<RecordAuditInput, "category" | "action" | "actor">,
): Promise<HistoricalProtocolDraftDetail> {
	await db.transaction(async (tx) => {
		const [currentRow] = await tx
			.select()
			.from(historicalProtocolImportItems)
			.where(
				and(
					eq(historicalProtocolImportItems.id, input.item_id),
					eq(historicalProtocolImportItems.draft_id, input.draft_id),
				),
			)
			.limit(1);
		if (!currentRow) {
			throw new HistoricalProtocolDraftNotFoundError(
				"Importzeile nicht gefunden",
			);
		}
		const current = mapItem(currentRow);
		assertCorrectionNote(current, input);
		const revision = await advanceEditingDraft(
			tx,
			input.draft_id,
			input.expected_revision,
		);
		const values: Partial<typeof historicalProtocolImportItems.$inferInsert> = {
			revision: sql`${historicalProtocolImportItems.revision} + 1` as never,
			updated_at: new Date(),
			updated_by_user_id: actor.id,
			updated_by_name: actor.name,
		};
		if (input.decision !== undefined) values.decision = input.decision;
		if (input.date !== undefined) values.effective_date = input.date;
		if (input.detail !== undefined) values.detail = input.detail;
		if (input.umsatzbereich !== undefined)
			values.umsatzbereich = input.umsatzbereich;
		if (input.umsatz_cent !== undefined)
			values.revenue_cent = input.umsatz_cent;
		if (input.ausgaben_cent !== undefined)
			values.expenses_cent = input.ausgaben_cent;
		if (input.korrekturhinweis !== undefined)
			values.correction_note = input.korrekturhinweis || null;
		await tx
			.update(historicalProtocolImportItems)
			.set(values)
			.where(eq(historicalProtocolImportItems.id, input.item_id));
		await recordAuditEventStrict(tx, {
			...audit,
			category: "umsaetze",
			action: "umsaetze.protocol_import_draft_item_updated",
			actor,
			subject: {
				type: "historischer_protokollordner_entwurf",
				id: input.draft_id,
				label: current.path,
			},
			metadata: {
				...audit.metadata,
				zeile: current.fileIndex,
				revision,
				felder: Object.keys(input).filter(
					(key) => !["draft_id", "item_id", "expected_revision"].includes(key),
				),
			},
		});
	});
	return getHistoricalProtocolImportDraft(input.draft_id);
}

export async function bulkUpdateHistoricalProtocolImportDraftItems(
	input: BulkUpdateInput,
	actor: AuthUser,
	audit: Omit<RecordAuditInput, "category" | "action" | "actor">,
): Promise<HistoricalProtocolDraftDetail> {
	if (
		(input.umsatzbereich !== undefined || input.decision === "include") &&
		(!input.korrekturhinweis || input.korrekturhinweis.trim().length < 3)
	) {
		throw new HistoricalProtocolDraftValidationError(
			"Für die gesammelte Übernahme oder Korrektur ist ein Korrekturhinweis erforderlich",
			{ valid: false, include: 0, review: 0, exclude: 0, invalidIncluded: [] },
		);
	}
	await db.transaction(async (tx) => {
		const filters: SQL[] = [
			eq(historicalProtocolImportItems.draft_id, input.draft_id),
		];
		if (input.item_ids?.length)
			filters.push(inArray(historicalProtocolImportItems.id, input.item_ids));
		if (input.classification_key)
			filters.push(
				eq(
					historicalProtocolImportItems.classification_key,
					input.classification_key,
				),
			);
		if (input.parser_status)
			filters.push(
				eq(historicalProtocolImportItems.parser_status, input.parser_status),
			);
		if (input.parser_reason)
			filters.push(
				eq(historicalProtocolImportItems.parser_reason, input.parser_reason),
			);
		const revision = await advanceEditingDraft(
			tx,
			input.draft_id,
			input.expected_revision,
		);
		const values: Partial<typeof historicalProtocolImportItems.$inferInsert> = {
			revision: sql`${historicalProtocolImportItems.revision} + 1` as never,
			updated_at: new Date(),
			updated_by_user_id: actor.id,
			updated_by_name: actor.name,
		};
		if (input.decision !== undefined) values.decision = input.decision;
		if (input.umsatzbereich !== undefined)
			values.umsatzbereich = input.umsatzbereich;
		if (input.korrekturhinweis !== undefined)
			values.correction_note = input.korrekturhinweis || null;
		const changed = await tx
			.update(historicalProtocolImportItems)
			.set(values)
			.where(and(...filters))
			.returning({ id: historicalProtocolImportItems.id });
		if (changed.length === 0) {
			throw new HistoricalProtocolDraftNotFoundError(
				"Keine passenden Importzeilen gefunden",
			);
		}
		await recordAuditEventStrict(tx, {
			...audit,
			category: "umsaetze",
			action: "umsaetze.protocol_import_draft_bulk_updated",
			actor,
			subject: {
				type: "historischer_protokollordner_entwurf",
				id: input.draft_id,
			},
			metadata: {
				...audit.metadata,
				revision,
				geändert: changed.length,
				entscheidung: input.decision,
				umsatzbereich: input.umsatzbereich,
			},
		});
	});
	return getHistoricalProtocolImportDraft(input.draft_id);
}

export async function validateHistoricalProtocolImportDraft(
	id: string,
): Promise<HistoricalProtocolDraftValidation> {
	const draft = await getHistoricalProtocolImportDraft(id);
	const invalidIncluded = draft.items.flatMap((item) => {
		const reasons = itemReasons(item);
		return reasons.length > 0
			? [{ id: item.id, path: item.path, reasons }]
			: [];
	});
	const review = draft.items.filter(
		(item) => item.decision === "review",
	).length;
	return {
		valid:
			review === 0 && invalidIncluded.length === 0 && draft.counts.include > 0,
		include: draft.counts.include,
		review,
		exclude: draft.counts.exclude,
		invalidIncluded,
	};
}

export async function markHistoricalProtocolImportDraftReady(
	id: string,
	expectedRevision: number,
	actor: AuthUser,
	audit: Omit<RecordAuditInput, "category" | "action" | "actor">,
): Promise<HistoricalProtocolDraftDetail> {
	const validation = await validateHistoricalProtocolImportDraft(id);
	if (!validation.valid) {
		throw new HistoricalProtocolDraftValidationError(
			"Der Entwurf enthält noch offene oder unvollständige Zeilen",
			validation,
		);
	}
	await db.transaction(async (tx) => {
		const [updated] = await tx
			.update(historicalProtocolImportDrafts)
			.set({
				status: "ready",
				revision: sql`${historicalProtocolImportDrafts.revision} + 1`,
				updated_at: new Date(),
			})
			.where(
				and(
					eq(historicalProtocolImportDrafts.id, id),
					eq(historicalProtocolImportDrafts.status, "editing"),
					eq(historicalProtocolImportDrafts.revision, expectedRevision),
				),
			)
			.returning({ revision: historicalProtocolImportDrafts.revision });
		if (!updated) {
			throw new HistoricalProtocolDraftConflictError(
				"Der Import-Entwurf wurde zwischenzeitlich geändert. Bitte neu laden.",
			);
		}
		await recordAuditEventStrict(tx, {
			...audit,
			category: "umsaetze",
			action: "umsaetze.protocol_import_draft_ready",
			actor,
			subject: { type: "historischer_protokollordner_entwurf", id },
			metadata: {
				...audit.metadata,
				revision: updated.revision,
				ausgewählt: validation.include,
			},
		});
	});
	return getHistoricalProtocolImportDraft(id);
}

export async function reopenHistoricalProtocolImportDraft(
	id: string,
	expectedRevision: number,
	actor: AuthUser,
	audit: Omit<RecordAuditInput, "category" | "action" | "actor">,
): Promise<HistoricalProtocolDraftDetail> {
	await db.transaction(async (tx) => {
		const [updated] = await tx
			.update(historicalProtocolImportDrafts)
			.set({
				status: "editing",
				revision: sql`${historicalProtocolImportDrafts.revision} + 1`,
				updated_at: new Date(),
			})
			.where(
				and(
					eq(historicalProtocolImportDrafts.id, id),
					eq(historicalProtocolImportDrafts.status, "ready"),
					eq(historicalProtocolImportDrafts.revision, expectedRevision),
				),
			)
			.returning({ id: historicalProtocolImportDrafts.id });
		if (!updated) {
			throw new HistoricalProtocolDraftConflictError(
				"Nur ein unveränderter, freigegebener Entwurf kann wieder geöffnet werden",
			);
		}
		await recordAuditEventStrict(tx, {
			...audit,
			category: "umsaetze",
			action: "umsaetze.protocol_import_draft_reopened",
			actor,
			subject: { type: "historischer_protokollordner_entwurf", id },
		});
	});
	return getHistoricalProtocolImportDraft(id);
}

export async function applyHistoricalProtocolImportDraft(
	id: string,
	expectedRevision: number,
	actor: AuthUser,
	audit: Omit<RecordAuditInput, "category" | "action" | "actor">,
): Promise<{ created: number; skipped: number }> {
	return db.transaction(async (tx) => {
		const draft = await loadDraft(tx, id);
		if (!draft) {
			throw new HistoricalProtocolDraftNotFoundError(
				"Import-Entwurf nicht gefunden",
			);
		}
		if (draft.status !== "ready" || draft.revision !== expectedRevision) {
			throw new HistoricalProtocolDraftConflictError(
				"Der Entwurf ist nicht mehr in der freigegebenen Version",
			);
		}
		const validation = await validateDraftDetail(draft);
		if (!validation.valid) {
			throw new HistoricalProtocolDraftValidationError(
				"Der Entwurf ist nicht vollständig importierbar",
				validation,
			);
		}
		let created = 0;
		let skipped = 0;
		for (const item of draft.items.filter(
			(item) => item.decision === "include",
		)) {
			const source = item.detected.source;
			if (
				!source ||
				!item.date ||
				!item.area ||
				item.revenueCent == null ||
				item.expensesCent == null
			) {
				skipped += 1;
				continue;
			}
			const notes = [
				"Über geprüften Altprotokoll-Arbeitsstand importiert.",
				item.correctionNote ? `Korrektur: ${item.correctionNote}.` : null,
				...source.warnings.map((warning) => `${warning}.`),
			]
				.filter(Boolean)
				.join(" ")
				.slice(0, 2000);
			const result = await createHistoricalRevenueWithDb(
				tx,
				{
					idempotency_key: historicalProtocolSourceUuid(source.sha256),
					anlass_datum: item.date,
					anlass_katalog_id: null,
					umsatzbereich: item.area,
					veranstaltungsbezeichnung: item.detail,
					umsatz_cent: item.revenueCent,
					ausgaben_cent: item.expensesCent,
					quellreferenz: `${source.path} · SHA256 ${source.sha256}`.slice(
						0,
						500,
					),
					bemerkung: notes,
				},
				actor,
				{ allowDifferentActor: true, source },
			);
			if (result.created) created += 1;
			else skipped += 1;
		}
		const [claimed] = await tx
			.update(historicalProtocolImportDrafts)
			.set({
				status: "imported",
				revision: sql`${historicalProtocolImportDrafts.revision} + 1`,
				updated_at: new Date(),
				imported_at: new Date(),
				imported_by_user_id: actor.id,
				imported_by_name: actor.name,
				result_created: created,
				result_skipped: skipped,
			})
			.where(
				and(
					eq(historicalProtocolImportDrafts.id, id),
					eq(historicalProtocolImportDrafts.status, "ready"),
					eq(historicalProtocolImportDrafts.revision, expectedRevision),
				),
			)
			.returning({ id: historicalProtocolImportDrafts.id });
		if (!claimed) {
			throw new HistoricalProtocolDraftConflictError(
				"Der Entwurf wurde bereits importiert oder geändert",
			);
		}
		await recordAuditEventStrict(tx, {
			...audit,
			category: "umsaetze",
			action: "umsaetze.protocol_import_draft_applied",
			actor,
			subject: {
				type: "historischer_protokollordner_entwurf",
				id,
				label: draft.folderName,
			},
			metadata: {
				...audit.metadata,
				ausgewählt: validation.include,
				angelegt: created,
				übersprungen: skipped,
				umsatz_cent: draft.totals.revenueCent,
				ausgaben_cent: draft.totals.expensesCent,
			},
		});
		return { created, skipped };
	});
}

async function validateDraftDetail(
	draft: HistoricalProtocolDraftDetail,
): Promise<HistoricalProtocolDraftValidation> {
	const invalidIncluded = draft.items.flatMap((item) => {
		const reasons = itemReasons(item);
		return reasons.length > 0
			? [{ id: item.id, path: item.path, reasons }]
			: [];
	});
	return {
		valid:
			draft.counts.review === 0 &&
			invalidIncluded.length === 0 &&
			draft.counts.include > 0,
		include: draft.counts.include,
		review: draft.counts.review,
		exclude: draft.counts.exclude,
		invalidIncluded,
	};
}
