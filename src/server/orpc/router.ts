import { ORPCError } from "@orpc/server";
import * as v from "valibot";
import { AUDIT_CATEGORIES } from "@/lib/audit";
import { todayIsoDate } from "@/lib/date";
import { CLUB_ROLES, hasPermission } from "@/lib/permissions";
import {
	AnlassKatalogBulkAssignSchema,
	AnlassKatalogSchema,
	BelegnummerSettingsSchema,
	CashRegisterSchema,
	CreateProtokollSchema,
	DatevResolveSchema,
	DatevSendSchema,
	DatevSettingsSchema,
	DatevStatusSchema,
	EmailSettingsSchema,
	ExportQuerySchema,
	HelperHourAliasCreateSchema,
	HelperHourAliasDeleteSchema,
	HelperHourCategoryCreateSchema,
	HelperHourCategoryDeleteSchema,
	HelperHourCategoryUpdateSchema,
	HelperHourCreateSchema,
	HelperHourEntriesSchema,
	HelperHourEntryCorrectSchema,
	HelperHourEntryDeleteSchema,
	HelperHourEventMergeSchema,
	HelperHourEventSchema,
	HelperHourEventUpdateSchema,
	HelperHourExpenseCancelSchema,
	HelperHourExpenseCreateSchema,
	HelperHourListSchema,
	HelperHourNoteRuleCreateSchema,
	HelperHourNoteRuleDeleteSchema,
	HelperHourPersonMergeSchema,
	HelperHourPersonSchema,
	HelperHourPersonUpdateSchema,
	HelperHourValueSchema,
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
	InviteAcceptSchema,
	InviteCreateSchema,
	ProtokollReclassifySchema,
	RolePolicyUpdateSchema,
	StornoSchema,
	SumupDaysSchema,
	SumupSettingsSchema,
	TestEmailSchema,
	UmsatzUstBasisSettingsSchema,
	VereinSettingsSchema,
} from "@/lib/schemas";
import { globalDb } from "@/server/db";
import { logger } from "@/server/logger";
import { getMcpStatus } from "@/server/mcp/auth";
import {
	AnlassKatalogConcurrencyError,
	bulkAssignKatalog,
	createKatalog,
	deleteKatalog,
	listKatalog,
	updateKatalog,
} from "@/server/services/anlass-catalog";
import {
	listAuditEvents,
	recordAuditEvent,
	requestAuditContext,
} from "@/server/services/audit";
import { previewNextBelegnummer } from "@/server/services/belegnummer";
import {
	createCashRegister,
	deleteCashRegister,
	listCashRegisters,
	updateCashRegister,
} from "@/server/services/cash-registers";
import {
	getDatevSettings,
	getDatevStatus,
	resolveDatevDelivery,
	sendDatevProtocol,
	updateDatevSettings,
} from "@/server/services/datev";
import {
	getEmailSettings,
	sendInvitationEmail,
	sendTestEmail,
	updateEmailSettings,
} from "@/server/services/email";
import {
	createHelperHourAlias,
	createHelperHourEvent,
	createHelperHourPerson,
	deleteHelperHourAlias,
	listHelperHourCatalog,
	mergeHelperHourEvents,
	mergeHelperHourPersons,
	updateHelperHourEvent,
	updateHelperHourPerson,
} from "@/server/services/helper-hour-catalog";
import {
	createHelperHourCategory,
	deleteHelperHourCategory,
	listHelperHourCategoriesWithUsage,
	updateHelperHourCategory,
} from "@/server/services/helper-hour-categories";
import {
	cancelHelperHourExpense,
	correctHelperHourEntry,
	createHelperHour,
	createHelperHourExpense,
	createHelperHourNoteRule,
	deleteHelperHourEntry,
	deleteHelperHourNoteRule,
	listHelperHourEntries,
	listHelperHourNameVariants,
	listHelperHourNoteRules,
	listHelperHours,
} from "@/server/services/helper-hours";
import {
	analyzeHistoricalProtocolImportDraft,
	applyHistoricalProtocolImportDraft,
	archiveHistoricalProtocolImportDraft,
	bulkUpdateHistoricalProtocolImportDraftItems,
	getHistoricalProtocolImportDraft,
	getHistoricalProtocolImportDraftSummary,
	HistoricalProtocolDraftConflictError,
	HistoricalProtocolDraftNotFoundError,
	HistoricalProtocolDraftValidationError,
	listHistoricalProtocolImportDrafts,
	markHistoricalProtocolImportDraftReady,
	queryHistoricalProtocolImportDraftItems,
	reopenHistoricalProtocolImportDraft,
	restoreHistoricalProtocolImportDraft,
	updateHistoricalProtocolImportDraftItem,
	validateHistoricalProtocolImportDraft,
} from "@/server/services/historical-protocol-import-draft";
import {
	applyHistoricalProtocolReviewUpdate,
	completeHistoricalProtocolReviewPhase,
	createHistoricalProtocolReviewPhase,
	listHistoricalProtocolReviewPhases,
	planHistoricalProtocolReviewPhase,
	planHistoricalProtocolReviewUpdate,
	queryHistoricalProtocolReviewPhaseItems,
	reopenHistoricalProtocolReviewPhase,
} from "@/server/services/historical-protocol-review-phase";
import {
	cancelHistoricalRevenue,
	correctHistoricalRevenue,
	createHistoricalRevenue,
	getHistoricalRevenueDetails,
	HistoricalRevenueCatalogError,
	HistoricalRevenueConflictError,
	HistoricalRevenueInputError,
	HistoricalRevenueNotFoundError,
	listHistoricalRevenuePage,
	listHistoricalRevenues,
} from "@/server/services/historical-revenue";
import {
	acceptInvite,
	createInvite,
	getValidInvite,
	listInvites,
	revokeInvite,
} from "@/server/services/invitations";
import {
	getUserNotifyPref,
	setUserNotifyPref,
} from "@/server/services/notification-prefs";
import {
	requestInvitePasswordReset,
	requestMemberPasswordReset,
} from "@/server/services/password-recovery";
import {
	createProtokoll,
	getProtokoll,
	listProtokolle,
	ProtokollIdempotencyConflictError,
	reclassifyProtokolle,
	regenerateProtokollPdf,
	SumupDayTakenError,
	stornoProtokoll,
} from "@/server/services/protokoll";
import { tenantPublicBaseUrl } from "@/server/services/public-url";
import { vatSummary } from "@/server/services/reports";
import {
	getRolePolicyForCurrentTenant,
	updateRolePolicy,
} from "@/server/services/role-policy";
import {
	getBelegnummerSettings,
	getHelperHourValueCent,
	getSettingsStamp,
	getUmsatzUstBasisDefault,
	getVereinStammdaten,
	updateBelegnummerSettings,
	updateHelperHourValueCent,
	updateUmsatzUstBasisDefault,
	updateVereinStammdaten,
} from "@/server/services/settings";
import {
	fetchSumupDays,
	getSumupSettings,
	isSumupActive,
	SumupError,
	SumupMismatchError,
	updateSumupSettings,
} from "@/server/services/sumup";
import {
	listTenantUsers,
	setTenantUserBanned,
	setTenantUserRole,
} from "@/server/services/tenants";
import { authed, permitted, permittedAny, pub } from "./base";
import { operators } from "./operator";

const idInput = v.object({ id: v.pipe(v.string(), v.minLength(1)) });

// ---- Protokolle ----------------------------------------------------------

const protokolle = {
	datevStatus: permitted("datev.send", "finance.read")
		.input(DatevStatusSchema)
		.handler(({ input }) => getDatevStatus(input.id)),
	sendDatev: permitted("datev.send", "finance.read")
		.input(DatevSendSchema)
		.handler(({ input, context }) =>
			sendDatevProtocol(input, {
				actor: context.user,
				request: requestAuditContext(context),
			}),
		),
	resolveDatev: permitted("datev.send", "finance.read")
		.input(DatevResolveSchema)
		.handler(({ input, context }) =>
			resolveDatevDelivery(input, {
				actor: context.user,
				request: requestAuditContext(context),
			}),
		),
	list: permitted("finance.read")
		.input(v.object({ includeStorniert: v.optional(v.boolean(), false) }))
		.handler(({ input }) =>
			listProtokolle({ includeStorniert: input.includeStorniert }),
		),

	get: permitted("finance.read")
		.input(idInput)
		.handler(async ({ input }) => {
			const detail = await getProtokoll(input.id);
			if (!detail)
				throw new ORPCError("NOT_FOUND", { message: "Nicht gefunden" });
			return detail;
		}),

	nextBelegnummer: permitted("finance.read").handler(async () => ({
		belegnummer: await previewNextBelegnummer(),
	})),

	// Kartenumsätze je Tag aus SumUp für einen Zeitraum, samt Hinweis, welche
	// Tage schon in einem Protokoll stecken. Reiner Lesezugriff; was davon in
	// das Protokoll wandert, entscheidet der Erfasser im Dialog.
	sumupDays: permitted("finance.read")
		.input(SumupDaysSchema)
		.handler(async ({ input, context }) => {
			try {
				const result = await fetchSumupDays(input.von, input.bis);
				await recordAuditEvent({
					category: "protokolle",
					action: "protokolle.sumup_days_fetched",
					actor: context.user,
					subject: {
						type: "sumup",
						id: `${input.von}_${input.bis}`,
						label: `${input.von} bis ${input.bis}`,
					},
					request: requestAuditContext(context),
					metadata: {
						von: input.von,
						bis: input.bis,
						tage_mit_umsatz: result.tage.filter((d) => d.anzahl > 0).length,
						kartenzahlung_cent: result.tage.reduce(
							(s, d) => s + d.kartenzahlung_cent,
							0,
						),
					},
				});
				return result;
			} catch (e) {
				if (e instanceof SumupError) {
					throw new ORPCError(
						e.code === "NOT_CONFIGURED" ? "PRECONDITION_FAILED" : "BAD_GATEWAY",
						{ message: e.message },
					);
				}
				throw e;
			}
		}),

	create: permitted("protocols.create", "finance.read")
		.input(CreateProtokollSchema)
		.handler(async ({ input, context }) => {
			try {
				const created = await createProtokoll(input, context.user, {
					request: requestAuditContext(context),
				});
				return created;
			} catch (e) {
				if (e instanceof ProtokollIdempotencyConflictError) {
					throw new ORPCError("CONFLICT", { message: e.message });
				}
				if (e instanceof SumupDayTakenError) {
					throw new ORPCError("CONFLICT", { message: e.message });
				}
				if (e instanceof SumupMismatchError) {
					throw new ORPCError("CONFLICT", { message: e.message });
				}
				if (e instanceof SumupError) {
					throw new ORPCError("BAD_GATEWAY", {
						message: `${e.message} Alternativ die Kartenzahlung ohne SumUp-Verknüpfung speichern.`,
					});
				}
				const msg = (e as Error).message;
				if (msg === "Belegnummer bereits vergeben") {
					throw new ORPCError("CONFLICT", { message: msg });
				}
				if (msg.startsWith("Summe der USt")) {
					throw new ORPCError("BAD_REQUEST", { message: msg });
				}
				if (msg.startsWith("Betrag oder Stückzahl")) {
					throw new ORPCError("BAD_REQUEST", { message: msg });
				}
				if (msg === "Umsatzgruppe wurde nicht gefunden") {
					throw new ORPCError("BAD_REQUEST", { message: msg });
				}
				if (msg.startsWith("Veranstaltungsbezeichnung ist")) {
					throw new ORPCError("BAD_REQUEST", { message: msg });
				}
				throw e;
			}
		}),

	// The Umsatzbereich is a reporting classification, not part of the signed
	// document, so it can be corrected without a storno. Admin-only and with a
	// reason, like every other change to a booked record.
	reclassify: permitted("protocols.reclassify", "finance.read")
		.input(ProtokollReclassifySchema)
		.handler(({ input, context }) =>
			reclassifyProtokolle(input, context.user, {
				request: requestAuditContext(context),
			}),
		),

	// Admin-only, like every other destructive accounting operation and like the
	// MCP layer already classified it.
	storno: permitted("protocols.cancel", "finance.read")
		.input(
			v.object({
				id: v.pipe(v.string(), v.minLength(1)),
				...StornoSchema.entries,
			}),
		)
		.handler(async ({ input, context }) => {
			try {
				await stornoProtokoll(
					input.id,
					{ storno_grund: input.storno_grund },
					context.user,
					{ request: requestAuditContext(context) },
				);
				return { ok: true };
			} catch (e) {
				const msg = (e as Error).message;
				if (msg === "Protokoll nicht gefunden") {
					throw new ORPCError("NOT_FOUND", { message: msg });
				}
				if (msg === "Protokoll ist bereits storniert") {
					throw new ORPCError("CONFLICT", { message: msg });
				}
				throw e;
			}
		}),

	// Regeneration remains admin-only and retains previously published documents
	// so historical database recovery points still reference available evidence.
	regeneratePdf: permitted("documents.regenerate", "finance.read")
		.input(idInput)
		.handler(async ({ input, context }) => {
			try {
				const detail = await getProtokoll(input.id);
				await regenerateProtokollPdf(input.id);
				await recordAuditEvent({
					category: "protokolle",
					action: "protokolle.pdf_regenerated",
					actor: context.user,
					subject: {
						type: "protokoll",
						id: input.id,
						label: detail?.protokoll.belegnummer,
					},
					request: requestAuditContext(context),
				});
				return { ok: true };
			} catch (e) {
				if ((e as Error).message === "Protokoll nicht gefunden") {
					throw new ORPCError("NOT_FOUND", {
						message: "Protokoll nicht gefunden",
					});
				}
				throw e;
			}
		}),
};

// ---- Settings ------------------------------------------------------------

const settings = {
	getDatev: permitted("integrations.manage").handler(() => getDatevSettings()),
	updateDatev: permitted("integrations.manage")
		.input(DatevSettingsSchema)
		.handler(({ input, context }) =>
			updateDatevSettings(input, {
				actor: context.user,
				request: requestAuditContext(context),
			}),
		),
	getMcp: permitted("integrations.manage").handler(() => getMcpStatus()),

	getBelegnummer: authed.handler(async () => ({
		settings: await getBelegnummerSettings(),
		preview: await previewNextBelegnummer(),
		updated_at: await getSettingsStamp("belegnummer_updated_at"),
	})),

	updateBelegnummer: permitted("settings.manage")
		.input(BelegnummerSettingsSchema)
		.handler(async ({ input, context }) => {
			const updated = await updateBelegnummerSettings(
				{
					min_digits: input.min_digits,
					prefix: input.prefix,
					include_year: input.include_year,
					year_format: input.year_format,
					separator: input.separator,
				},
				{
					category: "settings",
					action: "settings.belegnummer_changed",
					actor: context.user,
					subject: {
						type: "settings",
						id: "belegnummer",
						label: "Belegnummern",
					},
					request: requestAuditContext(context),
					metadata: {
						prefix: input.prefix,
						min_digits: input.min_digits,
						include_year: input.include_year,
						year_format: input.year_format,
						separator: input.separator,
					},
				},
				input.expected_updated_at,
			);
			return {
				settings: updated,
				preview: await previewNextBelegnummer(),
				updated_at: await getSettingsStamp("belegnummer_updated_at"),
			};
		}),

	getUmsatzUstBasis: authed.handler(async () => ({
		umsatz_ust_basis: await getUmsatzUstBasisDefault(),
		updated_at: await getSettingsStamp("umsatz_ust_updated_at"),
	})),

	updateUmsatzUstBasis: permitted("settings.manage")
		.input(UmsatzUstBasisSettingsSchema)
		.handler(async ({ input, context }) => {
			const umsatz_ust_basis = await updateUmsatzUstBasisDefault(
				input.umsatz_ust_basis,
				{
					category: "settings",
					action: "settings.ust_basis_changed",
					actor: context.user,
					subject: {
						type: "settings",
						id: "ust_basis",
						label: "USt.-Grundlage",
					},
					request: requestAuditContext(context),
					metadata: { umsatz_ust_basis: input.umsatz_ust_basis },
				},
				input.expected_updated_at,
			);
			return {
				umsatz_ust_basis,
				updated_at: await getSettingsStamp("umsatz_ust_updated_at"),
			};
		}),

	getHelperHourValue: authed.handler(async () => ({
		wert_cent: await getHelperHourValueCent(),
		updated_at: await getSettingsStamp("helferstunde_wert_updated_at"),
	})),

	updateHelperHourValue: permitted("settings.manage")
		.input(HelperHourValueSchema)
		.handler(async ({ input, context }) => ({
			wert_cent: await updateHelperHourValueCent(
				input.wert_cent,
				{
					category: "settings",
					action: "settings.helferstunde_wert_changed",
					actor: context.user,
					subject: {
						type: "settings",
						id: "helferstunde_wert",
						label: "Helferstundenwert",
					},
					request: requestAuditContext(context),
					metadata: { wert_cent: input.wert_cent },
				},
				input.expected_updated_at,
			),
			updated_at: await getSettingsStamp("helferstunde_wert_updated_at"),
		})),

	getVerein: authed.handler(async () => ({
		...(await getVereinStammdaten()),
		updated_at: await getSettingsStamp("verein_updated_at"),
	})),

	updateVerein: permitted("settings.manage")
		.input(VereinSettingsSchema)
		.handler(async ({ input, context }) => {
			const result = await updateVereinStammdaten(
				{
					name: input.vereinsname,
					strasse: input.strasse,
					plz: input.plz,
					ort: input.ort,
					vorstand: input.vorstand,
					registergericht: input.registergericht,
					registernummer: input.registernummer,
				},
				{
					category: "settings",
					action: "settings.verein_changed",
					actor: context.user,
					subject: { type: "settings", id: "verein", label: input.vereinsname },
					request: requestAuditContext(context),
					metadata: { vereinsname: input.vereinsname },
				},
				input.expected_updated_at,
			);
			return {
				...result,
				updated_at: await getSettingsStamp("verein_updated_at"),
			};
		}),

	getEmail: permitted("integrations.manage").handler(() => getEmailSettings()),

	updateEmail: permitted("integrations.manage")
		.input(EmailSettingsSchema)
		.handler(async ({ input, context }) => {
			try {
				const result = await updateEmailSettings(
					{
						enabled: input.enabled,
						host: input.host,
						port: input.port,
						security: input.security,
						user: input.user,
						password: input.password,
						clear_password: input.clear_password,
						from: input.from,
						notify_new_protokoll: input.notify_new_protokoll,
						recipients: input.recipients,
					},
					{
						category: "settings",
						action: "settings.email_changed",
						actor: context.user,
						subject: { type: "settings", id: "email", label: "E-Mail" },
						request: requestAuditContext(context),
						metadata: {
							enabled: input.enabled,
							host: input.host,
							port: input.port,
							security: input.security,
							from: input.from,
							notify_new_protokoll: input.notify_new_protokoll,
							password_changed: Boolean(input.password || input.clear_password),
						},
					},
				);
				return result;
			} catch (e) {
				logger.error("email settings update failed", { error: e });
				throw new ORPCError("BAD_REQUEST", {
					message:
						"Die E-Mail-Einstellungen konnten nicht gespeichert werden. Bitte Eingaben prüfen und erneut versuchen.",
				});
			}
		}),

	getSumup: permitted("integrations.manage").handler(() => getSumupSettings()),

	// Für das Protokollformular: nur ob der Abruf angeboten wird, kein Detail.
	getSumupActive: authed.handler(async () => ({
		active: await isSumupActive(),
	})),

	updateSumup: permitted("integrations.manage")
		.input(SumupSettingsSchema)
		.handler(async ({ input, context }) => {
			try {
				return await updateSumupSettings(
					{
						enabled: input.enabled,
						api_key: input.api_key,
						clear_api_key: input.clear_api_key,
					},
					{
						category: "settings",
						action: "settings.sumup_changed",
						actor: context.user,
						subject: { type: "settings", id: "sumup", label: "SumUp" },
						request: requestAuditContext(context),
						metadata: {
							enabled: input.enabled,
							api_key_changed: Boolean(input.api_key || input.clear_api_key),
						},
					},
					input.expected_updated_at,
				);
			} catch (e) {
				if (e instanceof SumupError) {
					throw new ORPCError("BAD_REQUEST", { message: e.message });
				}
				throw e;
			}
		}),

	testSumup: permitted("integrations.manage", "finance.read").handler(
		async ({ context }) => {
			try {
				const heute = todayIsoDate();
				const result = await fetchSumupDays(heute, heute);
				const tag = result.tage[0];
				await recordAuditEvent({
					category: "settings",
					action: "settings.sumup_tested",
					actor: context.user,
					subject: { type: "settings", id: "sumup", label: "SumUp" },
					request: requestAuditContext(context),
					metadata: { anzahl: tag?.anzahl ?? 0 },
				});
				return {
					ok: true as const,
					merchant_name: result.merchant_name,
					anzahl: tag?.anzahl ?? 0,
					kartenzahlung_cent: tag?.kartenzahlung_cent ?? 0,
				};
			} catch (e) {
				if (e instanceof SumupError) {
					throw new ORPCError("BAD_REQUEST", { message: e.message });
				}
				throw e;
			}
		},
	),

	testEmail: permitted("integrations.manage")
		.input(TestEmailSchema)
		.handler(async ({ input, context }) => {
			try {
				await sendTestEmail(input.to);
				await recordAuditEvent({
					category: "settings",
					action: "settings.test_email_sent",
					actor: context.user,
					subject: { type: "email", label: input.to },
					request: requestAuditContext(context),
				});
				return { ok: true };
			} catch (e) {
				// The SMTP answer names hosts, users and login failures. It belongs
				// in the log, not in a toast.
				logger.error("test email failed", { error: e, to: input.to });
				throw new ORPCError("BAD_REQUEST", {
					message:
						"Versand fehlgeschlagen. Bitte Host, Port, Benutzer und Passwort prüfen und erneut testen.",
				});
			}
		}),
};

// ---- Cash registers ------------------------------------------------------

const registers = {
	list: permittedAny("finance.read", "registers.manage").handler(() =>
		listCashRegisters(),
	),

	create: permitted("registers.manage")
		.input(CashRegisterSchema)
		.handler(async ({ input, context }) => {
			try {
				const register = await createCashRegister(input, {
					category: "kassen",
					action: "kassen.created",
					actor: context.user,
					request: requestAuditContext(context),
				});
				return { register };
			} catch (e) {
				if ((e as { code?: string }).code === "23505") {
					throw new ORPCError("CONFLICT", {
						message: "Kassennummer bereits vergeben",
					});
				}
				throw e;
			}
		}),

	update: permitted("registers.manage")
		.input(
			v.object({
				id: v.pipe(v.string(), v.minLength(1)),
				...CashRegisterSchema.entries,
			}),
		)
		.handler(async ({ input, context }) => {
			try {
				const register = await updateCashRegister(
					input.id,
					{
						kassennummer: input.kassennummer,
						kassenbezeichnung: input.kassenbezeichnung,
						wechselgeld_cent: input.wechselgeld_cent,
					},
					{
						category: "kassen",
						action: "kassen.updated",
						actor: context.user,
						request: requestAuditContext(context),
					},
					input.expected_updated_at,
				);
				if (!register) {
					throw new ORPCError("NOT_FOUND", { message: "Kasse nicht gefunden" });
				}
				return { register };
			} catch (e) {
				if ((e as { code?: string }).code === "23505") {
					throw new ORPCError("CONFLICT", {
						message: "Kassennummer bereits vergeben",
					});
				}
				throw e;
			}
		}),

	remove: permitted("registers.manage")
		.input(idInput)
		.handler(async ({ input, context }) => {
			const register = await deleteCashRegister(input.id, {
				category: "kassen",
				action: "kassen.deleted",
				actor: context.user,
				request: requestAuditContext(context),
			});
			if (!register)
				throw new ORPCError("NOT_FOUND", { message: "Kasse nicht gefunden" });
			return { ok: true };
		}),
};

// ---- Anlass catalog ------------------------------------------------------

const anlassKatalog = {
	list: permittedAny("finance.read", "occasions.manage").handler(() =>
		listKatalog(),
	),

	create: permitted("occasions.manage")
		.input(AnlassKatalogSchema)
		.handler(async ({ input, context }) => {
			try {
				const entry = await createKatalog(input, {
					category: "anlass",
					action: "anlass.created",
					actor: context.user,
					request: requestAuditContext(context),
				});
				return { entry };
			} catch (e) {
				if ((e as { code?: string }).code === "23505") {
					throw new ORPCError("CONFLICT", {
						message: "Umsatzgruppe mit diesem Namen existiert bereits",
					});
				}
				throw e;
			}
		}),

	bulkAssign: permitted("occasions.manage", "finance.read")
		.input(AnlassKatalogBulkAssignSchema)
		.handler(async ({ input, context }) => {
			try {
				const result = await bulkAssignKatalog(
					{
						targetId: input.target_id,
						sourceId: input.source_id,
						targetName: input.target_name,
						protokollIds: input.protokoll_ids,
						historicalIds: input.historical_ids,
					},
					{
						category: "anlass",
						action: "anlass.bulk_assigned",
						actor: context.user,
						request: requestAuditContext(context),
					},
				);
				if (!result) {
					throw new ORPCError("NOT_FOUND", {
						message: "Ziel-Umsatzgruppe nicht gefunden",
					});
				}
				return result;
			} catch (error) {
				if (error instanceof AnlassKatalogConcurrencyError) {
					throw new ORPCError("CONFLICT", { message: error.message });
				}
				if ((error as { code?: string }).code === "23505") {
					throw new ORPCError("CONFLICT", {
						message: "Umsatzgruppe mit diesem Namen existiert bereits",
					});
				}
				throw error;
			}
		}),

	update: permitted("occasions.manage")
		.input(
			v.object({
				id: v.pipe(v.string(), v.minLength(1)),
				expected_updated_at: v.pipe(v.string(), v.minLength(1)),
				...AnlassKatalogSchema.entries,
			}),
		)
		.handler(async ({ input, context }) => {
			try {
				const entry = await updateKatalog(
					input.id,
					{
						name: input.name,
						typ: input.typ,
						aktiv: input.aktiv,
					},
					input.expected_updated_at,
					{
						category: "anlass",
						action: "anlass.updated",
						actor: context.user,
						request: requestAuditContext(context),
					},
				);
				if (!entry) {
					throw new ORPCError("NOT_FOUND", {
						message: "Umsatzgruppe nicht gefunden",
					});
				}
				return { entry };
			} catch (e) {
				if (e instanceof AnlassKatalogConcurrencyError) {
					throw new ORPCError("CONFLICT", { message: e.message });
				}
				if ((e as { code?: string }).code === "23505") {
					throw new ORPCError("CONFLICT", {
						message: "Umsatzgruppe mit diesem Namen existiert bereits",
					});
				}
				throw e;
			}
		}),

	remove: permitted("occasions.manage")
		.input(idInput)
		.handler(async ({ input, context }) => {
			const result = await deleteKatalog(input.id, {
				category: "anlass",
				action: "anlass.deleted",
				actor: context.user,
				request: requestAuditContext(context),
			});
			if (result.status === "referenced") {
				throw new ORPCError("CONFLICT", {
					message: `Umsatzgruppe ist ${result.references} Belegen zugeordnet. Bitte stattdessen deaktivieren.`,
				});
			}
			if (result.status === "not_found")
				throw new ORPCError("NOT_FOUND", {
					message: "Umsatzgruppe nicht gefunden",
				});
			return { ok: true };
		}),
};

// ---- Invites & users -----------------------------------------------------

const invites = {
	requestPasswordReset: pub
		.input(
			v.object({ token: v.pipe(v.string(), v.minLength(1), v.maxLength(256)) }),
		)
		.handler(({ input, context }) =>
			requestInvitePasswordReset(input.token, context.headers),
		),
	list: permitted("users.manage").handler(() => listInvites()),

	create: permitted("users.manage")
		.input(InviteCreateSchema)
		.handler(async ({ input, context }) => {
			if (input.role !== "user" && !hasPermission(context.user, "roles.manage"))
				throw new ORPCError("FORBIDDEN", {
					message: "Für die Zuweisung dieser Rolle besteht keine Berechtigung",
				});
			try {
				const invite = await createInvite({
					email: input.email,
					role: input.role,
					invitedBy: context.user.email,
					audit: {
						actor: context.user,
						request: requestAuditContext(context),
					},
				});
				const baseUrl = tenantPublicBaseUrl(context.tenant, context.headers);
				const emailStatus = baseUrl
					? await sendInvitationEmail({
							to: invite.email,
							inviteUrl: `${baseUrl}/invite/${invite.token}`,
							role: invite.role,
							invitedBy: invite.invited_by,
						})
					: "skipped";
				return { ...invite, email_status: emailStatus };
			} catch (e) {
				throw new ORPCError("CONFLICT", { message: (e as Error).message });
			}
		}),

	revoke: permitted("users.manage")
		.input(idInput)
		.handler(async ({ input, context }) => {
			const invite = await revokeInvite(input.id, {
				actor: context.user,
				request: requestAuditContext(context),
			});
			if (!invite) {
				throw new ORPCError("NOT_FOUND", {
					message: "Einladung nicht gefunden oder bereits angenommen",
				});
			}
			return { ok: true };
		}),

	getByToken: pub
		.input(v.object({ token: v.pipe(v.string(), v.minLength(1)) }))
		.handler(async ({ input, context }) => {
			const invite = await getValidInvite(input.token, context.headers);
			if (!invite) return { valid: false as const };
			return {
				valid: true as const,
				email: invite.email,
				role: invite.role,
				existingAccount: invite.existingAccount,
				tenantName: invite.tenantName,
			};
		}),

	accept: pub.input(InviteAcceptSchema).handler(async ({ input, context }) => {
		try {
			const accepted = await acceptInvite({
				...input,
				authenticatedUser: context.identity ?? undefined,
				headers: context.headers,
				audit: { request: requestAuditContext(context) },
			});
			return { ok: true, tenantId: accepted.tenantId };
		} catch (e) {
			throw new ORPCError("BAD_REQUEST", { message: (e as Error).message });
		}
	}),
};

const users = {
	list: permitted("users.manage").handler(() => listTenantUsers()),
	setRole: permitted("roles.manage")
		.input(
			v.object({
				id: v.pipe(v.string(), v.minLength(1)),
				role: v.picklist(CLUB_ROLES),
			}),
		)
		.handler(({ input, context }) =>
			setTenantUserRole(
				input.id,
				input.role,
				context.user,
				requestAuditContext(context),
			),
		),
	setBanned: permitted("users.manage")
		.input(
			v.object({ id: v.pipe(v.string(), v.minLength(1)), banned: v.boolean() }),
		)
		.handler(({ input, context }) =>
			setTenantUserBanned(
				input.id,
				input.banned,
				context.user,
				requestAuditContext(context),
			),
		),

	// Admin override of another account's notification preference.
	setNotify: permitted("users.manage")
		.input(
			v.object({
				id: v.pipe(v.string(), v.minLength(1)),
				notify: v.boolean(),
			}),
		)
		.handler(async ({ input, context }) => {
			const ok = await setUserNotifyPref(input.id, input.notify, {
				category: "users",
				action: "users.notification_changed",
				actor: context.user,
				request: requestAuditContext(context),
				metadata: { changed_by_admin: true },
			});
			if (!ok) {
				throw new ORPCError("NOT_FOUND", { message: "Konto nicht gefunden" });
			}
			return { ok: true, notify: input.notify };
		}),
};

// ---- Profile (own account) ----------------------------------------------

const profile = {
	// Whether the signed-in user receives the new-protokoll notification mail.
	getNotify: authed.handler(async ({ context }) => ({
		notify: await getUserNotifyPref(context.user.id),
	})),

	setNotify: authed
		.input(v.object({ notify: v.boolean() }))
		.handler(async ({ input, context }) => {
			await setUserNotifyPref(context.user.id, input.notify, {
				category: "users",
				action: "users.notification_changed",
				actor: context.user,
				request: requestAuditContext(context),
				metadata: { changed_by_admin: false },
			});
			return { ok: true, notify: input.notify };
		}),
};

// ---- Historical revenue -------------------------------------------------

const historicalRevenue = {
	list: permitted("finance.read").handler(() => listHistoricalRevenues()),
	page: permitted("finance.read")
		.input(HistoricalRevenuePageSchema)
		.handler(({ input }) => listHistoricalRevenuePage(input)),
	get: permitted("finance.read")
		.input(HistoricalRevenueGetSchema)
		.handler(async ({ input }) => {
			try {
				return await getHistoricalRevenueDetails(input.id);
			} catch (error) {
				if (error instanceof HistoricalRevenueNotFoundError) {
					throw new ORPCError("NOT_FOUND", { message: error.message });
				}
				throw error;
			}
		}),

	create: permitted("revenues.manage", "finance.read")
		.input(HistoricalRevenueCreateSchema)
		.handler(async ({ input, context }) => {
			try {
				const result = await createHistoricalRevenue(input, context.user, {
					request: requestAuditContext(context),
				});
				return result.row;
			} catch (error) {
				if (error instanceof HistoricalRevenueCatalogError) {
					throw new ORPCError("BAD_REQUEST", { message: error.message });
				}
				if (error instanceof HistoricalRevenueInputError) {
					throw new ORPCError("BAD_REQUEST", { message: error.message });
				}
				if (error instanceof HistoricalRevenueConflictError) {
					throw new ORPCError("CONFLICT", { message: error.message });
				}
				throw error;
			}
		}),

	cancel: permitted("revenues.manage", "finance.read")
		.input(HistoricalRevenueCancelSchema)
		.handler(async ({ input, context }) => {
			try {
				await cancelHistoricalRevenue(
					input.id,
					input.storno_grund,
					context.user,
					{ request: requestAuditContext(context) },
				);
				return { ok: true as const };
			} catch (error) {
				if (error instanceof HistoricalRevenueNotFoundError) {
					throw new ORPCError("NOT_FOUND", { message: error.message });
				}
				if (error instanceof HistoricalRevenueConflictError) {
					throw new ORPCError("CONFLICT", { message: error.message });
				}
				throw error;
			}
		}),

	correct: permitted("revenues.manage", "finance.read")
		.input(HistoricalRevenueCorrectSchema)
		.handler(async ({ input, context }) => {
			try {
				return await correctHistoricalRevenue(input, context.user, {
					request: requestAuditContext(context),
				});
			} catch (error) {
				if (error instanceof HistoricalRevenueNotFoundError) {
					throw new ORPCError("NOT_FOUND", { message: error.message });
				}
				if (
					error instanceof HistoricalRevenueCatalogError ||
					error instanceof HistoricalRevenueInputError
				) {
					throw new ORPCError("BAD_REQUEST", { message: error.message });
				}
				if (error instanceof HistoricalRevenueConflictError) {
					throw new ORPCError("CONFLICT", { message: error.message });
				}
				throw error;
			}
		}),
};

function throwHistoricalProtocolDraftError(error: unknown): never {
	if (error instanceof HistoricalProtocolDraftNotFoundError) {
		throw new ORPCError("NOT_FOUND", { message: error.message });
	}
	if (error instanceof HistoricalProtocolDraftConflictError) {
		throw new ORPCError("CONFLICT", { message: error.message });
	}
	if (error instanceof HistoricalProtocolDraftValidationError) {
		throw new ORPCError("BAD_REQUEST", {
			message: error.message,
			data: error.validation,
		});
	}
	throw error;
}

const historicalProtocolImport = {
	list: permitted("imports.manage", "finance.read", "helpers.read")
		.input(HistoricalProtocolDraftListSchema)
		.handler(({ input }) =>
			listHistoricalProtocolImportDrafts(input.include_archived),
		),

	summary: permitted("imports.manage", "finance.read", "helpers.read")
		.input(HistoricalProtocolDraftGetSchema)
		.handler(async ({ input }) => {
			try {
				return await getHistoricalProtocolImportDraftSummary(input.id);
			} catch (error) {
				throwHistoricalProtocolDraftError(error);
			}
		}),

	analyze: permitted("imports.manage", "finance.read", "helpers.read")
		.input(HistoricalProtocolDraftAnalyzeSchema)
		.handler(async ({ input }) => {
			try {
				return await analyzeHistoricalProtocolImportDraft(input);
			} catch (error) {
				throwHistoricalProtocolDraftError(error);
			}
		}),

	queryItems: permitted("imports.manage", "finance.read", "helpers.read")
		.input(HistoricalProtocolDraftQuerySchema)
		.handler(async ({ input }) => {
			try {
				return await queryHistoricalProtocolImportDraftItems(input);
			} catch (error) {
				throwHistoricalProtocolDraftError(error);
			}
		}),

	get: permitted("imports.manage", "finance.read", "helpers.read")
		.input(HistoricalProtocolDraftGetSchema)
		.handler(async ({ input }) => {
			try {
				return await getHistoricalProtocolImportDraft(input.id);
			} catch (error) {
				throwHistoricalProtocolDraftError(error);
			}
		}),

	updateItem: permitted("imports.manage", "finance.read", "helpers.read")
		.input(HistoricalProtocolDraftUpdateItemSchema)
		.handler(async ({ input, context }) => {
			try {
				return await updateHistoricalProtocolImportDraftItem(
					input,
					context.user,
					{ request: requestAuditContext(context) },
				);
			} catch (error) {
				throwHistoricalProtocolDraftError(error);
			}
		}),

	bulkUpdate: permitted("imports.manage", "finance.read", "helpers.read")
		.input(HistoricalProtocolDraftBulkUpdateSchema)
		.handler(async ({ input, context }) => {
			try {
				return await bulkUpdateHistoricalProtocolImportDraftItems(
					input,
					context.user,
					{ request: requestAuditContext(context) },
				);
			} catch (error) {
				throwHistoricalProtocolDraftError(error);
			}
		}),

	validate: permitted("imports.manage", "finance.read", "helpers.read")
		.input(HistoricalProtocolDraftGetSchema)
		.handler(({ input }) => validateHistoricalProtocolImportDraft(input.id)),

	planReviewPhase: permitted("imports.manage", "finance.read", "helpers.read")
		.input(HistoricalProtocolReviewPhasePlanSchema)
		.handler(({ input }) => planHistoricalProtocolReviewPhase(input)),

	createReviewPhase: permitted("imports.manage", "finance.read", "helpers.read")
		.input(HistoricalProtocolReviewPhaseCreateSchema)
		.handler(async ({ input, context }) => {
			try {
				return await createHistoricalProtocolReviewPhase(input, context.user, {
					request: requestAuditContext(context),
				});
			} catch (error) {
				throwHistoricalProtocolDraftError(error);
			}
		}),

	listReviewPhases: permitted("imports.manage", "finance.read", "helpers.read")
		.input(HistoricalProtocolReviewPhaseListSchema)
		.handler(({ input }) => listHistoricalProtocolReviewPhases(input.draft_id)),

	queryReviewPhaseItems: permitted(
		"imports.manage",
		"finance.read",
		"helpers.read",
	)
		.input(HistoricalProtocolReviewPhaseQuerySchema)
		.handler(({ input }) => queryHistoricalProtocolReviewPhaseItems(input)),

	planReviewUpdate: permitted("imports.manage", "finance.read", "helpers.read")
		.input(HistoricalProtocolReviewUpdatePlanSchema)
		.handler(({ input }) => planHistoricalProtocolReviewUpdate(input)),

	applyReviewUpdate: permitted("imports.manage", "finance.read", "helpers.read")
		.input(HistoricalProtocolReviewUpdateApplySchema)
		.handler(async ({ input, context }) => {
			try {
				return await applyHistoricalProtocolReviewUpdate(input, context.user, {
					request: requestAuditContext(context),
				});
			} catch (error) {
				throwHistoricalProtocolDraftError(error);
			}
		}),

	completeReviewPhase: permitted(
		"imports.manage",
		"finance.read",
		"helpers.read",
	)
		.input(HistoricalProtocolReviewPhaseTransitionSchema)
		.handler(async ({ input, context }) => {
			try {
				return await completeHistoricalProtocolReviewPhase(
					input,
					context.user,
					{
						request: requestAuditContext(context),
					},
				);
			} catch (error) {
				throwHistoricalProtocolDraftError(error);
			}
		}),

	reopenReviewPhase: permitted("imports.manage", "finance.read", "helpers.read")
		.input(HistoricalProtocolReviewPhaseTransitionSchema)
		.handler(async ({ input, context }) => {
			try {
				return await reopenHistoricalProtocolReviewPhase(input, context.user, {
					request: requestAuditContext(context),
				});
			} catch (error) {
				throwHistoricalProtocolDraftError(error);
			}
		}),

	markReady: permitted("imports.manage", "finance.read", "helpers.read")
		.input(HistoricalProtocolDraftTransitionSchema)
		.handler(async ({ input, context }) => {
			try {
				return await markHistoricalProtocolImportDraftReady(
					input.id,
					input.expected_revision,
					context.user,
					{ request: requestAuditContext(context) },
				);
			} catch (error) {
				throwHistoricalProtocolDraftError(error);
			}
		}),

	reopen: permitted("imports.manage", "finance.read", "helpers.read")
		.input(HistoricalProtocolDraftTransitionSchema)
		.handler(async ({ input, context }) => {
			try {
				return await reopenHistoricalProtocolImportDraft(
					input.id,
					input.expected_revision,
					context.user,
					{ request: requestAuditContext(context) },
				);
			} catch (error) {
				throwHistoricalProtocolDraftError(error);
			}
		}),

	archive: permitted("imports.manage", "finance.read", "helpers.read")
		.input(HistoricalProtocolDraftTransitionSchema)
		.handler(async ({ input, context }) => {
			try {
				return await archiveHistoricalProtocolImportDraft(
					input.id,
					input.expected_revision,
					context.user,
					{ request: requestAuditContext(context) },
				);
			} catch (error) {
				throwHistoricalProtocolDraftError(error);
			}
		}),

	restore: permitted("imports.manage", "finance.read", "helpers.read")
		.input(HistoricalProtocolDraftTransitionSchema)
		.handler(async ({ input, context }) => {
			try {
				return await restoreHistoricalProtocolImportDraft(
					input.id,
					input.expected_revision,
					context.user,
					{ request: requestAuditContext(context) },
				);
			} catch (error) {
				throwHistoricalProtocolDraftError(error);
			}
		}),

	apply: permitted("imports.manage", "finance.read", "helpers.read")
		.input(HistoricalProtocolDraftTransitionSchema)
		.handler(async ({ input, context }) => {
			try {
				return await applyHistoricalProtocolImportDraft(
					input.id,
					input.expected_revision,
					context.user,
					{ request: requestAuditContext(context) },
				);
			} catch (error) {
				throwHistoricalProtocolDraftError(error);
			}
		}),
};

// ---- Reports -------------------------------------------------------------

const reports = {
	vat: permitted("finance.read")
		.input(ExportQuerySchema)
		.handler(({ input }) => vatSummary(input.von, input.bis)),
};

const helperHours = {
	list: permitted("helpers.read")
		.input(HelperHourListSchema)
		.handler(({ input }) => listHelperHours(input.jahr)),
	entries: permitted("helpers.read")
		.input(HelperHourEntriesSchema)
		.handler(({ input }) => listHelperHourEntries(input)),
	create: permitted("helpers.write", "helpers.read")
		.input(HelperHourCreateSchema)
		.handler(({ input, context }) =>
			createHelperHour(input, context.user, {
				request: requestAuditContext(context),
			}),
		),
	createExpense: permitted("helpers.manage", "helpers.read")
		.input(HelperHourExpenseCreateSchema)
		.handler(({ input, context }) =>
			createHelperHourExpense(input, context.user, {
				request: requestAuditContext(context),
			}),
		),
	cancelExpense: permitted("helpers.manage", "helpers.read")
		.input(HelperHourExpenseCancelSchema)
		.handler(({ input, context }) =>
			cancelHelperHourExpense(input.id, input.grund, context.user, {
				request: requestAuditContext(context),
			}),
		),
	categories: permitted("helpers.read").handler(() =>
		listHelperHourCategoriesWithUsage(),
	),
	createCategory: permitted("helpers.manage", "helpers.read")
		.input(HelperHourCategoryCreateSchema)
		.handler(({ input, context }) =>
			createHelperHourCategory(input, context.user, {
				request: requestAuditContext(context),
			}),
		),
	updateCategory: permitted("helpers.manage", "helpers.read")
		.input(HelperHourCategoryUpdateSchema)
		.handler(({ input, context }) =>
			updateHelperHourCategory(input, context.user, {
				request: requestAuditContext(context),
			}),
		),
	deleteCategory: permitted("helpers.manage", "helpers.read")
		.input(HelperHourCategoryDeleteSchema)
		.handler(({ input, context }) =>
			deleteHelperHourCategory(input.id, context.user, {
				request: requestAuditContext(context),
			}),
		),
	nameVariants: permitted("helpers.read").handler(() =>
		listHelperHourNameVariants(),
	),
	catalog: permitted("helpers.read").handler(() => listHelperHourCatalog()),
	createPerson: permitted("helpers.manage", "helpers.read")
		.input(HelperHourPersonSchema)
		.handler(({ input, context }) =>
			createHelperHourPerson(input, context.user, {
				request: requestAuditContext(context),
			}),
		),
	updatePerson: permitted("helpers.manage", "helpers.read")
		.input(HelperHourPersonUpdateSchema)
		.handler(({ input, context }) =>
			updateHelperHourPerson(input, context.user, {
				request: requestAuditContext(context),
			}),
		),
	mergePersons: permitted("helpers.manage", "helpers.read")
		.input(HelperHourPersonMergeSchema)
		.handler(({ input, context }) =>
			mergeHelperHourPersons(input, context.user, {
				request: requestAuditContext(context),
			}),
		),
	createEvent: permitted("helpers.manage", "helpers.read")
		.input(HelperHourEventSchema)
		.handler(({ input, context }) =>
			createHelperHourEvent(input, context.user, {
				request: requestAuditContext(context),
			}),
		),
	updateEvent: permitted("helpers.manage", "helpers.read")
		.input(HelperHourEventUpdateSchema)
		.handler(({ input, context }) =>
			updateHelperHourEvent(input, context.user, {
				request: requestAuditContext(context),
			}),
		),
	mergeEvents: permitted("helpers.manage", "helpers.read")
		.input(HelperHourEventMergeSchema)
		.handler(({ input, context }) =>
			mergeHelperHourEvents(input, context.user, {
				request: requestAuditContext(context),
			}),
		),
	createAlias: permitted("helpers.manage", "helpers.read")
		.input(HelperHourAliasCreateSchema)
		.handler(({ input, context }) =>
			createHelperHourAlias(input, context.user, {
				request: requestAuditContext(context),
			}),
		),
	deleteAlias: permitted("helpers.manage", "helpers.read")
		.input(HelperHourAliasDeleteSchema)
		.handler(({ input, context }) =>
			deleteHelperHourAlias(input.id, context.user, {
				request: requestAuditContext(context),
			}),
		),
	noteRules: permitted("helpers.read").handler(() => listHelperHourNoteRules()),
	createNoteRule: permitted("helpers.manage", "helpers.read")
		.input(HelperHourNoteRuleCreateSchema)
		.handler(({ input, context }) =>
			createHelperHourNoteRule(input, context.user, {
				request: requestAuditContext(context),
			}),
		),
	deleteNoteRule: permitted("helpers.manage", "helpers.read")
		.input(HelperHourNoteRuleDeleteSchema)
		.handler(({ input, context }) =>
			deleteHelperHourNoteRule(input.id, context.user, {
				request: requestAuditContext(context),
			}),
		),
	correctEntry: permitted("helpers.manage", "helpers.read")
		.input(HelperHourEntryCorrectSchema)
		.handler(({ input, context }) =>
			correctHelperHourEntry(input, context.user, {
				request: requestAuditContext(context),
			}),
		),
	deleteEntry: permitted("helpers.manage", "helpers.read")
		.input(HelperHourEntryDeleteSchema)
		.handler(({ input, context }) =>
			deleteHelperHourEntry(input.id, input.grund, context.user, {
				request: requestAuditContext(context),
			}),
		),
};

// ---- Audit log ----------------------------------------------------------

const audit = {
	list: permitted("audit.read", "finance.read")
		.input(
			v.object({
				page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
				pageSize: v.optional(
					v.pipe(v.number(), v.integer(), v.minValue(10), v.maxValue(100)),
					50,
				),
				category: v.optional(v.picklist(AUDIT_CATEGORIES)),
				query: v.optional(v.pipe(v.string(), v.maxLength(100))),
			}),
		)
		.handler(({ input }) => listAuditEvents(input)),
};

// ---- Health --------------------------------------------------------------

const health = pub.handler(async () => {
	const { sql } = await import("drizzle-orm");
	try {
		await globalDb.execute(sql`select 1`);
		return { ok: true, db: true };
	} catch {
		return { ok: false, db: false };
	}
});

export const router = {
	roles: {
		get: permitted("roles.manage").handler(() =>
			getRolePolicyForCurrentTenant(),
		),
		update: permitted("roles.manage")
			.input(RolePolicyUpdateSchema)
			.handler(({ input, context }) =>
				updateRolePolicy(input, context.user, requestAuditContext(context)),
			),
	},
	recovery: {
		request: pub
			.input(v.object({ email: v.pipe(v.string(), v.maxLength(320)) }))
			.handler(({ input, context }) =>
				requestMemberPasswordReset(input.email, context.headers),
			),
	},
	operators,
	protokolle,
	settings,
	registers,
	anlassKatalog,
	invites,
	users,
	profile,
	historicalRevenue,
	historicalProtocolImport,
	helperHours,
	reports,
	audit,
	health,
};

export type AppRouter = typeof router;
