import { ORPCError, os } from "@orpc/server";

export type AuthUser = {
	id: string;
	email: string;
	name: string;
	role: string;
};

export type ORPCContext = {
	user: AuthUser | null;
	headers: Headers;
	clientIp: string;
};

const base = os.$context<ORPCContext>();

const requireUser = base.middleware(async ({ context, next }) => {
	if (!context.user) {
		throw new ORPCError("UNAUTHORIZED", { message: "Nicht angemeldet" });
	}
	return next({ context: { ...context, user: context.user } });
});

const requireAdmin = base.middleware(async ({ context, next }) => {
	if (!context.user) {
		throw new ORPCError("UNAUTHORIZED", { message: "Nicht angemeldet" });
	}
	if (context.user.role !== "admin") {
		throw new ORPCError("FORBIDDEN", {
			message: "Adminrechte erforderlich",
		});
	}
	return next({ context: { ...context, user: context.user } });
});

export const pub = base;
export const authed = base.use(requireUser);
export const adminOnly = base.use(requireAdmin);
