import { ORPCError } from "@orpc/server";
import { desc, eq } from "drizzle-orm";
import * as v from "valibot";
import { AUDIT_CATEGORIES } from "@/lib/audit";
import {
	BelegnummerSettingsSchema,
	CashRegisterSchema,
	CreateProtokollSchema,
	EmailSettingsSchema,
	ExportQuerySchema,
	HistoricalRevenueCancelSchema,
	HistoricalRevenueCreateSchema,
	InviteAcceptSchema,
	InviteCreateSchema,
	StornoSchema,
	TestEmailSchema,
	UmsatzUstBasisSettingsSchema,
	VereinSettingsSchema,
} from "@/lib/schemas";
import { db } from "@/server/db";
import { user as userTable } from "@/server/db/auth-schema";
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
	getEmailSettings,
	sendInvitationEmail,
	sendTestEmail,
	updateEmailSettings,
} from "@/server/services/email";
import {
	cancelHistoricalRevenue,
	createHistoricalRevenue,
	HistoricalRevenueConflictError,
	HistoricalRevenueNotFoundError,
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
	createProtokoll,
	getProtokoll,
	listProtokolle,
	regenerateProtokollPdf,
	stornoProtokoll,
} from "@/server/services/protokoll";
import { vatSummary } from "@/server/services/reports";
import {
	getBelegnummerSettings,
	getUmsatzUstBasisDefault,
	getVereinStammdaten,
	updateBelegnummerSettings,
	updateUmsatzUstBasisDefault,
	updateVereinStammdaten,
} from "@/server/services/settings";
import { adminOnly, authed, pub } from "./base";

const idInput = v.object({ id: v.pipe(v.string(), v.minLength(1)) });

function publicBaseUrl(headers: Headers): string | null {
	const configured = process.env.BETTER_AUTH_URL?.trim();
	if (configured) {
		try {
			const url = new URL(configured);
			if (url.protocol !== "https:" && url.protocol !== "http:") return null;
			return url.origin;
		} catch {
			return null;
		}
	}

	// Secret-bearing invite links must never trust request host headers in
	// production. The fallback only keeps local development convenient.
	if (process.env.NODE_ENV === "production") return null;

	const host = headers.get("x-forwarded-host") ?? headers.get("host");
	if (!host) return null;
	const proto = headers.get("x-forwarded-proto") ?? "https";
	return `${proto}://${host}`;
}

// ---- Protokolle ----------------------------------------------------------

const protokolle = {
	list: authed
		.input(v.object({ includeStorniert: v.optional(v.boolean(), false) }))
		.handler(({ input }) =>
			listProtokolle({ includeStorniert: input.includeStorniert }),
		),

	get: authed.input(idInput).handler(async ({ input }) => {
		const detail = await getProtokoll(input.id);
		if (!detail)
			throw new ORPCError("NOT_FOUND", { message: "Nicht gefunden" });
		return detail;
	}),

	nextBelegnummer: authed.handler(async () => ({
		belegnummer: await previewNextBelegnummer(),
	})),

	create: authed
		.input(CreateProtokollSchema)
		.handler(async ({ input, context }) => {
			try {
				const created = await createProtokoll(input, context.user);
				await recordAuditEvent({
					category: "protokolle",
					action: "protokolle.created",
					actor: context.user,
					subject: {
						type: "protokoll",
						id: created.id,
						label: created.belegnummer,
					},
					request: requestAuditContext(context),
					metadata: {
						anlass: input.anlass,
						anlass_datum: input.anlass_datum,
						kassennummer: input.kassennummer,
					},
				});
				return created;
			} catch (e) {
				const msg = (e as Error).message;
				if (msg === "Belegnummer bereits vergeben") {
					throw new ORPCError("CONFLICT", { message: msg });
				}
				if (msg.startsWith("Summe der USt")) {
					throw new ORPCError("BAD_REQUEST", { message: msg });
				}
				throw e;
			}
		}),

	storno: authed
		.input(
			v.object({
				id: v.pipe(v.string(), v.minLength(1)),
				...StornoSchema.entries,
			}),
		)
		.handler(async ({ input, context }) => {
			try {
				const detail = await getProtokoll(input.id);
				await stornoProtokoll(
					input.id,
					{ storno_grund: input.storno_grund },
					context.user,
				);
				await recordAuditEvent({
					category: "protokolle",
					action: "protokolle.cancelled",
					actor: context.user,
					subject: {
						type: "protokoll",
						id: input.id,
						label: detail?.protokoll.belegnummer,
					},
					request: requestAuditContext(context),
					metadata: { grund: input.storno_grund },
				});
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

	regeneratePdf: authed.input(idInput).handler(async ({ input, context }) => {
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
	getBelegnummer: authed.handler(async () => ({
		settings: await getBelegnummerSettings(),
		preview: await previewNextBelegnummer(),
	})),

	updateBelegnummer: adminOnly
		.input(BelegnummerSettingsSchema)
		.handler(async ({ input, context }) => {
			const updated = await updateBelegnummerSettings({
				min_digits: input.min_digits,
				prefix: input.prefix,
				include_year: input.include_year,
				year_format: input.year_format,
				separator: input.separator,
			});
			await recordAuditEvent({
				category: "settings",
				action: "settings.belegnummer_changed",
				actor: context.user,
				subject: { type: "settings", id: "belegnummer", label: "Belegnummern" },
				request: requestAuditContext(context),
				metadata: {
					prefix: input.prefix,
					min_digits: input.min_digits,
					include_year: input.include_year,
					year_format: input.year_format,
					separator: input.separator,
				},
			});
			return { settings: updated, preview: await previewNextBelegnummer() };
		}),

	getUmsatzUstBasis: authed.handler(async () => ({
		umsatz_ust_basis: await getUmsatzUstBasisDefault(),
	})),

	updateUmsatzUstBasis: adminOnly
		.input(UmsatzUstBasisSettingsSchema)
		.handler(async ({ input, context }) => {
			const umsatz_ust_basis = await updateUmsatzUstBasisDefault(
				input.umsatz_ust_basis,
			);
			await recordAuditEvent({
				category: "settings",
				action: "settings.ust_basis_changed",
				actor: context.user,
				subject: { type: "settings", id: "ust_basis", label: "USt.-Grundlage" },
				request: requestAuditContext(context),
				metadata: { umsatz_ust_basis },
			});
			return { umsatz_ust_basis };
		}),

	getVerein: authed.handler(() => getVereinStammdaten()),

	updateVerein: adminOnly
		.input(VereinSettingsSchema)
		.handler(async ({ input, context }) => {
			const result = await updateVereinStammdaten({
				name: input.vereinsname,
				strasse: input.strasse,
				plz: input.plz,
				ort: input.ort,
				vorstand: input.vorstand,
				registergericht: input.registergericht,
				registernummer: input.registernummer,
			});
			await recordAuditEvent({
				category: "settings",
				action: "settings.verein_changed",
				actor: context.user,
				subject: { type: "settings", id: "verein", label: input.vereinsname },
				request: requestAuditContext(context),
				metadata: { vereinsname: input.vereinsname },
			});
			return result;
		}),

	getEmail: adminOnly.handler(() => getEmailSettings()),

	updateEmail: adminOnly
		.input(EmailSettingsSchema)
		.handler(async ({ input, context }) => {
			try {
				const result = await updateEmailSettings({
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
				});
				await recordAuditEvent({
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
				});
				return result;
			} catch (e) {
				throw new ORPCError("BAD_REQUEST", { message: (e as Error).message });
			}
		}),

	testEmail: adminOnly
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
				throw new ORPCError("BAD_REQUEST", {
					message: `Versand fehlgeschlagen: ${(e as Error).message}`,
				});
			}
		}),
};

// ---- Cash registers ------------------------------------------------------

const registers = {
	list: authed.handler(() => listCashRegisters()),

	create: adminOnly
		.input(CashRegisterSchema)
		.handler(async ({ input, context }) => {
			try {
				const register = await createCashRegister(input);
				await recordAuditEvent({
					category: "kassen",
					action: "kassen.created",
					actor: context.user,
					subject: {
						type: "kasse",
						id: register.id,
						label: `${register.kassennummer} ${register.kassenbezeichnung}`,
					},
					request: requestAuditContext(context),
					metadata: { wechselgeld_cent: register.wechselgeld_cent },
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

	update: adminOnly
		.input(
			v.object({
				id: v.pipe(v.string(), v.minLength(1)),
				...CashRegisterSchema.entries,
			}),
		)
		.handler(async ({ input, context }) => {
			try {
				const register = await updateCashRegister(input.id, {
					kassennummer: input.kassennummer,
					kassenbezeichnung: input.kassenbezeichnung,
					wechselgeld_cent: input.wechselgeld_cent,
				});
				if (!register) {
					throw new ORPCError("NOT_FOUND", { message: "Kasse nicht gefunden" });
				}
				await recordAuditEvent({
					category: "kassen",
					action: "kassen.updated",
					actor: context.user,
					subject: {
						type: "kasse",
						id: register.id,
						label: `${register.kassennummer} ${register.kassenbezeichnung}`,
					},
					request: requestAuditContext(context),
					metadata: { wechselgeld_cent: register.wechselgeld_cent },
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

	remove: adminOnly.input(idInput).handler(async ({ input, context }) => {
		const register = await deleteCashRegister(input.id);
		if (!register)
			throw new ORPCError("NOT_FOUND", { message: "Kasse nicht gefunden" });
		await recordAuditEvent({
			category: "kassen",
			action: "kassen.deleted",
			actor: context.user,
			subject: {
				type: "kasse",
				id: register.id,
				label: `${register.kassennummer} ${register.kassenbezeichnung}`,
			},
			request: requestAuditContext(context),
		});
		return { ok: true };
	}),
};

// ---- Invites & users -----------------------------------------------------

const invites = {
	list: adminOnly.handler(() => listInvites()),

	create: adminOnly
		.input(InviteCreateSchema)
		.handler(async ({ input, context }) => {
			try {
				const invite = await createInvite({
					email: input.email,
					role: input.role,
					invitedBy: context.user.email,
				});
				const baseUrl = publicBaseUrl(context.headers);
				const emailStatus = baseUrl
					? await sendInvitationEmail({
							to: invite.email,
							inviteUrl: `${baseUrl}/invite/${invite.token}`,
							role: invite.role,
							invitedBy: invite.invited_by,
						})
					: "skipped";
				await recordAuditEvent({
					category: "users",
					action: "users.invite_created",
					actor: context.user,
					subject: { type: "invite", id: invite.id, label: invite.email },
					request: requestAuditContext(context),
					metadata: { role: invite.role, email_status: emailStatus },
				});
				return { ...invite, email_status: emailStatus };
			} catch (e) {
				throw new ORPCError("CONFLICT", { message: (e as Error).message });
			}
		}),

	revoke: adminOnly.input(idInput).handler(async ({ input, context }) => {
		const invite = await revokeInvite(input.id);
		if (!invite) {
			throw new ORPCError("NOT_FOUND", {
				message: "Einladung nicht gefunden oder bereits angenommen",
			});
		}
		await recordAuditEvent({
			category: "users",
			action: "users.invite_revoked",
			actor: context.user,
			subject: { type: "invite", id: invite.id, label: invite.email },
			request: requestAuditContext(context),
		});
		return { ok: true };
	}),

	getByToken: pub
		.input(v.object({ token: v.pipe(v.string(), v.minLength(1)) }))
		.handler(async ({ input }) => {
			const invite = await getValidInvite(input.token);
			if (!invite) return { valid: false as const };
			return { valid: true as const, email: invite.email, role: invite.role };
		}),

	accept: pub.input(InviteAcceptSchema).handler(async ({ input, context }) => {
		try {
			const accepted = await acceptInvite(input);
			await recordAuditEvent({
				category: "users",
				action: "users.invite_accepted",
				actor: {
					id: accepted.userId,
					email: accepted.email,
					name: accepted.name,
					role: accepted.role,
				},
				subject: {
					type: "user",
					id: accepted.userId,
					label: accepted.email,
				},
				request: requestAuditContext(context),
				metadata: { invite_id: accepted.inviteId, role: accepted.role },
			});
			return { ok: true };
		} catch (e) {
			throw new ORPCError("BAD_REQUEST", { message: (e as Error).message });
		}
	}),
};

const users = {
	list: adminOnly.handler(async () => {
		const rows = await db
			.select({
				id: userTable.id,
				email: userTable.email,
				name: userTable.name,
				role: userTable.role,
				createdAt: userTable.createdAt,
				notifyProtokoll: userTable.notifyProtokoll,
			})
			.from(userTable)
			.orderBy(desc(userTable.createdAt));
		return rows;
	}),

	// Admin override of another account's notification preference.
	setNotify: adminOnly
		.input(
			v.object({
				id: v.pipe(v.string(), v.minLength(1)),
				notify: v.boolean(),
			}),
		)
		.handler(async ({ input, context }) => {
			const ok = await setUserNotifyPref(input.id, input.notify);
			if (!ok) {
				throw new ORPCError("NOT_FOUND", { message: "Konto nicht gefunden" });
			}
			const [subject] = await db
				.select({ email: userTable.email })
				.from(userTable)
				.where(eq(userTable.id, input.id))
				.limit(1);
			await recordAuditEvent({
				category: "users",
				action: "users.notification_changed",
				actor: context.user,
				subject: { type: "user", id: input.id, label: subject?.email },
				request: requestAuditContext(context),
				metadata: { notify: input.notify, changed_by_admin: true },
			});
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
			await setUserNotifyPref(context.user.id, input.notify);
			await recordAuditEvent({
				category: "users",
				action: "users.notification_changed",
				actor: context.user,
				subject: {
					type: "user",
					id: context.user.id,
					label: context.user.email,
				},
				request: requestAuditContext(context),
				metadata: { notify: input.notify, changed_by_admin: false },
			});
			return { ok: true, notify: input.notify };
		}),
};

// ---- Historical revenue -------------------------------------------------

const historicalRevenue = {
	list: authed.handler(() => listHistoricalRevenues()),

	create: adminOnly
		.input(HistoricalRevenueCreateSchema)
		.handler(async ({ input, context }) => {
			try {
				const result = await createHistoricalRevenue(input, context.user);
				if (result.created) {
					await recordAuditEvent({
						category: "umsaetze",
						action: "umsaetze.created",
						actor: context.user,
						subject: {
							type: "historischer_umsatz",
							id: result.row.id,
							label: result.row.anlass,
						},
						request: requestAuditContext(context),
						metadata: {
							anlass_datum: result.row.anlass_datum,
							vergleichsgruppe: result.row.vergleichsgruppe,
							umsatz_cent: result.row.umsatz_cent,
							ausgaben_cent: result.row.ausgaben_cent,
						},
					});
				}
				return result.row;
			} catch (error) {
				if (error instanceof HistoricalRevenueConflictError) {
					throw new ORPCError("CONFLICT", { message: error.message });
				}
				throw error;
			}
		}),

	cancel: adminOnly
		.input(HistoricalRevenueCancelSchema)
		.handler(async ({ input, context }) => {
			try {
				const cancelled = await cancelHistoricalRevenue(
					input.id,
					input.storno_grund,
					context.user,
				);
				await recordAuditEvent({
					category: "umsaetze",
					action: "umsaetze.cancelled",
					actor: context.user,
					subject: {
						type: "historischer_umsatz",
						id: cancelled.id,
						label: cancelled.anlass,
					},
					request: requestAuditContext(context),
					metadata: { grund: input.storno_grund },
				});
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
};

// ---- Reports -------------------------------------------------------------

const reports = {
	vat: authed
		.input(ExportQuerySchema)
		.handler(({ input }) => vatSummary(input.von, input.bis)),
};

// ---- Audit log ----------------------------------------------------------

const audit = {
	list: adminOnly
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
		await db.execute(sql`select 1`);
		return { ok: true, db: true };
	} catch {
		return { ok: false, db: false };
	}
});

export const router = {
	protokolle,
	settings,
	registers,
	invites,
	users,
	profile,
	historicalRevenue,
	reports,
	audit,
	health,
};

export type AppRouter = typeof router;
