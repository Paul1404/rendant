import {
	and,
	asc,
	desc,
	eq,
	ilike,
	inArray,
	isNull,
	ne,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import type * as v from "valibot";
import type {
	HistoricalProtocolDraftAnalysis,
	HistoricalProtocolDraftCompactItem,
	HistoricalProtocolDraftDecision,
	HistoricalProtocolDraftDetail,
	HistoricalProtocolDraftFacet,
	HistoricalProtocolDraftItem,
	HistoricalProtocolDraftItemPage,
	HistoricalProtocolDraftSummary,
	HistoricalProtocolParsedRow,
	HistoricalProtocolPreview,
} from "@/lib/historical-protocol-import";
import type {
	HistoricalProtocolDraftAnalyzeSchema,
	HistoricalProtocolDraftBulkUpdateSchema,
	HistoricalProtocolDraftQuerySchema,
	HistoricalProtocolDraftUpdateItemSchema,
} from "@/lib/schemas";
import { isUmsatzbereich } from "@/lib/umsatzbereich";
import { type DbOrTx, db } from "@/server/db";
import {
	historicalProtocolImportDrafts,
	historicalProtocolImportItems,
	historicalProtocolImportReviewItems,
	historicalProtocolImportReviewPhases,
} from "@/server/db/schema";
import type { AuthUser } from "@/server/orpc/base";
import {
	type RecordAuditInput,
	recordAuditEventStrict,
} from "@/server/services/audit";
import { invalidateHistoricalProtocolReviewsForItems } from "@/server/services/historical-protocol-review-invalidation";
import { createHistoricalRevenueWithDb } from "@/server/services/historical-revenue";
import { historicalProtocolSourceUuid } from "@/server/services/historical-revenue-import";

type UpdateItemInput = v.InferOutput<
	typeof HistoricalProtocolDraftUpdateItemSchema
>;
type BulkUpdateInput = v.InferOutput<
	typeof HistoricalProtocolDraftBulkUpdateSchema
>;
type AnalyzeInput = v.InferOutput<typeof HistoricalProtocolDraftAnalyzeSchema>;
type QueryInput = v.InferOutput<typeof HistoricalProtocolDraftQuerySchema>;

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
	reviewPhases: {
		total: number;
		completed: number;
		active: number;
		uncoveredIncluded: number;
	};
};

const emptyReviewPhases = {
	total: 0,
	completed: 0,
	active: 0,
	uncoveredIncluded: 0,
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
		archivedAt: draft.archived_at,
		archivedByName: draft.archived_by_name,
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

type DraftAggregate = {
	draftId: string;
	include: number | string;
	review: number | string;
	exclude: number | string;
	invalidIncluded: number | string;
	revenueCent: number | string | null;
	expensesCent: number | string | null;
	cardCent: number | string | null;
};

const draftAggregateSelection = {
	draftId: historicalProtocolImportItems.draft_id,
	include: sql<number>`count(*) filter (where ${historicalProtocolImportItems.decision} = 'include')`,
	review: sql<number>`count(*) filter (where ${historicalProtocolImportItems.decision} = 'review')`,
	exclude: sql<number>`count(*) filter (where ${historicalProtocolImportItems.decision} = 'exclude')`,
	invalidIncluded: sql<number>`count(*) filter (where ${historicalProtocolImportItems.decision} = 'include' and (coalesce(${historicalProtocolImportItems.detected_row} -> 'source', 'null'::jsonb) = 'null'::jsonb or ${historicalProtocolImportItems.effective_date} is null or length(trim(${historicalProtocolImportItems.detail})) = 0 or ${historicalProtocolImportItems.umsatzbereich} is null or ${historicalProtocolImportItems.revenue_cent} is null or ${historicalProtocolImportItems.expenses_cent} is null))`,
	revenueCent: sql<number>`coalesce(sum(${historicalProtocolImportItems.revenue_cent}) filter (where ${historicalProtocolImportItems.decision} = 'include'), 0)`,
	expensesCent: sql<number>`coalesce(sum(${historicalProtocolImportItems.expenses_cent}) filter (where ${historicalProtocolImportItems.decision} = 'include'), 0)`,
	cardCent: sql<number>`coalesce(sum(coalesce((${historicalProtocolImportItems.detected_row} #>> '{source,cardCent}')::integer, 0)) filter (where ${historicalProtocolImportItems.decision} = 'include'), 0)`,
};

function summaryFromAggregate(
	draft: typeof historicalProtocolImportDrafts.$inferSelect,
	aggregate?: DraftAggregate,
): HistoricalProtocolDraftSummary {
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
		archivedAt: draft.archived_at,
		archivedByName: draft.archived_by_name,
		counts: {
			include: Number(aggregate?.include ?? 0),
			review: Number(aggregate?.review ?? 0),
			exclude: Number(aggregate?.exclude ?? 0),
			invalidIncluded: Number(aggregate?.invalidIncluded ?? 0),
		},
		totals: {
			revenueCent: Number(aggregate?.revenueCent ?? 0),
			expensesCent: Number(aggregate?.expensesCent ?? 0),
			cardCent: Number(aggregate?.cardCent ?? 0),
		},
	};
}

async function loadDraftSummary(
	database: DbOrTx,
	id: string,
): Promise<HistoricalProtocolDraftSummary | null> {
	const [draft] = await database
		.select()
		.from(historicalProtocolImportDrafts)
		.where(eq(historicalProtocolImportDrafts.id, id))
		.limit(1);
	if (!draft) return null;
	const [aggregate] = await database
		.select(draftAggregateSelection)
		.from(historicalProtocolImportItems)
		.where(eq(historicalProtocolImportItems.draft_id, id))
		.groupBy(historicalProtocolImportItems.draft_id);
	return summaryFromAggregate(draft, aggregate);
}

export async function getHistoricalProtocolImportDraftSummary(
	id: string,
): Promise<HistoricalProtocolDraftSummary> {
	const summary = await loadDraftSummary(db, id);
	if (!summary) {
		throw new HistoricalProtocolDraftNotFoundError(
			"Import-Entwurf nicht gefunden",
		);
	}
	return summary;
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

export async function listHistoricalProtocolImportDrafts(
	includeArchived = false,
): Promise<HistoricalProtocolDraftSummary[]> {
	const drafts = await db
		.select()
		.from(historicalProtocolImportDrafts)
		.where(
			includeArchived
				? undefined
				: ne(historicalProtocolImportDrafts.status, "archived"),
		)
		.orderBy(desc(historicalProtocolImportDrafts.updated_at));
	if (drafts.length === 0) return [];
	const aggregates = await db
		.select(draftAggregateSelection)
		.from(historicalProtocolImportItems)
		.where(
			inArray(
				historicalProtocolImportItems.draft_id,
				drafts.map((draft) => draft.id),
			),
		)
		.groupBy(historicalProtocolImportItems.draft_id);
	const byDraft = new Map(aggregates.map((row) => [row.draftId, row]));
	return drafts.map((draft) =>
		summaryFromAggregate(draft, byDraft.get(draft.id)),
	);
}

function draftItemFilters(input: AnalyzeInput | QueryInput): SQL[] {
	const filters: SQL[] = [eq(historicalProtocolImportItems.draft_id, input.id)];
	if (input.decision) {
		filters.push(eq(historicalProtocolImportItems.decision, input.decision));
	}
	if (input.parser_status) {
		filters.push(
			eq(historicalProtocolImportItems.parser_status, input.parser_status),
		);
	}
	if (input.parser_reason) {
		filters.push(
			eq(historicalProtocolImportItems.parser_reason, input.parser_reason),
		);
	}
	if (input.classification_key) {
		filters.push(
			eq(
				historicalProtocolImportItems.classification_key,
				input.classification_key,
			),
		);
	}
	if (input.classification_confidence) {
		filters.push(
			eq(
				historicalProtocolImportItems.classification_confidence,
				input.classification_confidence,
			),
		);
	}
	if (input.umsatzbereich === "missing") {
		filters.push(isNull(historicalProtocolImportItems.umsatzbereich));
	} else if (input.umsatzbereich) {
		filters.push(
			eq(historicalProtocolImportItems.umsatzbereich, input.umsatzbereich),
		);
	}
	if (input.date_origin) {
		filters.push(
			sql`${historicalProtocolImportItems.detected_row} #>> '{source,dateOrigin}' = ${input.date_origin}`,
		);
	}
	if (input.warning) {
		filters.push(
			sql`coalesce(${historicalProtocolImportItems.detected_row} #> '{source,warnings}', '[]'::jsonb) @> ${JSON.stringify([input.warning])}::jsonb`,
		);
	}
	if (input.query) {
		const pattern = `%${input.query}%`;
		const search = or(
			ilike(historicalProtocolImportItems.path, pattern),
			ilike(historicalProtocolImportItems.detail, pattern),
			ilike(historicalProtocolImportItems.parser_reason, pattern),
			ilike(historicalProtocolImportItems.classification_key, pattern),
		);
		if (search) filters.push(search);
	}
	return filters;
}

function facets(
	values: Array<string | null | undefined>,
): HistoricalProtocolDraftFacet[] {
	const counts = new Map<string, number>();
	for (const value of values) {
		const key = value || "missing";
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return Array.from(counts, ([value, count]) => ({ value, count })).sort(
		(a, b) => b.count - a.count || a.value.localeCompare(b.value, "de"),
	);
}

function compactItem(
	item: HistoricalProtocolDraftItem,
): HistoricalProtocolDraftCompactItem {
	const { detected, ...working } = item;
	return {
		...working,
		evidence: {
			dateOrigin: detected.source?.dateOrigin ?? null,
			warnings: detected.source?.warnings ?? [],
			cardCent: detected.source?.cardCent ?? 0,
			cashRegisterNumber: detected.source?.cashRegisterNumber ?? null,
			cashRegisterLabel: detected.source?.cashRegisterLabel ?? null,
			protocolNumber: detected.source?.protocolNumber ?? null,
		},
	};
}

export async function analyzeHistoricalProtocolImportDraft(
	input: AnalyzeInput,
): Promise<HistoricalProtocolDraftAnalysis> {
	const draft = await getHistoricalProtocolImportDraftSummary(input.id);
	const filters = draftItemFilters(input);
	const rows = await db
		.select({
			decision: historicalProtocolImportItems.decision,
			parserStatus: historicalProtocolImportItems.parser_status,
			parserReason: historicalProtocolImportItems.parser_reason,
			classificationKey: historicalProtocolImportItems.classification_key,
			classificationConfidence:
				historicalProtocolImportItems.classification_confidence,
			area: historicalProtocolImportItems.umsatzbereich,
			revenueCent: historicalProtocolImportItems.revenue_cent,
			expensesCent: historicalProtocolImportItems.expenses_cent,
			dateOrigin: sql<
				string | null
			>`${historicalProtocolImportItems.detected_row} #>> '{source,dateOrigin}'`,
			warnings: sql<
				string[]
			>`coalesce(${historicalProtocolImportItems.detected_row} #> '{source,warnings}', '[]'::jsonb)`,
			cardCent: sql<number>`coalesce((${historicalProtocolImportItems.detected_row} #>> '{source,cardCent}')::integer, 0)`,
		})
		.from(historicalProtocolImportItems)
		.where(and(...filters));
	const warningValues = rows.flatMap((row) => row.warnings ?? []);
	const hasWarning = (row: (typeof rows)[number], pattern: RegExp) =>
		(row.warnings ?? []).some((warning) => pattern.test(warning));
	return {
		draft,
		matched: rows.length,
		totals: rows.reduce(
			(sum, row) => ({
				revenueCent: sum.revenueCent + Number(row.revenueCent ?? 0),
				expensesCent: sum.expensesCent + Number(row.expensesCent ?? 0),
				cardCent: sum.cardCent + Number(row.cardCent ?? 0),
			}),
			{ revenueCent: 0, expensesCent: 0, cardCent: 0 },
		),
		issues: {
			missingArea: rows.filter((row) => !row.area).length,
			derivedDate: rows.filter((row) => row.dateOrigin === "file_modified")
				.length,
			vatWarning: rows.filter((row) => hasWarning(row, /USt|Steuer/i)).length,
			denominationWarning: rows.filter((row) => hasWarning(row, /Stückelung/i))
				.length,
			unclearRegister: rows.filter((row) =>
				hasWarning(row, /Kassenbezeichnung|Umsatzbereich/i),
			).length,
		},
		facets: {
			decisions: facets(rows.map((row) => row.decision)),
			parserStatuses: facets(rows.map((row) => row.parserStatus)),
			parserReasons: facets(rows.map((row) => row.parserReason)),
			classificationKeys: facets(rows.map((row) => row.classificationKey)),
			classificationConfidence: facets(
				rows.map((row) => row.classificationConfidence),
			),
			areas: facets(rows.map((row) => row.area)),
			dateOrigins: facets(rows.map((row) => row.dateOrigin)),
			warnings: facets(warningValues),
		},
	};
}

export async function queryHistoricalProtocolImportDraftItems(
	input: QueryInput,
): Promise<HistoricalProtocolDraftItemPage> {
	const draft = await getHistoricalProtocolImportDraftSummary(input.id);
	const filters = draftItemFilters(input);
	const [countRow] = await db
		.select({ count: sql<number>`count(*)` })
		.from(historicalProtocolImportItems)
		.where(and(...filters));
	const total = Number(countRow?.count ?? 0);
	const sortColumn =
		input.sort === "date"
			? historicalProtocolImportItems.effective_date
			: input.sort === "revenue"
				? historicalProtocolImportItems.revenue_cent
				: input.sort === "updated_at"
					? historicalProtocolImportItems.updated_at
					: historicalProtocolImportItems.file_index;
	const order = input.direction === "desc" ? desc(sortColumn) : asc(sortColumn);
	const rows = await db
		.select()
		.from(historicalProtocolImportItems)
		.where(and(...filters))
		.orderBy(order, asc(historicalProtocolImportItems.file_index))
		.limit(input.page_size)
		.offset((input.page - 1) * input.page_size);
	const items = rows.map(mapItem);
	return {
		draft,
		page: input.page,
		pageSize: input.page_size,
		total,
		pageCount: Math.ceil(total / input.page_size),
		items: input.include_evidence ? items : items.map(compactItem),
	};
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
				.select({
					id: historicalProtocolImportDrafts.id,
					status: historicalProtocolImportDrafts.status,
				})
				.from(historicalProtocolImportDrafts)
				.where(eq(historicalProtocolImportDrafts.digest, preview.digest))
				.limit(1);
			if (!existing)
				throw new Error("Import-Entwurf konnte nicht geladen werden");
			if (existing.status === "archived") {
				await tx
					.update(historicalProtocolImportDrafts)
					.set({
						status: "editing",
						revision: sql`${historicalProtocolImportDrafts.revision} + 1`,
						updated_at: new Date(),
						archived_at: null,
						archived_by_user_id: null,
						archived_by_name: null,
					})
					.where(eq(historicalProtocolImportDrafts.id, existing.id));
				await recordAuditEventStrict(tx, {
					...audit,
					category: "umsaetze",
					action: "umsaetze.protocol_import_draft_restored",
					actor,
					subject: {
						type: "historischer_protokollordner_entwurf",
						id: existing.id,
						label: preview.folderName,
					},
					metadata: {
						...audit.metadata,
						grund: "Ordner erneut analysiert",
					},
				});
			}
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
			{
				valid: false,
				include: 0,
				review: 0,
				exclude: 0,
				invalidIncluded: [],
				reviewPhases: emptyReviewPhases,
			},
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
		const reopenedChecks = await invalidateHistoricalProtocolReviewsForItems(
			tx,
			[input.item_id],
			actor,
		);
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
				zurückgesetzte_prüfungen: reopenedChecks,
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
			{
				valid: false,
				include: 0,
				review: 0,
				exclude: 0,
				invalidIncluded: [],
				reviewPhases: emptyReviewPhases,
			},
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
		const reopenedChecks = await invalidateHistoricalProtocolReviewsForItems(
			tx,
			changed.map((item) => item.id),
			actor,
		);
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
				zurückgesetzte_prüfungen: reopenedChecks,
			},
		});
	});
	return getHistoricalProtocolImportDraft(input.draft_id);
}

export async function validateHistoricalProtocolImportDraft(
	id: string,
): Promise<HistoricalProtocolDraftValidation> {
	const draft = await getHistoricalProtocolImportDraft(id);
	return validateDraftDetail(db, draft);
}

async function reviewPhaseValidation(
	database: DbOrTx,
	draftId: string,
): Promise<HistoricalProtocolDraftValidation["reviewPhases"]> {
	const [counts] = await database
		.select({
			total: sql<number>`count(*)`,
			completed: sql<number>`count(*) filter (where ${historicalProtocolImportReviewPhases.status} = 'completed')`,
		})
		.from(historicalProtocolImportReviewPhases)
		.where(eq(historicalProtocolImportReviewPhases.draft_id, draftId));
	const total = Number(counts?.total ?? 0);
	const completed = Number(counts?.completed ?? 0);
	if (total === 0) {
		return emptyReviewPhases;
	}
	const [coverage] = await database
		.select({
			count: sql<number>`count(distinct ${historicalProtocolImportReviewItems.item_id})`,
		})
		.from(historicalProtocolImportReviewItems)
		.innerJoin(
			historicalProtocolImportReviewPhases,
			eq(
				historicalProtocolImportReviewPhases.id,
				historicalProtocolImportReviewItems.phase_id,
			),
		)
		.innerJoin(
			historicalProtocolImportItems,
			eq(
				historicalProtocolImportItems.id,
				historicalProtocolImportReviewItems.item_id,
			),
		)
		.where(
			and(
				eq(historicalProtocolImportReviewPhases.draft_id, draftId),
				eq(historicalProtocolImportReviewPhases.kind, "final"),
				eq(historicalProtocolImportReviewPhases.status, "completed"),
				eq(historicalProtocolImportReviewItems.status, "accepted"),
				eq(historicalProtocolImportItems.decision, "include"),
			),
		);
	const coveredIncluded = Number(coverage?.count ?? 0);
	const [included] = await database
		.select({ count: sql<number>`count(*)` })
		.from(historicalProtocolImportItems)
		.where(
			and(
				eq(historicalProtocolImportItems.draft_id, draftId),
				eq(historicalProtocolImportItems.decision, "include"),
			),
		);
	return {
		total,
		completed,
		active: total - completed,
		uncoveredIncluded: Math.max(
			0,
			Number(included?.count ?? 0) - coveredIncluded,
		),
	};
}

async function validateDraftDetail(
	database: DbOrTx,
	draft: HistoricalProtocolDraftDetail,
): Promise<HistoricalProtocolDraftValidation> {
	const invalidIncluded = draft.items.flatMap((item) => {
		const reasons = itemReasons(item);
		return reasons.length > 0
			? [{ id: item.id, path: item.path, reasons }]
			: [];
	});
	const review = draft.items.filter(
		(item) => item.decision === "review",
	).length;
	const reviewPhases = await reviewPhaseValidation(database, draft.id);
	return {
		valid:
			review === 0 &&
			invalidIncluded.length === 0 &&
			draft.counts.include > 0 &&
			reviewPhases.active === 0 &&
			reviewPhases.uncoveredIncluded === 0,
		include: draft.counts.include,
		review,
		exclude: draft.counts.exclude,
		invalidIncluded,
		reviewPhases,
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

export async function archiveHistoricalProtocolImportDraft(
	id: string,
	expectedRevision: number,
	actor: AuthUser,
	audit: Omit<RecordAuditInput, "category" | "action" | "actor">,
): Promise<HistoricalProtocolDraftSummary> {
	await db.transaction(async (tx) => {
		const [updated] = await tx
			.update(historicalProtocolImportDrafts)
			.set({
				status: "archived",
				revision: sql`${historicalProtocolImportDrafts.revision} + 1`,
				updated_at: new Date(),
				archived_at: new Date(),
				archived_by_user_id: actor.id,
				archived_by_name: actor.name,
			})
			.where(
				and(
					eq(historicalProtocolImportDrafts.id, id),
					inArray(historicalProtocolImportDrafts.status, ["editing", "ready"]),
					eq(historicalProtocolImportDrafts.revision, expectedRevision),
				),
			)
			.returning({ revision: historicalProtocolImportDrafts.revision });
		if (!updated) {
			throw new HistoricalProtocolDraftConflictError(
				"Nur ein unveränderter, offener Arbeitsstand kann archiviert werden",
			);
		}
		await recordAuditEventStrict(tx, {
			...audit,
			category: "umsaetze",
			action: "umsaetze.protocol_import_draft_archived",
			actor,
			subject: { type: "historischer_protokollordner_entwurf", id },
			metadata: { ...audit.metadata, revision: updated.revision },
		});
	});
	return getHistoricalProtocolImportDraftSummary(id);
}

export async function restoreHistoricalProtocolImportDraft(
	id: string,
	expectedRevision: number,
	actor: AuthUser,
	audit: Omit<RecordAuditInput, "category" | "action" | "actor">,
): Promise<HistoricalProtocolDraftSummary> {
	await db.transaction(async (tx) => {
		const [updated] = await tx
			.update(historicalProtocolImportDrafts)
			.set({
				status: "editing",
				revision: sql`${historicalProtocolImportDrafts.revision} + 1`,
				updated_at: new Date(),
				archived_at: null,
				archived_by_user_id: null,
				archived_by_name: null,
			})
			.where(
				and(
					eq(historicalProtocolImportDrafts.id, id),
					eq(historicalProtocolImportDrafts.status, "archived"),
					eq(historicalProtocolImportDrafts.revision, expectedRevision),
				),
			)
			.returning({ revision: historicalProtocolImportDrafts.revision });
		if (!updated) {
			throw new HistoricalProtocolDraftConflictError(
				"Der archivierte Arbeitsstand wurde zwischenzeitlich geändert",
			);
		}
		await recordAuditEventStrict(tx, {
			...audit,
			category: "umsaetze",
			action: "umsaetze.protocol_import_draft_restored",
			actor,
			subject: { type: "historischer_protokollordner_entwurf", id },
			metadata: { ...audit.metadata, revision: updated.revision },
		});
	});
	return getHistoricalProtocolImportDraftSummary(id);
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
		const validation = await validateDraftDetail(tx, draft);
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
