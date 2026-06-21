import { ORPCError } from "@orpc/server";
import { desc } from "drizzle-orm";
import * as v from "valibot";
import {
	BelegnummerSettingsSchema,
	CashRegisterSchema,
	CreateProtokollSchema,
	ExportQuerySchema,
	InviteAcceptSchema,
	InviteCreateSchema,
	StornoSchema,
	UmsatzUstBasisSettingsSchema,
	VereinSettingsSchema,
} from "@/lib/schemas";
import { db } from "@/server/db";
import { user as userTable } from "@/server/db/auth-schema";
import { previewNextBelegnummer } from "@/server/services/belegnummer";
import {
	createCashRegister,
	deleteCashRegister,
	listCashRegisters,
	updateCashRegister,
} from "@/server/services/cash-registers";
import {
	acceptInvite,
	createInvite,
	getValidInvite,
	listInvites,
	revokeInvite,
} from "@/server/services/invitations";
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
	getVereinsname,
	updateBelegnummerSettings,
	updateUmsatzUstBasisDefault,
	updateVereinsname,
} from "@/server/services/settings";
import { adminOnly, authed, pub } from "./base";

const idInput = v.object({ id: v.pipe(v.string(), v.minLength(1)) });

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

	create: authed.input(CreateProtokollSchema).handler(async ({ input }) => {
		try {
			return await createProtokoll(input);
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
		.handler(async ({ input }) => {
			try {
				await stornoProtokoll(input.id, { storno_grund: input.storno_grund });
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

	regeneratePdf: authed.input(idInput).handler(async ({ input }) => {
		try {
			await regenerateProtokollPdf(input.id);
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
		.handler(async ({ input }) => {
			const updated = await updateBelegnummerSettings({
				min_digits: input.min_digits,
				prefix: input.prefix,
				include_year: input.include_year,
				year_format: input.year_format,
				separator: input.separator,
			});
			return { settings: updated, preview: await previewNextBelegnummer() };
		}),

	getUmsatzUstBasis: authed.handler(async () => ({
		umsatz_ust_basis: await getUmsatzUstBasisDefault(),
	})),

	updateUmsatzUstBasis: adminOnly
		.input(UmsatzUstBasisSettingsSchema)
		.handler(async ({ input }) => ({
			umsatz_ust_basis: await updateUmsatzUstBasisDefault(
				input.umsatz_ust_basis,
			),
		})),

	getVerein: authed.handler(async () => ({
		vereinsname: await getVereinsname(),
	})),

	updateVerein: adminOnly
		.input(VereinSettingsSchema)
		.handler(async ({ input }) => ({
			vereinsname: await updateVereinsname(input.vereinsname),
		})),
};

// ---- Cash registers ------------------------------------------------------

const registers = {
	list: authed.handler(() => listCashRegisters()),

	create: adminOnly.input(CashRegisterSchema).handler(async ({ input }) => {
		try {
			return { register: await createCashRegister(input) };
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
		.handler(async ({ input }) => {
			try {
				const register = await updateCashRegister(input.id, {
					kassennummer: input.kassennummer,
					kassenbezeichnung: input.kassenbezeichnung,
					wechselgeld_cent: input.wechselgeld_cent,
				});
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

	remove: adminOnly.input(idInput).handler(async ({ input }) => {
		const ok = await deleteCashRegister(input.id);
		if (!ok)
			throw new ORPCError("NOT_FOUND", { message: "Kasse nicht gefunden" });
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
				return await createInvite({
					email: input.email,
					role: input.role,
					invitedBy: context.user.email,
				});
			} catch (e) {
				throw new ORPCError("CONFLICT", { message: (e as Error).message });
			}
		}),

	revoke: adminOnly.input(idInput).handler(async ({ input }) => {
		const ok = await revokeInvite(input.id);
		if (!ok) {
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

	accept: pub.input(InviteAcceptSchema).handler(async ({ input }) => {
		try {
			await acceptInvite(input);
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
			})
			.from(userTable)
			.orderBy(desc(userTable.createdAt));
		return rows;
	}),
};

// ---- Reports -------------------------------------------------------------

const reports = {
	vat: authed
		.input(ExportQuerySchema)
		.handler(({ input }) => vatSummary(input.von, input.bis)),
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
	reports,
	health,
};

export type AppRouter = typeof router;
