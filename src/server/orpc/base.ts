import { ORPCError, os } from "@orpc/server";
import { logger } from "@/server/logger";

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

// Outermost middleware: log unhandled (unexpected) errors with context, and
// debug-log expected ORPCErrors. Keeps error logging in one place instead of
// scattered through procedures.
const logging = base.middleware(async ({ next, path }) => {
	try {
		return await next();
	} catch (err) {
		const procedure = Array.isArray(path) ? path.join(".") : undefined;
		if (err instanceof ORPCError) {
			logger.debug("orpc procedure rejected", { procedure, code: err.code });
		} else {
			logger.error("orpc procedure failed", { procedure, err });
		}
		throw err;
	}
});

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

export const pub = base.use(logging);
export const authed = pub.use(requireUser);
export const adminOnly = pub.use(requireAdmin);
