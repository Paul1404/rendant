import { createHash } from "node:crypto";
import {
	and,
	asc,
	eq,
	gte,
	ilike,
	inArray,
	isNull,
	lte,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import type * as v from "valibot";
import type {
	HistoricalProtocolDraftCompactItem,
	HistoricalProtocolReviewPhaseFilters,
	HistoricalProtocolReviewPhaseItemPage,
	HistoricalProtocolReviewPhasePlan,
	HistoricalProtocolReviewPhaseSummary,
	HistoricalProtocolReviewUpdatePlan,
} from "@/lib/historical-protocol-import";
import type {
	HistoricalProtocolReviewPhaseCreateSchema,
	HistoricalProtocolReviewPhasePlanSchema,
	HistoricalProtocolReviewPhaseQuerySchema,
	HistoricalProtocolReviewPhaseTransitionSchema,
	HistoricalProtocolReviewUpdateApplySchema,
	HistoricalProtocolReviewUpdatePlanSchema,
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
import {
	getHistoricalProtocolImportDraftSummary,
	HistoricalProtocolDraftConflictError,
	HistoricalProtocolDraftNotFoundError,
	HistoricalProtocolDraftValidationError,
} from "@/server/services/historical-protocol-import-draft";
import { ilikeContains } from "@/server/services/search-pattern";

type PhasePlanInput = v.InferOutput<
	typeof HistoricalProtocolReviewPhasePlanSchema
>;
type PhaseCreateInput = v.InferOutput<
	typeof HistoricalProtocolReviewPhaseCreateSchema
>;
type PhaseQueryInput = v.InferOutput<
	typeof HistoricalProtocolReviewPhaseQuerySchema
>;
type UpdatePlanInput = v.InferOutput<
	typeof HistoricalProtocolReviewUpdatePlanSchema
>;
type UpdateApplyInput = v.InferOutput<
	typeof HistoricalProtocolReviewUpdateApplySchema
>;
type PhaseTransitionInput = v.InferOutput<
	typeof HistoricalProtocolReviewPhaseTransitionSchema
>;

type SelectionRow = typeof historicalProtocolImportItems.$inferSelect;
type PhaseRow = typeof historicalProtocolImportReviewPhases.$inferSelect;

function filtersFromInput(input: PhasePlanInput | PhaseCreateInput): SQL[] {
	const filters: SQL[] = [
		eq(historicalProtocolImportItems.draft_id, input.draft_id),
	];
	if (input.year_from !== undefined) {
		filters.push(
			gte(
				historicalProtocolImportItems.effective_date,
				`${input.year_from}-01-01`,
			),
		);
	}
	if (input.year_to !== undefined) {
		filters.push(
			lte(
				historicalProtocolImportItems.effective_date,
				`${input.year_to}-12-31`,
			),
		);
	}
	if (input.decisions?.length) {
		filters.push(
			inArray(historicalProtocolImportItems.decision, input.decisions),
		);
	}
	if (input.issue === "derived_date") {
		filters.push(
			sql`${historicalProtocolImportItems.detected_row} #>> '{source,dateOrigin}' = 'file_modified'`,
		);
	}
	if (input.issue === "vat_warning") {
		filters.push(
			sql`coalesce(${historicalProtocolImportItems.detected_row} #> '{source,warnings}', '[]'::jsonb)::text ~* '(USt|Steuer)'`,
		);
	}
	if (input.issue === "denomination_warning") {
		filters.push(
			sql`coalesce(${historicalProtocolImportItems.detected_row} #> '{source,warnings}', '[]'::jsonb)::text ~* 'Stückelung'`,
		);
	}
	if (input.issue === "missing_area") {
		filters.push(isNull(historicalProtocolImportItems.umsatzbereich));
	}
	if (input.issue === "unclear_register") {
		filters.push(
			sql`coalesce(${historicalProtocolImportItems.detected_row} #> '{source,warnings}', '[]'::jsonb)::text ~* '(Kassenbezeichnung|Umsatzbereich)'`,
		);
	}
	if (input.query) {
		const pattern = ilikeContains(input.query);
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

function phaseFilters(
	input: PhasePlanInput | PhaseCreateInput,
): HistoricalProtocolReviewPhaseFilters {
	return {
		...(input.year_from === undefined ? {} : { year_from: input.year_from }),
		...(input.year_to === undefined ? {} : { year_to: input.year_to }),
		...(input.decisions ? { decisions: input.decisions } : {}),
		...(input.issue ? { issue: input.issue } : {}),
		...(input.query ? { query: input.query } : {}),
	};
}

function hashSelection(rows: Array<{ id: string; revision: number }>): string {
	const stable = [...rows]
		.sort((a, b) => a.id.localeCompare(b.id))
		.map((row) => `${row.id}:${row.revision}`)
		.join("\n");
	return createHash("sha256").update(stable).digest("hex");
}

function selectionTotals(rows: SelectionRow[]) {
	return rows.reduce(
		(sum, row) => ({
			revenueCent: sum.revenueCent + Number(row.revenue_cent ?? 0),
			expensesCent: sum.expensesCent + Number(row.expenses_cent ?? 0),
			cardCent: sum.cardCent + Number(row.detected_row.source?.cardCent ?? 0),
		}),
		{ revenueCent: 0, expensesCent: 0, cardCent: 0 },
	);
}

async function selectRows(
	database: DbOrTx,
	input: PhasePlanInput | PhaseCreateInput,
): Promise<SelectionRow[]> {
	return database
		.select()
		.from(historicalProtocolImportItems)
		.where(and(...filtersFromInput(input)))
		.orderBy(asc(historicalProtocolImportItems.file_index));
}

export async function planHistoricalProtocolReviewPhase(
	input: PhasePlanInput,
): Promise<HistoricalProtocolReviewPhasePlan> {
	const [draft, rows] = await Promise.all([
		getHistoricalProtocolImportDraftSummary(input.draft_id),
		selectRows(db, input),
	]);
	if (draft.status !== "editing") {
		throw new HistoricalProtocolDraftConflictError(
			"Prüfphasen können nur in einem bearbeitbaren Entwurf angelegt werden",
		);
	}
	if (rows.length === 0) {
		throw new HistoricalProtocolDraftNotFoundError(
			"Für diese Prüfphase wurden keine passenden Zeilen gefunden",
		);
	}
	return {
		draft,
		name: input.name,
		kind: input.kind,
		filters: phaseFilters(input),
		selectionHash: hashSelection(rows),
		matched: rows.length,
		totals: selectionTotals(rows),
	};
}

async function claimDraftRevision(
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

export async function createHistoricalProtocolReviewPhase(
	input: PhaseCreateInput,
	actor: AuthUser,
	audit: Omit<RecordAuditInput, "category" | "action" | "actor">,
): Promise<{
	phase: HistoricalProtocolReviewPhaseSummary;
	draft: Awaited<ReturnType<typeof getHistoricalProtocolImportDraftSummary>>;
}> {
	const phaseId = await db.transaction(async (tx) => {
		const rows = await selectRows(tx, input);
		if (rows.length === 0 || hashSelection(rows) !== input.selection_hash) {
			throw new HistoricalProtocolDraftConflictError(
				"Die Vorschau ist nicht mehr aktuell. Bitte die Prüfphase erneut planen.",
			);
		}
		const draftRevision = await claimDraftRevision(
			tx,
			input.draft_id,
			input.expected_revision,
		);
		const [phase] = await tx
			.insert(historicalProtocolImportReviewPhases)
			.values({
				draft_id: input.draft_id,
				name: input.name,
				kind: input.kind,
				filters: phaseFilters(input),
				created_by_user_id: actor.id,
				created_by_name: actor.name,
			})
			.returning({ id: historicalProtocolImportReviewPhases.id });
		if (!phase) throw new Error("Prüfphase konnte nicht angelegt werden");
		for (let offset = 0; offset < rows.length; offset += 250) {
			await tx.insert(historicalProtocolImportReviewItems).values(
				rows.slice(offset, offset + 250).map((row) => ({
					phase_id: phase.id,
					item_id: row.id,
					updated_by_user_id: actor.id,
					updated_by_name: actor.name,
				})),
			);
		}
		await recordAuditEventStrict(tx, {
			...audit,
			category: "umsaetze",
			action: "umsaetze.protocol_import_review_phase_created",
			actor,
			subject: {
				type: "historischer_protokollordner_prüfphase",
				id: phase.id,
				label: input.name,
			},
			metadata: {
				...audit.metadata,
				entwurf_id: input.draft_id,
				revision: draftRevision,
				art: input.kind,
				zeilen: rows.length,
				filter: phaseFilters(input),
			},
		});
		return phase.id;
	});
	const [phase, draft] = await Promise.all([
		getHistoricalProtocolReviewPhase(phaseId),
		getHistoricalProtocolImportDraftSummary(input.draft_id),
	]);
	return { phase, draft };
}

type PhaseAggregate = {
	phaseId: string;
	pending: number | string;
	accepted: number | string;
	issue: number | string;
	notApplicable: number | string;
	total: number | string;
	revenueCent: number | string | null;
	expensesCent: number | string | null;
	cardCent: number | string | null;
};

const phaseAggregateSelection = {
	phaseId: historicalProtocolImportReviewItems.phase_id,
	pending: sql<number>`count(*) filter (where ${historicalProtocolImportReviewItems.status} = 'pending')`,
	accepted: sql<number>`count(*) filter (where ${historicalProtocolImportReviewItems.status} = 'accepted')`,
	issue: sql<number>`count(*) filter (where ${historicalProtocolImportReviewItems.status} = 'issue')`,
	notApplicable: sql<number>`count(*) filter (where ${historicalProtocolImportReviewItems.status} = 'not_applicable')`,
	total: sql<number>`count(*)`,
	revenueCent: sql<number>`coalesce(sum(${historicalProtocolImportItems.revenue_cent}), 0)`,
	expensesCent: sql<number>`coalesce(sum(${historicalProtocolImportItems.expenses_cent}), 0)`,
	cardCent: sql<number>`coalesce(sum(coalesce((${historicalProtocolImportItems.detected_row} #>> '{source,cardCent}')::integer, 0)), 0)`,
};

function mapPhase(phase: PhaseRow, aggregate?: PhaseAggregate) {
	const pending = Number(aggregate?.pending ?? 0);
	const accepted = Number(aggregate?.accepted ?? 0);
	const issue = Number(aggregate?.issue ?? 0);
	const notApplicable = Number(aggregate?.notApplicable ?? 0);
	const total = Number(aggregate?.total ?? 0);
	const completed = accepted + notApplicable;
	const progressPercent =
		total === 0
			? 0
			: completed >= total
				? 100
				: Math.min(99, Math.floor((completed / total) * 100));
	return {
		id: phase.id,
		draftId: phase.draft_id,
		name: phase.name,
		kind: phase.kind as HistoricalProtocolReviewPhaseSummary["kind"],
		status: phase.status as HistoricalProtocolReviewPhaseSummary["status"],
		filters: phase.filters as HistoricalProtocolReviewPhaseFilters,
		revision: phase.revision,
		createdByName: phase.created_by_name,
		createdAt: phase.created_at,
		updatedAt: phase.updated_at,
		completedByName: phase.completed_by_name,
		completedAt: phase.completed_at,
		counts: {
			pending,
			accepted,
			issue,
			not_applicable: notApplicable,
			total,
			completed,
		},
		progressPercent,
		totals: {
			revenueCent: Number(aggregate?.revenueCent ?? 0),
			expensesCent: Number(aggregate?.expensesCent ?? 0),
			cardCent: Number(aggregate?.cardCent ?? 0),
		},
	} satisfies HistoricalProtocolReviewPhaseSummary;
}

async function aggregateForPhase(
	database: DbOrTx,
	phaseId: string,
): Promise<PhaseAggregate | undefined> {
	const [aggregate] = await database
		.select(phaseAggregateSelection)
		.from(historicalProtocolImportReviewItems)
		.innerJoin(
			historicalProtocolImportItems,
			eq(
				historicalProtocolImportItems.id,
				historicalProtocolImportReviewItems.item_id,
			),
		)
		.where(eq(historicalProtocolImportReviewItems.phase_id, phaseId))
		.groupBy(historicalProtocolImportReviewItems.phase_id);
	return aggregate;
}

export async function getHistoricalProtocolReviewPhase(
	id: string,
): Promise<HistoricalProtocolReviewPhaseSummary> {
	const [phase, aggregate] = await Promise.all([
		db
			.select()
			.from(historicalProtocolImportReviewPhases)
			.where(eq(historicalProtocolImportReviewPhases.id, id))
			.limit(1)
			.then((rows) => rows[0]),
		aggregateForPhase(db, id),
	]);
	if (!phase) {
		throw new HistoricalProtocolDraftNotFoundError("Prüfphase nicht gefunden");
	}
	return mapPhase(phase, aggregate);
}

export async function listHistoricalProtocolReviewPhases(
	draftId: string,
): Promise<HistoricalProtocolReviewPhaseSummary[]> {
	const phases = await db
		.select()
		.from(historicalProtocolImportReviewPhases)
		.where(eq(historicalProtocolImportReviewPhases.draft_id, draftId))
		.orderBy(asc(historicalProtocolImportReviewPhases.created_at));
	if (phases.length === 0) return [];
	const aggregates = await db
		.select(phaseAggregateSelection)
		.from(historicalProtocolImportReviewItems)
		.innerJoin(
			historicalProtocolImportItems,
			eq(
				historicalProtocolImportItems.id,
				historicalProtocolImportReviewItems.item_id,
			),
		)
		.where(
			inArray(
				historicalProtocolImportReviewItems.phase_id,
				phases.map((phase) => phase.id),
			),
		)
		.groupBy(historicalProtocolImportReviewItems.phase_id);
	const byPhase = new Map(aggregates.map((row) => [row.phaseId, row]));
	return phases.map((phase) => mapPhase(phase, byPhase.get(phase.id)));
}

function compactItem(row: SelectionRow): HistoricalProtocolDraftCompactItem {
	return {
		id: row.id,
		draftId: row.draft_id,
		fileIndex: row.file_index,
		path: row.path,
		parserStatus:
			row.parser_status as HistoricalProtocolDraftCompactItem["parserStatus"],
		parserReason: row.parser_reason,
		decision: row.decision as HistoricalProtocolDraftCompactItem["decision"],
		date: row.effective_date,
		detail: row.detail,
		area: isUmsatzbereich(row.umsatzbereich) ? row.umsatzbereich : null,
		revenueCent: row.revenue_cent,
		expensesCent: row.expenses_cent,
		classificationKey: row.classification_key,
		classificationConfidence:
			row.classification_confidence as HistoricalProtocolDraftCompactItem["classificationConfidence"],
		correctionNote: row.correction_note,
		revision: row.revision,
		updatedAt: row.updated_at,
		updatedByName: row.updated_by_name,
		evidence: {
			dateOrigin: row.detected_row.source?.dateOrigin ?? null,
			warnings: row.detected_row.source?.warnings ?? [],
			cardCent: row.detected_row.source?.cardCent ?? 0,
			cashRegisterNumber: row.detected_row.source?.cashRegisterNumber ?? null,
			cashRegisterLabel: row.detected_row.source?.cashRegisterLabel ?? null,
			protocolNumber: row.detected_row.source?.protocolNumber ?? null,
		},
	};
}

export async function queryHistoricalProtocolReviewPhaseItems(
	input: PhaseQueryInput,
): Promise<HistoricalProtocolReviewPhaseItemPage> {
	const phase = await getHistoricalProtocolReviewPhase(input.phase_id);
	const filters: SQL[] = [
		eq(historicalProtocolImportReviewItems.phase_id, input.phase_id),
	];
	if (input.status) {
		filters.push(eq(historicalProtocolImportReviewItems.status, input.status));
	}
	const [countRow] = await db
		.select({ count: sql<number>`count(*)` })
		.from(historicalProtocolImportReviewItems)
		.where(and(...filters));
	const total = Number(countRow?.count ?? 0);
	const rows = await db
		.select({
			review: historicalProtocolImportReviewItems,
			item: historicalProtocolImportItems,
		})
		.from(historicalProtocolImportReviewItems)
		.innerJoin(
			historicalProtocolImportItems,
			eq(
				historicalProtocolImportItems.id,
				historicalProtocolImportReviewItems.item_id,
			),
		)
		.where(and(...filters))
		.orderBy(asc(historicalProtocolImportItems.file_index))
		.limit(input.page_size)
		.offset((input.page - 1) * input.page_size);
	return {
		phase,
		page: input.page,
		pageSize: input.page_size,
		total,
		pageCount: Math.ceil(total / input.page_size),
		items: rows.map(({ review, item }) => ({
			id: review.id,
			phaseId: review.phase_id,
			itemId: review.item_id,
			status:
				review.status as HistoricalProtocolReviewPhaseItemPage["items"][number]["status"],
			note: review.note,
			revision: review.revision,
			updatedAt: review.updated_at,
			updatedByName: review.updated_by_name,
			item: compactItem(item),
		})),
	};
}

async function selectReviewRows(
	database: DbOrTx,
	phaseId: string,
	itemIds: string[],
) {
	return database
		.select({
			id: historicalProtocolImportReviewItems.id,
			itemId: historicalProtocolImportReviewItems.item_id,
			revision: historicalProtocolImportReviewItems.revision,
			item: historicalProtocolImportItems,
		})
		.from(historicalProtocolImportReviewItems)
		.innerJoin(
			historicalProtocolImportItems,
			eq(
				historicalProtocolImportItems.id,
				historicalProtocolImportReviewItems.item_id,
			),
		)
		.where(
			and(
				eq(historicalProtocolImportReviewItems.phase_id, phaseId),
				inArray(historicalProtocolImportReviewItems.item_id, itemIds),
			),
		);
}

export async function planHistoricalProtocolReviewUpdate(
	input: UpdatePlanInput,
): Promise<HistoricalProtocolReviewUpdatePlan> {
	const uniqueIds = [...new Set(input.item_ids)];
	const [phase, rows] = await Promise.all([
		getHistoricalProtocolReviewPhase(input.phase_id),
		selectReviewRows(db, input.phase_id, uniqueIds),
	]);
	if (phase.status !== "active") {
		throw new HistoricalProtocolDraftConflictError(
			"Die Prüfphase ist abgeschlossen und muss zuerst wieder geöffnet werden",
		);
	}
	if (rows.length !== uniqueIds.length) {
		throw new HistoricalProtocolDraftNotFoundError(
			"Mindestens eine ausgewählte Zeile gehört nicht zu dieser Prüfphase",
		);
	}
	return {
		phase,
		status: input.status,
		selectionHash: hashSelection(rows),
		matched: rows.length,
		totals: selectionTotals(rows.map((row) => row.item)),
	};
}

export async function applyHistoricalProtocolReviewUpdate(
	input: UpdateApplyInput,
	actor: AuthUser,
	audit: Omit<RecordAuditInput, "category" | "action" | "actor">,
): Promise<{
	phase: HistoricalProtocolReviewPhaseSummary;
	draft: Awaited<ReturnType<typeof getHistoricalProtocolImportDraftSummary>>;
}> {
	const uniqueIds = [...new Set(input.item_ids)];
	let draftId = "";
	await db.transaction(async (tx) => {
		const [phase] = await tx
			.select()
			.from(historicalProtocolImportReviewPhases)
			.where(
				and(
					eq(historicalProtocolImportReviewPhases.id, input.phase_id),
					eq(historicalProtocolImportReviewPhases.status, "active"),
					eq(
						historicalProtocolImportReviewPhases.revision,
						input.expected_phase_revision,
					),
				),
			)
			.limit(1);
		if (!phase) {
			throw new HistoricalProtocolDraftConflictError(
				"Die Prüfphase wurde zwischenzeitlich geändert. Bitte neu laden.",
			);
		}
		draftId = phase.draft_id;
		const rows = await selectReviewRows(tx, input.phase_id, uniqueIds);
		if (
			rows.length !== uniqueIds.length ||
			hashSelection(rows) !== input.selection_hash
		) {
			throw new HistoricalProtocolDraftConflictError(
				"Die Prüfvorschau ist nicht mehr aktuell. Bitte erneut planen.",
			);
		}
		const draftRevision = await claimDraftRevision(
			tx,
			phase.draft_id,
			input.expected_draft_revision,
		);
		await tx
			.update(historicalProtocolImportReviewItems)
			.set({
				status: input.status,
				note: input.note,
				revision: sql`${historicalProtocolImportReviewItems.revision} + 1`,
				updated_by_user_id: actor.id,
				updated_by_name: actor.name,
				updated_at: new Date(),
			})
			.where(
				and(
					eq(historicalProtocolImportReviewItems.phase_id, input.phase_id),
					inArray(historicalProtocolImportReviewItems.item_id, uniqueIds),
				),
			);
		await tx
			.update(historicalProtocolImportReviewPhases)
			.set({
				revision: sql`${historicalProtocolImportReviewPhases.revision} + 1`,
				updated_at: new Date(),
			})
			.where(eq(historicalProtocolImportReviewPhases.id, input.phase_id));
		await recordAuditEventStrict(tx, {
			...audit,
			category: "umsaetze",
			action: "umsaetze.protocol_import_review_items_updated",
			actor,
			subject: {
				type: "historischer_protokollordner_prüfphase",
				id: input.phase_id,
				label: phase.name,
			},
			metadata: {
				...audit.metadata,
				entwurf_id: phase.draft_id,
				revision: draftRevision,
				status: input.status,
				zeilen: rows.length,
				hinweis: input.note,
			},
		});
	});
	const [phase, draft] = await Promise.all([
		getHistoricalProtocolReviewPhase(input.phase_id),
		getHistoricalProtocolImportDraftSummary(draftId),
	]);
	return { phase, draft };
}

export async function completeHistoricalProtocolReviewPhase(
	input: PhaseTransitionInput,
	actor: AuthUser,
	audit: Omit<RecordAuditInput, "category" | "action" | "actor">,
): Promise<{
	phase: HistoricalProtocolReviewPhaseSummary;
	draft: Awaited<ReturnType<typeof getHistoricalProtocolImportDraftSummary>>;
}> {
	let draftId = "";
	await db.transaction(async (tx) => {
		const [phase] = await tx
			.select()
			.from(historicalProtocolImportReviewPhases)
			.where(
				and(
					eq(historicalProtocolImportReviewPhases.id, input.phase_id),
					eq(historicalProtocolImportReviewPhases.status, "active"),
					eq(
						historicalProtocolImportReviewPhases.revision,
						input.expected_phase_revision,
					),
				),
			)
			.limit(1);
		if (!phase) {
			throw new HistoricalProtocolDraftConflictError(
				"Die Prüfphase wurde zwischenzeitlich geändert. Bitte neu laden.",
			);
		}
		draftId = phase.draft_id;
		const aggregate = await aggregateForPhase(tx, phase.id);
		if (
			Number(aggregate?.pending ?? 0) > 0 ||
			Number(aggregate?.issue ?? 0) > 0 ||
			Number(aggregate?.total ?? 0) === 0
		) {
			throw new HistoricalProtocolDraftValidationError(
				"Die Prüfphase enthält noch offene oder beanstandete Zeilen",
				{
					valid: false,
					include: 0,
					review: 0,
					exclude: 0,
					invalidIncluded: [],
					reviewPhases: {
						total: 0,
						completed: 0,
						active: 0,
						uncoveredIncluded: 0,
					},
				},
			);
		}
		const draftRevision = await claimDraftRevision(
			tx,
			phase.draft_id,
			input.expected_draft_revision,
		);
		await tx
			.update(historicalProtocolImportReviewPhases)
			.set({
				status: "completed",
				revision: sql`${historicalProtocolImportReviewPhases.revision} + 1`,
				updated_at: new Date(),
				completed_by_user_id: actor.id,
				completed_by_name: actor.name,
				completed_at: new Date(),
			})
			.where(eq(historicalProtocolImportReviewPhases.id, phase.id));
		await recordAuditEventStrict(tx, {
			...audit,
			category: "umsaetze",
			action: "umsaetze.protocol_import_review_phase_completed",
			actor,
			subject: {
				type: "historischer_protokollordner_prüfphase",
				id: phase.id,
				label: phase.name,
			},
			metadata: {
				...audit.metadata,
				entwurf_id: phase.draft_id,
				revision: draftRevision,
				zeilen: Number(aggregate?.total ?? 0),
			},
		});
	});
	const [phase, draft] = await Promise.all([
		getHistoricalProtocolReviewPhase(input.phase_id),
		getHistoricalProtocolImportDraftSummary(draftId),
	]);
	return { phase, draft };
}

export async function reopenHistoricalProtocolReviewPhase(
	input: PhaseTransitionInput,
	actor: AuthUser,
	audit: Omit<RecordAuditInput, "category" | "action" | "actor">,
): Promise<{
	phase: HistoricalProtocolReviewPhaseSummary;
	draft: Awaited<ReturnType<typeof getHistoricalProtocolImportDraftSummary>>;
}> {
	let draftId = "";
	await db.transaction(async (tx) => {
		const [phase] = await tx
			.select()
			.from(historicalProtocolImportReviewPhases)
			.where(
				and(
					eq(historicalProtocolImportReviewPhases.id, input.phase_id),
					eq(historicalProtocolImportReviewPhases.status, "completed"),
					eq(
						historicalProtocolImportReviewPhases.revision,
						input.expected_phase_revision,
					),
				),
			)
			.limit(1);
		if (!phase) {
			throw new HistoricalProtocolDraftConflictError(
				"Nur eine unveränderte, abgeschlossene Prüfphase kann geöffnet werden",
			);
		}
		draftId = phase.draft_id;
		const draftRevision = await claimDraftRevision(
			tx,
			phase.draft_id,
			input.expected_draft_revision,
		);
		await tx
			.update(historicalProtocolImportReviewPhases)
			.set({
				status: "active",
				revision: sql`${historicalProtocolImportReviewPhases.revision} + 1`,
				updated_at: new Date(),
				completed_by_user_id: null,
				completed_by_name: null,
				completed_at: null,
			})
			.where(eq(historicalProtocolImportReviewPhases.id, phase.id));
		await recordAuditEventStrict(tx, {
			...audit,
			category: "umsaetze",
			action: "umsaetze.protocol_import_review_phase_reopened",
			actor,
			subject: {
				type: "historischer_protokollordner_prüfphase",
				id: phase.id,
				label: phase.name,
			},
			metadata: {
				...audit.metadata,
				entwurf_id: phase.draft_id,
				revision: draftRevision,
			},
		});
	});
	const [phase, draft] = await Promise.all([
		getHistoricalProtocolReviewPhase(input.phase_id),
		getHistoricalProtocolImportDraftSummary(draftId),
	]);
	return { phase, draft };
}
