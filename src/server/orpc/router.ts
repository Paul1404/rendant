import { ORPCError } from "@orpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import * as v from "valibot";
import { AUDIT_CATEGORIES } from "@/lib/audit";
import {
	AnlassKatalogBulkAssignSchema,
	AnlassKatalogSchema,
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
import {
	session as sessionTable,
	user as userTable,
} from "@/server/db/auth-schema";
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
	recordAuditEventStrict,
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
	HistoricalRevenueCatalogError,
	HistoricalRevenueConflictError,
	HistoricalRevenueInputError,
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
	ProtokollIdempotencyConflictError,
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
				const created = await createProtokoll(input, context.user, {
					request: requestAuditContext(context),
				});
				return created;
			} catch (e) {
				if (e instanceof ProtokollIdempotencyConflictError) {
					throw new ORPCError("CONFLICT", { message: e.message });
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

	storno: authed
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
			);
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
			);
			return { umsatz_ust_basis };
		}),

	getVerein: authed.handler(() => getVereinStammdaten()),

	updateVerein: adminOnly
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
			);
			return result;
		}),

	getEmail: adminOnly.handler(() => getEmailSettings()),

	updateEmail: adminOnly
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

	update: adminOnly
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

	remove: adminOnly.input(idInput).handler(async ({ input, context }) => {
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
	list: authed.handler(() => listKatalog()),

	create: adminOnly
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

	bulkAssign: adminOnly
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

	update: adminOnly
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

	remove: adminOnly.input(idInput).handler(async ({ input, context }) => {
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
	list: adminOnly.handler(() => listInvites()),

	create: adminOnly
		.input(InviteCreateSchema)
		.handler(async ({ input, context }) => {
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
				const baseUrl = publicBaseUrl(context.headers);
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

	revoke: adminOnly.input(idInput).handler(async ({ input, context }) => {
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
		.handler(async ({ input }) => {
			const invite = await getValidInvite(input.token);
			if (!invite) return { valid: false as const };
			return { valid: true as const, email: invite.email, role: invite.role };
		}),

	accept: pub.input(InviteAcceptSchema).handler(async ({ input, context }) => {
		try {
			await acceptInvite({
				...input,
				audit: { request: requestAuditContext(context) },
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
				banned: userTable.banned,
				createdAt: userTable.createdAt,
				notifyProtokoll: userTable.notifyProtokoll,
			})
			.from(userTable)
			.orderBy(desc(userTable.createdAt));
		return rows;
	}),

	setRole: adminOnly
		.input(
			v.object({
				id: v.pipe(v.string(), v.minLength(1)),
				role: v.picklist(["user", "admin"]),
			}),
		)
		.handler(async ({ input, context }) => {
			if (input.id === context.user.id && input.role !== "admin") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Die eigene Admin-Rolle kann nicht entfernt werden",
				});
			}
			const changed = await db.transaction(async (tx) => {
				await tx.execute(
					// Keep the established lock key so old and new app revisions share
					// the same cross-deployment concurrency boundary during rollout.
					sql`select pg_advisory_xact_lock(hashtext('svufo:user-access-admin'))`,
				);
				const [target] = await tx
					.select({
						id: userTable.id,
						email: userTable.email,
						role: userTable.role,
						banned: userTable.banned,
					})
					.from(userTable)
					.where(eq(userTable.id, input.id))
					.limit(1)
					.for("update");
				if (!target) return null;
				if (
					target.role === "admin" &&
					input.role !== "admin" &&
					!target.banned
				) {
					const [admins] = await tx
						.select({ count: sql<number>`count(*)` })
						.from(userTable)
						.where(
							and(
								eq(userTable.role, "admin"),
								sql`${userTable.banned} is not true`,
							),
						);
					if (Number(admins?.count ?? 0) <= 1) {
						throw new ORPCError("CONFLICT", {
							message: "Der letzte aktive Admin kann nicht herabgestuft werden",
						});
					}
				}
				await tx
					.update(userTable)
					.set({ role: input.role, updatedAt: new Date() })
					.where(eq(userTable.id, input.id));
				await tx.delete(sessionTable).where(eq(sessionTable.userId, input.id));
				const result = { ...target, role: input.role };
				await recordAuditEventStrict(tx, {
					category: "users",
					action: "users.role_changed",
					actor: context.user,
					subject: { type: "user", id: result.id, label: result.email },
					request: requestAuditContext(context),
					metadata: { role: result.role },
				});
				return result;
			});
			if (!changed) {
				throw new ORPCError("NOT_FOUND", { message: "Konto nicht gefunden" });
			}
			return { ok: true as const, role: changed.role };
		}),

	setBanned: adminOnly
		.input(
			v.object({
				id: v.pipe(v.string(), v.minLength(1)),
				banned: v.boolean(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (input.id === context.user.id && input.banned) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Das eigene Konto kann nicht gesperrt werden",
				});
			}
			const changed = await db.transaction(async (tx) => {
				await tx.execute(
					sql`select pg_advisory_xact_lock(hashtext('svufo:user-access-admin'))`,
				);
				const [target] = await tx
					.select({
						id: userTable.id,
						email: userTable.email,
						role: userTable.role,
						banned: userTable.banned,
					})
					.from(userTable)
					.where(eq(userTable.id, input.id))
					.limit(1)
					.for("update");
				if (!target) return null;
				if (input.banned && target.role === "admin" && !target.banned) {
					const [admins] = await tx
						.select({ count: sql<number>`count(*)` })
						.from(userTable)
						.where(
							and(
								eq(userTable.role, "admin"),
								sql`${userTable.banned} is not true`,
							),
						);
					if (Number(admins?.count ?? 0) <= 1) {
						throw new ORPCError("CONFLICT", {
							message: "Der letzte aktive Admin kann nicht gesperrt werden",
						});
					}
				}
				await tx
					.update(userTable)
					.set({
						banned: input.banned,
						banReason: input.banned ? "Durch Administrator gesperrt" : null,
						banExpires: null,
						updatedAt: new Date(),
					})
					.where(eq(userTable.id, input.id));
				if (input.banned) {
					await tx
						.delete(sessionTable)
						.where(eq(sessionTable.userId, input.id));
				}
				const result = { ...target, banned: input.banned };
				await recordAuditEventStrict(tx, {
					category: "users",
					action: input.banned ? "users.blocked" : "users.unblocked",
					actor: context.user,
					subject: { type: "user", id: result.id, label: result.email },
					request: requestAuditContext(context),
					metadata: { role: result.role },
				});
				return result;
			});
			if (!changed) {
				throw new ORPCError("NOT_FOUND", { message: "Konto nicht gefunden" });
			}
			return { ok: true as const, banned: changed.banned };
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
	list: authed.handler(() => listHistoricalRevenues()),

	create: adminOnly
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

	cancel: adminOnly
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
	anlassKatalog,
	invites,
	users,
	profile,
	historicalRevenue,
	reports,
	audit,
	health,
};

export type AppRouter = typeof router;
