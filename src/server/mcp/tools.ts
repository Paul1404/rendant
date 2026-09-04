import { call } from "@orpc/server";
import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import { AUDIT_CATEGORIES } from "@/lib/audit";
import {
	AnlassKatalogBulkAssignSchema,
	AnlassKatalogSchema,
	BelegnummerSettingsSchema,
	CashRegisterSchema,
	CreateProtokollSchema,
	ExportQuerySchema,
	HelperHourCategoryCreateSchema,
	HelperHourCategoryUpdateSchema,
	HelperHourEntriesSchema,
	HelperHourEntryCorrectSchema,
	HelperHourListSchema,
	HelperHourNameAliasCreateSchema,
	HelperHourNameAliasDeleteSchema,
	HistoricalProtocolDraftAnalyzeSchema,
	HistoricalProtocolDraftBulkUpdateSchema,
	HistoricalProtocolDraftGetSchema,
	HistoricalProtocolDraftListSchema,
	HistoricalProtocolDraftQuerySchema,
	HistoricalProtocolDraftTransitionSchema,
	HistoricalProtocolDraftUpdateItemSchema,
	HistoricalProtocolReviewPhaseCreateSchema,
	HistoricalProtocolReviewPhaseListSchema,
	HistoricalProtocolReviewPhasePlanSchema,
	HistoricalProtocolReviewPhaseQuerySchema,
	HistoricalProtocolReviewPhaseTransitionSchema,
	HistoricalProtocolReviewUpdateApplySchema,
	HistoricalProtocolReviewUpdatePlanSchema,
	HistoricalRevenueCancelSchema,
	HistoricalRevenueCorrectSchema,
	HistoricalRevenueCreateSchema,
	HistoricalRevenueGetSchema,
	HistoricalRevenuePageSchema,
	InviteCreateSchema,
	UmsatzUstBasisSettingsSchema,
	VereinSettingsSchema,
} from "@/lib/schemas";
import type { ORPCContext } from "@/server/orpc/base";
import { router } from "@/server/orpc/router";
import type { McpAccessMode } from "./auth";

type ToolAnnotations = {
	readOnlyHint: boolean;
	destructiveHint: boolean;
	idempotentHint: boolean;
};

export type McpTool = {
	name: string;
	description: string;
	minMode: McpAccessMode;
	input: v.GenericSchema;
	annotations: ToolAnnotations;
	execute: (context: ORPCContext, input: unknown) => Promise<unknown>;
};

const READ_ONLY: ToolAnnotations = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
};
const WRITE: ToolAnnotations = {
	readOnlyHint: false,
	destructiveHint: false,
	idempotentHint: false,
};
const DESTRUCTIVE: ToolAnnotations = {
	readOnlyHint: false,
	destructiveHint: true,
	idempotentHint: false,
};
const EmptyInput = v.object({});
const IdInput = v.object({ id: v.pipe(v.string(), v.minLength(1)) });
const DateInput = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/));

function defineTool<TSchema extends v.GenericSchema>(definition: {
	name: string;
	description: string;
	minMode: McpAccessMode;
	input: TSchema;
	annotations: ToolAnnotations;
	execute: (
		context: ORPCContext,
		input: v.InferOutput<TSchema>,
	) => Promise<unknown>;
}): McpTool {
	return definition as unknown as McpTool;
}

const TOOLS: McpTool[] = [
	defineTool({
		name: "system_health",
		description:
			"Check whether Rendant and its PostgreSQL database are healthy.",
		minMode: "readonly",
		input: EmptyInput,
		annotations: READ_ONLY,
		execute: (context) => call(router.health, undefined, { context }),
	}),
	defineTool({
		name: "list_protocols",
		description:
			"List cash-counting protocols with bounded date and text filters. Returns compact accounting rows; use get_protocol for denominations, expenses and VAT details.",
		minMode: "readonly",
		input: v.object({
			from: v.optional(DateInput),
			to: v.optional(DateInput),
			query: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(120))),
			includeCanceled: v.optional(v.boolean(), false),
			limit: v.optional(
				v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(500)),
				100,
			),
		}),
		annotations: READ_ONLY,
		execute: async (context, input) => {
			const rows = await call(
				router.protokolle.list,
				{ includeStorniert: input.includeCanceled },
				{ context },
			);
			const query = input.query?.toLocaleLowerCase("de");
			const matched = rows.filter((row) => {
				if (input.from && row.anlass_datum < input.from) return false;
				if (input.to && row.anlass_datum > input.to) return false;
				if (!query) return true;
				return [
					row.belegnummer,
					row.anlass,
					row.kassennummer,
					row.kassenbezeichnung,
					row.gezaehlt_von,
				]
					.join(" ")
					.toLocaleLowerCase("de")
					.includes(query);
			});
			return {
				total: matched.length,
				returned: Math.min(matched.length, input.limit),
				items: matched
					.slice(0, input.limit)
					.map(({ counts: _, ...row }) => row),
			};
		},
	}),
	defineTool({
		name: "get_protocol",
		description:
			"Get one protocol by UUID, including denomination counts, expenses, VAT allocation, PDF hashes and cancellation provenance.",
		minMode: "readonly",
		input: IdInput,
		annotations: READ_ONLY,
		execute: (context, input) =>
			call(router.protokolle.get, input, { context }),
	}),
	defineTool({
		name: "list_historical_revenues",
		description:
			"List historical revenue records, including source path and hash, cash and card detail, imported denomination and VAT evidence, warnings and cancellations.",
		minMode: "readonly",
		input: v.object({
			from: v.optional(DateInput),
			to: v.optional(DateInput),
			includeCanceled: v.optional(v.boolean(), false),
			query: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(120))),
			limit: v.optional(
				v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(500)),
				100,
			),
		}),
		annotations: READ_ONLY,
		execute: async (context, input) => {
			const rows = await call(router.historicalRevenue.list, undefined, {
				context,
			});
			const query = input.query?.toLocaleLowerCase("de");
			const matched = rows.filter((row) => {
				if (input.from && row.anlass_datum < input.from) return false;
				if (input.to && row.anlass_datum > input.to) return false;
				if (!input.includeCanceled && row.storniert_am) return false;
				if (!query) return true;
				return [
					row.anlass,
					row.vergleichsgruppe,
					row.quellreferenz,
					row.quelle_pfad,
					row.kassenbezeichnung,
				]
					.filter(Boolean)
					.join(" ")
					.toLocaleLowerCase("de")
					.includes(query);
			});
			return {
				total: matched.length,
				returned: Math.min(matched.length, input.limit),
				items: matched.slice(0, input.limit),
			};
		},
	}),
	defineTool({
		name: "query_historical_revenues",
		description:
			"Query historical revenue directly in PostgreSQL with bounded filters, sorting and pagination. Use this instead of loading the complete history for review work.",
		minMode: "readonly",
		input: HistoricalRevenuePageSchema,
		annotations: READ_ONLY,
		execute: (context, input) =>
			call(router.historicalRevenue.page, input, { context }),
	}),
	defineTool({
		name: "get_historical_revenue",
		description:
			"Get one historical revenue with source evidence, archived original-file status and correction predecessor or successor.",
		minMode: "readonly",
		input: HistoricalRevenueGetSchema,
		annotations: READ_ONLY,
		execute: (context, input) =>
			call(router.historicalRevenue.get, input, { context }),
	}),
	defineTool({
		name: "list_protocol_import_drafts",
		description:
			"List persistent historical protocol import drafts with status, revision, decision counts and selected totals. UI and MCP share these drafts.",
		minMode: "admin",
		input: HistoricalProtocolDraftListSchema,
		annotations: READ_ONLY,
		execute: (context, input) =>
			call(router.historicalProtocolImport.list, input, { context }),
	}),
	defineTool({
		name: "archive_protocol_import_draft",
		description:
			"Archive one exact open historical protocol draft revision. Archived drafts remain recoverable and auditable but disappear from the default work list.",
		minMode: "admin",
		input: HistoricalProtocolDraftTransitionSchema,
		annotations: WRITE,
		execute: (context, input) =>
			call(router.historicalProtocolImport.archive, input, { context }),
	}),
	defineTool({
		name: "restore_protocol_import_draft",
		description:
			"Restore one exact archived historical protocol draft revision as an editable work state.",
		minMode: "admin",
		input: HistoricalProtocolDraftTransitionSchema,
		annotations: WRITE,
		execute: (context, input) =>
			call(router.historicalProtocolImport.restore, input, { context }),
	}),
	defineTool({
		name: "get_protocol_import_draft",
		description:
			"Get one complete structured historical protocol import draft. This compatibility tool returns every row and can be large; prefer analyze_protocol_import_draft and query_protocol_import_draft_items for efficient work.",
		minMode: "admin",
		input: HistoricalProtocolDraftGetSchema,
		annotations: READ_ONLY,
		execute: (context, input) =>
			call(router.historicalProtocolImport.get, input, { context }),
	}),
	defineTool({
		name: "analyze_protocol_import_draft",
		description:
			"Analyze a historical protocol import draft with SQL-side filters. Returns matched totals, issue counts and facets without transferring full spreadsheet evidence. Use this first to identify safe working groups.",
		minMode: "admin",
		input: HistoricalProtocolDraftAnalyzeSchema,
		annotations: READ_ONLY,
		execute: (context, input) =>
			call(router.historicalProtocolImport.analyze, input, { context }),
	}),
	defineTool({
		name: "query_protocol_import_draft_items",
		description:
			"Query one bounded page of historical protocol import rows with SQL-side filters and sorting. Compact evidence is returned by default; request include_evidence only when full parser evidence is needed.",
		minMode: "admin",
		input: HistoricalProtocolDraftQuerySchema,
		annotations: READ_ONLY,
		execute: (context, input) =>
			call(router.historicalProtocolImport.queryItems, input, { context }),
	}),
	defineTool({
		name: "validate_protocol_import_draft",
		description:
			"Validate a historical protocol import draft and return unresolved review rows and incomplete included rows without changing it.",
		minMode: "admin",
		input: HistoricalProtocolDraftGetSchema,
		annotations: READ_ONLY,
		execute: (context, input) =>
			call(router.historicalProtocolImport.validate, input, { context }),
	}),
	defineTool({
		name: "update_protocol_import_draft_item",
		description:
			"Correct one structured import row or change its decision. Working-value corrections require a correction note and optimistic expected_revision.",
		minMode: "admin",
		input: HistoricalProtocolDraftUpdateItemSchema,
		annotations: WRITE,
		execute: async (context, input) => {
			const { items: _, ...summary } = await call(
				router.historicalProtocolImport.updateItem,
				input,
				{ context },
			);
			return summary;
		},
	}),
	defineTool({
		name: "bulk_update_protocol_import_draft_items",
		description:
			"Apply an audited decision or revenue-area correction to an exact set or parser group in an editable import draft.",
		minMode: "admin",
		input: HistoricalProtocolDraftBulkUpdateSchema,
		annotations: WRITE,
		execute: async (context, input) => {
			const { items: _, ...summary } = await call(
				router.historicalProtocolImport.bulkUpdate,
				input,
				{ context },
			);
			return summary;
		},
	}),
	defineTool({
		name: "mark_protocol_import_draft_ready",
		description:
			"Lock a fully reviewed import draft at its expected revision so it can be inspected before final import.",
		minMode: "admin",
		input: HistoricalProtocolDraftTransitionSchema,
		annotations: WRITE,
		execute: (context, input) =>
			call(router.historicalProtocolImport.markReady, input, { context }),
	}),
	defineTool({
		name: "plan_protocol_import_review_phase",
		description:
			"Preview an exact, server-side filtered review phase without changing the draft. Returns selection hash, totals and the current draft revision.",
		minMode: "admin",
		input: HistoricalProtocolReviewPhasePlanSchema,
		annotations: READ_ONLY,
		execute: (context, input) =>
			call(router.historicalProtocolImport.planReviewPhase, input, { context }),
	}),
	defineTool({
		name: "create_protocol_import_review_phase",
		description:
			"Persist a previously planned review phase with exact membership. This only creates a review workspace and does not import revenue records.",
		minMode: "admin",
		input: HistoricalProtocolReviewPhaseCreateSchema,
		annotations: WRITE,
		execute: (context, input) =>
			call(router.historicalProtocolImport.createReviewPhase, input, {
				context,
			}),
	}),
	defineTool({
		name: "list_protocol_import_review_phases",
		description:
			"List persisted review phases with progress, issue counts and accounting totals for one historical protocol draft.",
		minMode: "admin",
		input: HistoricalProtocolReviewPhaseListSchema,
		annotations: READ_ONLY,
		execute: (context, input) =>
			call(router.historicalProtocolImport.listReviewPhases, input, {
				context,
			}),
	}),
	defineTool({
		name: "query_protocol_import_review_phase_items",
		description:
			"Query a bounded page of rows in one review phase, optionally restricted to pending, accepted, issue or not_applicable.",
		minMode: "admin",
		input: HistoricalProtocolReviewPhaseQuerySchema,
		annotations: READ_ONLY,
		execute: (context, input) =>
			call(router.historicalProtocolImport.queryReviewPhaseItems, input, {
				context,
			}),
	}),
	defineTool({
		name: "plan_protocol_import_review_update",
		description:
			"Preview an exact review-status update for selected phase rows and return the hash required to apply it.",
		minMode: "admin",
		input: HistoricalProtocolReviewUpdatePlanSchema,
		annotations: READ_ONLY,
		execute: (context, input) =>
			call(router.historicalProtocolImport.planReviewUpdate, input, {
				context,
			}),
	}),
	defineTool({
		name: "apply_protocol_import_review_update",
		description:
			"Apply an audited accepted, issue or not_applicable review result to an exact previewed selection. This does not create historical revenue records.",
		minMode: "admin",
		input: HistoricalProtocolReviewUpdateApplySchema,
		annotations: WRITE,
		execute: (context, input) =>
			call(router.historicalProtocolImport.applyReviewUpdate, input, {
				context,
			}),
	}),
	defineTool({
		name: "complete_protocol_import_review_phase",
		description:
			"Complete an active review phase only when no pending or issue rows remain. This does not import revenue records.",
		minMode: "admin",
		input: HistoricalProtocolReviewPhaseTransitionSchema,
		annotations: WRITE,
		execute: (context, input) =>
			call(router.historicalProtocolImport.completeReviewPhase, input, {
				context,
			}),
	}),
	defineTool({
		name: "reopen_protocol_import_review_phase",
		description:
			"Reopen a completed review phase for additional audited work. This does not import revenue records.",
		minMode: "admin",
		input: HistoricalProtocolReviewPhaseTransitionSchema,
		annotations: WRITE,
		execute: (context, input) =>
			call(router.historicalProtocolImport.reopenReviewPhase, input, {
				context,
			}),
	}),
	defineTool({
		name: "reopen_protocol_import_draft",
		description:
			"Reopen a ready but not yet imported draft for further audited corrections.",
		minMode: "admin",
		input: HistoricalProtocolDraftTransitionSchema,
		annotations: WRITE,
		execute: (context, input) =>
			call(router.historicalProtocolImport.reopen, input, { context }),
	}),
	defineTool({
		name: "apply_protocol_import_draft",
		description:
			"Import the exact ready draft revision as immutable historical revenue records. Requires explicit user authorization and cannot edit the source evidence.",
		minMode: "admin",
		input: HistoricalProtocolDraftTransitionSchema,
		annotations: DESTRUCTIVE,
		execute: (context, input) =>
			call(router.historicalProtocolImport.apply, input, { context }),
	}),
	defineTool({
		name: "revenue_summary",
		description:
			"Summarize active protocol and historical revenue for a period. revenueCent is always gross revenue and is split into cashCent, cardCent and unknownPaymentCent without double counting.",
		minMode: "readonly",
		input: ExportQuerySchema,
		annotations: READ_ONLY,
		execute: async (context, input) => {
			const [protocols, historical] = await Promise.all([
				call(router.protokolle.list, { includeStorniert: false }, { context }),
				call(router.historicalRevenue.list, undefined, { context }),
			]);
			const groups = new Map<
				string,
				{
					protocols: number;
					historical: number;
					revenueCent: number;
					cashCent: number;
					expensesCent: number;
					cardCent: number;
					unknownPaymentCent: number;
				}
			>();
			const add = (
				key: string,
				type: "protocols" | "historical",
				revenueCent: number,
				cashCent: number,
				expensesCent: number,
				cardCent: number,
				unknownPaymentCent: number,
			) => {
				const group = groups.get(key) ?? {
					protocols: 0,
					historical: 0,
					revenueCent: 0,
					cashCent: 0,
					expensesCent: 0,
					cardCent: 0,
					unknownPaymentCent: 0,
				};
				group[type] += 1;
				group.revenueCent += revenueCent;
				group.cashCent += cashCent;
				group.expensesCent += expensesCent;
				group.cardCent += cardCent;
				group.unknownPaymentCent += unknownPaymentCent;
				groups.set(key, group);
			};
			for (const row of protocols) {
				if (row.anlass_datum < input.von || row.anlass_datum > input.bis)
					continue;
				add(
					row.umsatzbereich ?? "legacy",
					"protocols",
					row.tageseinnahmen_cent + row.kartenzahlung_cent,
					row.tageseinnahmen_cent,
					row.ausgaben_cent,
					row.kartenzahlung_cent,
					0,
				);
			}
			for (const row of historical) {
				if (
					row.storniert_am ||
					row.anlass_datum < input.von ||
					row.anlass_datum > input.bis
				)
					continue;
				const paymentKnown =
					row.tageseinnahmen_bar_cent != null &&
					row.kartenzahlung_cent != null &&
					row.tageseinnahmen_bar_cent + row.kartenzahlung_cent ===
						row.umsatz_cent;
				add(
					row.umsatzbereich ?? "legacy",
					"historical",
					row.umsatz_cent,
					paymentKnown ? (row.tageseinnahmen_bar_cent ?? 0) : 0,
					row.ausgaben_cent,
					paymentKnown ? (row.kartenzahlung_cent ?? 0) : 0,
					paymentKnown ? 0 : row.umsatz_cent,
				);
			}
			const byRevenueArea = Array.from(groups, ([revenueArea, values]) => ({
				revenueArea,
				...values,
				resultCent: values.revenueCent - values.expensesCent,
			})).sort((a, b) => b.revenueCent - a.revenueCent);
			const totals = byRevenueArea.reduce(
				(sum, row) => ({
					protocols: sum.protocols + row.protocols,
					historical: sum.historical + row.historical,
					revenueCent: sum.revenueCent + row.revenueCent,
					cashCent: sum.cashCent + row.cashCent,
					expensesCent: sum.expensesCent + row.expensesCent,
					cardCent: sum.cardCent + row.cardCent,
					unknownPaymentCent: sum.unknownPaymentCent + row.unknownPaymentCent,
					resultCent: sum.resultCent + row.resultCent,
				}),
				{
					protocols: 0,
					historical: 0,
					revenueCent: 0,
					cashCent: 0,
					expensesCent: 0,
					cardCent: 0,
					unknownPaymentCent: 0,
					resultCent: 0,
				},
			);
			return { from: input.von, to: input.bis, totals, byRevenueArea };
		},
	}),
	defineTool({
		name: "vat_summary",
		description:
			"Calculate revenue VAT and deductible input VAT by rate for active protocols in a date range. Historical revenues are intentionally excluded.",
		minMode: "readonly",
		input: ExportQuerySchema,
		annotations: READ_ONLY,
		execute: (context, input) => call(router.reports.vat, input, { context }),
	}),
	defineTool({
		name: "list_cash_registers",
		description:
			"List configured cash registers and their opening cash amounts.",
		minMode: "readonly",
		input: EmptyInput,
		annotations: READ_ONLY,
		execute: (context) => call(router.registers.list, undefined, { context }),
	}),
	defineTool({
		name: "list_revenue_catalog",
		description:
			"List managed recurring and one-off revenue catalog entries, including active state and update revision.",
		minMode: "readonly",
		input: EmptyInput,
		annotations: READ_ONLY,
		execute: (context) =>
			call(router.anlassKatalog.list, undefined, { context }),
	}),
	defineTool({
		name: "get_settings",
		description:
			"Read club master data, receipt-number configuration and the default VAT calculation basis. No secrets are returned.",
		minMode: "readonly",
		input: EmptyInput,
		annotations: READ_ONLY,
		execute: async (context) => {
			const [club, receiptNumber, vatBasis] = await Promise.all([
				call(router.settings.getVerein, undefined, { context }),
				call(router.settings.getBelegnummer, undefined, { context }),
				call(router.settings.getUmsatzUstBasis, undefined, { context }),
			]);
			return { club, receiptNumber, vatBasis };
		},
	}),
	defineTool({
		name: "list_users",
		description:
			"List Rendant user accounts, roles, blocked state and notification preference. Admin MCP access only.",
		minMode: "admin",
		input: EmptyInput,
		annotations: READ_ONLY,
		execute: (context) => call(router.users.list, undefined, { context }),
	}),
	defineTool({
		name: "list_invites",
		description:
			"List pending and accepted account invitations. Admin MCP access only.",
		minMode: "admin",
		input: EmptyInput,
		annotations: READ_ONLY,
		execute: (context) => call(router.invites.list, undefined, { context }),
	}),
	defineTool({
		name: "list_audit_events",
		description:
			"Search the append-only business and security audit trail. Results are paginated and bounded to 100 rows.",
		minMode: "admin",
		input: v.object({
			page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
			pageSize: v.optional(
				v.pipe(v.number(), v.integer(), v.minValue(10), v.maxValue(100)),
				50,
			),
			category: v.optional(v.picklist(AUDIT_CATEGORIES)),
			query: v.optional(v.pipe(v.string(), v.maxLength(100))),
		}),
		annotations: READ_ONLY,
		execute: (context, input) => call(router.audit.list, input, { context }),
	}),
	defineTool({
		name: "helper_hours_overview",
		description:
			"Helper-hour standing per department in hours: earned, deducted and available, plus the club contribution, the category list and the most active helpers. Everything is expressed in hours; the hourly value is only what converts a purchase into deducted hours.",
		minMode: "readonly",
		input: HelperHourListSchema,
		annotations: READ_ONLY,
		execute: (context, input) =>
			call(router.helperHours.list, input, { context }),
	}),
	defineTool({
		name: "list_helper_hours",
		description:
			"List individual helper-hour entries with their category split, source sheet and import warnings. Filter by year, category, source and free text.",
		minMode: "readonly",
		input: HelperHourEntriesSchema,
		annotations: READ_ONLY,
		execute: (context, input) =>
			call(router.helperHours.entries, input, { context }),
	}),
	defineTool({
		name: "list_helper_hour_categories",
		description:
			"List the configurable helper-hour points (departments and club contributions) with how many entries, hours and deductions each carries.",
		minMode: "readonly",
		input: EmptyInput,
		annotations: READ_ONLY,
		execute: (context) =>
			call(router.helperHours.categories, undefined, { context }),
	}),
	defineTool({
		name: "list_helper_name_variants",
		description:
			"Spellings among the stored helper hours that may be the same person, e.g. 'Schad, Mathias' against 'Schad, Matthias'. Each side reports its entries and hours so a human can judge. Pairs already settled by a name variant are omitted. Reporting only: never merge without explicit user authorization, and note that two similar names can be two real people.",
		minMode: "readonly",
		input: EmptyInput,
		annotations: READ_ONLY,
		execute: (context) =>
			call(router.helperHours.nameVariants, undefined, { context }),
	}),
	defineTool({
		name: "list_helper_name_aliases",
		description:
			"List the stored name variants, each mapping a spelling the list uses to the spelling the club decided on.",
		minMode: "readonly",
		input: EmptyInput,
		annotations: READ_ONLY,
		execute: (context) =>
			call(router.helperHours.nameAliases, undefined, { context }),
	}),
	defineTool({
		name: "merge_helper_name",
		description:
			"Record that one spelling means another and rewrite the hours already stored under it. The mapping is kept and reapplied on every future import, so a re-import of the same list does not undo it. Two similar names can be two different people, so requires explicit user authorization for the specific pair.",
		minMode: "admin",
		input: HelperHourNameAliasCreateSchema,
		annotations: WRITE,
		execute: (context, input) =>
			call(router.helperHours.createNameAlias, input, { context }),
	}),
	defineTool({
		name: "delete_helper_name_alias",
		description:
			"Remove a stored name variant. Hours already rewritten keep the target spelling; only future imports stop applying it. Requires explicit user authorization.",
		minMode: "admin",
		input: HelperHourNameAliasDeleteSchema,
		annotations: DESTRUCTIVE,
		execute: (context, input) =>
			call(router.helperHours.deleteNameAlias, input, { context }),
	}),
	defineTool({
		name: "correct_helper_hour_entry",
		description:
			"Correct one stored helper-hour entry's name or category split. The total is recomputed from the split, the values as first imported are preserved, and a reason is required. Requires explicit user authorization.",
		minMode: "admin",
		input: HelperHourEntryCorrectSchema,
		annotations: WRITE,
		execute: (context, input) =>
			call(router.helperHours.correctEntry, input, { context }),
	}),
	defineTool({
		name: "create_helper_hour_category",
		description:
			"Create a helper-hour point, either a department that builds its own balance or a club contribution. A point with the same name as a column in the helper-hour spreadsheet is picked up by the next import automatically.",
		minMode: "admin",
		input: HelperHourCategoryCreateSchema,
		annotations: WRITE,
		execute: (context, input) =>
			call(router.helperHours.createCategory, input, { context }),
	}),
	defineTool({
		name: "update_helper_hour_category",
		description:
			"Rename a helper-hour point, change its kind or deactivate it. Renaming changes which spreadsheet column the import matches, so keep the list in step.",
		minMode: "admin",
		input: HelperHourCategoryUpdateSchema,
		annotations: WRITE,
		execute: (context, input) =>
			call(router.helperHours.updateCategory, input, { context }),
	}),
	defineTool({
		name: "create_protocol",
		description:
			"Create an audited cash-counting protocol through the same transactional business logic as the UI. Requires a UUID idempotency key and explicit user authorization.",
		minMode: "admin",
		input: CreateProtokollSchema,
		annotations: WRITE,
		execute: (context, input) =>
			call(router.protokolle.create, input, { context }),
	}),
	defineTool({
		name: "cancel_protocol",
		description:
			"Cancel a protocol without deleting its original record. Creates an audited cancellation and cancellation PDF. Use only after explicit user authorization.",
		minMode: "admin",
		input: v.object({
			id: v.pipe(v.string(), v.uuid()),
			storno_grund: v.pipe(v.string(), v.minLength(5), v.maxLength(500)),
		}),
		annotations: DESTRUCTIVE,
		execute: (context, input) =>
			call(router.protokolle.storno, input, { context }),
	}),
	defineTool({
		name: "regenerate_protocol_pdf",
		description:
			"Regenerate and replace the PDF for one existing protocol through the audited application service.",
		minMode: "admin",
		input: IdInput,
		annotations: WRITE,
		execute: (context, input) =>
			call(router.protokolle.regeneratePdf, input, { context }),
	}),
	defineTool({
		name: "create_historical_revenue",
		description:
			"Create an immutable audited historical revenue record. Requires a UUID idempotency key and explicit user authorization.",
		minMode: "admin",
		input: HistoricalRevenueCreateSchema,
		annotations: WRITE,
		execute: (context, input) =>
			call(router.historicalRevenue.create, input, { context }),
	}),
	defineTool({
		name: "cancel_historical_revenue",
		description:
			"Cancel an immutable historical revenue record with a reason. The original remains preserved. Use only after explicit user authorization.",
		minMode: "admin",
		input: HistoricalRevenueCancelSchema,
		annotations: DESTRUCTIVE,
		execute: (context, input) =>
			call(router.historicalRevenue.cancel, input, { context }),
	}),
	defineTool({
		name: "correct_historical_revenue",
		description:
			"Create an audited correction for one active historical revenue. The original is cancelled and preserved, while a linked replacement is created atomically. Requires explicit user authorization.",
		minMode: "admin",
		input: HistoricalRevenueCorrectSchema,
		annotations: WRITE,
		execute: (context, input) =>
			call(router.historicalRevenue.correct, input, { context }),
	}),
	defineTool({
		name: "create_cash_register",
		description: "Create an audited cash register configuration entry.",
		minMode: "admin",
		input: CashRegisterSchema,
		annotations: WRITE,
		execute: (context, input) =>
			call(router.registers.create, input, { context }),
	}),
	defineTool({
		name: "update_cash_register",
		description:
			"Update an existing cash register through the audited settings workflow.",
		minMode: "admin",
		input: v.object({
			id: v.pipe(v.string(), v.uuid()),
			...CashRegisterSchema.entries,
		}),
		annotations: WRITE,
		execute: (context, input) =>
			call(router.registers.update, input, { context }),
	}),
	defineTool({
		name: "delete_cash_register",
		description:
			"Delete an unused cash register configuration. Use only after explicit user authorization.",
		minMode: "admin",
		input: IdInput,
		annotations: DESTRUCTIVE,
		execute: (context, input) =>
			call(router.registers.remove, input, { context }),
	}),
	defineTool({
		name: "create_revenue_catalog_entry",
		description:
			"Create an audited recurring or one-off revenue catalog entry.",
		minMode: "admin",
		input: AnlassKatalogSchema,
		annotations: WRITE,
		execute: (context, input) =>
			call(router.anlassKatalog.create, input, { context }),
	}),
	defineTool({
		name: "update_revenue_catalog_entry",
		description:
			"Update a revenue catalog entry with optimistic concurrency via expected_updated_at.",
		minMode: "admin",
		input: v.object({
			id: v.pipe(v.string(), v.uuid()),
			expected_updated_at: v.pipe(v.string(), v.minLength(1)),
			...AnlassKatalogSchema.entries,
		}),
		annotations: WRITE,
		execute: (context, input) =>
			call(router.anlassKatalog.update, input, { context }),
	}),
	defineTool({
		name: "delete_revenue_catalog_entry",
		description:
			"Delete an unreferenced revenue catalog entry. Referenced entries must be deactivated instead.",
		minMode: "admin",
		input: IdInput,
		annotations: DESTRUCTIVE,
		execute: (context, input) =>
			call(router.anlassKatalog.remove, input, { context }),
	}),
	defineTool({
		name: "bulk_assign_revenue_catalog",
		description:
			"Audited bulk assignment of protocol and historical rows to a target revenue catalog entry. Use only after previewing exact IDs and obtaining explicit authorization.",
		minMode: "admin",
		input: AnlassKatalogBulkAssignSchema,
		annotations: WRITE,
		execute: (context, input) =>
			call(router.anlassKatalog.bulkAssign, input, { context }),
	}),
	defineTool({
		name: "update_receipt_number_settings",
		description: "Update audited receipt-number formatting settings.",
		minMode: "admin",
		input: BelegnummerSettingsSchema,
		annotations: WRITE,
		execute: (context, input) =>
			call(router.settings.updateBelegnummer, input, { context }),
	}),
	defineTool({
		name: "update_vat_basis_setting",
		description:
			"Update the audited default VAT calculation basis for new protocols.",
		minMode: "admin",
		input: UmsatzUstBasisSettingsSchema,
		annotations: WRITE,
		execute: (context, input) =>
			call(router.settings.updateUmsatzUstBasis, input, { context }),
	}),
	defineTool({
		name: "update_club_settings",
		description:
			"Update audited club master data used in Rendant and generated PDFs.",
		minMode: "admin",
		input: VereinSettingsSchema,
		annotations: WRITE,
		execute: (context, input) =>
			call(router.settings.updateVerein, input, { context }),
	}),
	defineTool({
		name: "create_invite",
		description:
			"Create an audited user invitation and send it when email is configured. This is an external side effect and requires explicit user authorization.",
		minMode: "identity",
		input: InviteCreateSchema,
		annotations: WRITE,
		execute: (context, input) =>
			call(router.invites.create, input, { context }),
	}),
	defineTool({
		name: "revoke_invite",
		description:
			"Revoke a pending user invitation after explicit authorization.",
		minMode: "identity",
		input: IdInput,
		annotations: DESTRUCTIVE,
		execute: (context, input) =>
			call(router.invites.revoke, input, { context }),
	}),
	defineTool({
		name: "set_user_role",
		description:
			"Change a user's role and revoke their sessions. Last-admin protections remain enforced. Requires explicit authorization.",
		minMode: "identity",
		input: v.object({
			id: v.pipe(v.string(), v.minLength(1)),
			role: v.picklist(["user", "admin"]),
		}),
		annotations: WRITE,
		execute: (context, input) => call(router.users.setRole, input, { context }),
	}),
	defineTool({
		name: "set_user_blocked",
		description:
			"Block or unblock a user. Blocking revokes sessions; self and last-admin protections remain enforced. Requires explicit authorization.",
		minMode: "identity",
		input: v.object({
			id: v.pipe(v.string(), v.minLength(1)),
			banned: v.boolean(),
		}),
		annotations: DESTRUCTIVE,
		execute: (context, input) =>
			call(router.users.setBanned, input, { context }),
	}),
	defineTool({
		name: "set_user_notification",
		description: "Update a user's new-protocol email notification preference.",
		minMode: "admin",
		input: v.object({
			id: v.pipe(v.string(), v.minLength(1)),
			notify: v.boolean(),
		}),
		annotations: WRITE,
		execute: (context, input) =>
			call(router.users.setNotify, input, { context }),
	}),
];

// Account administration is deliberately not reachable with a static bearer
// token. MCP_ACCESS_MODE=admin still cannot invite an admin, change a role or
// block a user: a leaked token, or text injected through an imported spreadsheet
// that steers the model, would otherwise be enough to escalate, and the audit
// trail would record only "mcp:...", never the human.
export function toolsForMode(mode: McpAccessMode): McpTool[] {
	if (mode === "identity") return TOOLS;
	if (mode === "admin") {
		return TOOLS.filter((tool) => tool.minMode !== "identity");
	}
	return TOOLS.filter((tool) => tool.minMode === "readonly");
}

export function toolJsonSchema(tool: McpTool): Record<string, unknown> {
	return toJsonSchema(tool.input, { errorMode: "ignore" }) as Record<
		string,
		unknown
	>;
}
