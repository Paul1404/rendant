import { ORPCError, os } from "@orpc/server";
import { logger } from "@/server/logger";
import { CashRegisterConcurrencyError } from "@/server/services/cash-registers";
import { SettingsConcurrencyError } from "@/server/services/settings";

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
	requestId: string;
};

const base = os.$context<ORPCContext>();

// Outermost middleware: log unhandled (unexpected) errors with context, and
// debug-log expected ORPCErrors. Keeps error logging in one place instead of
// scattered through procedures.
const logging = base.middleware(async ({ context, next, path }) => {
	try {
		return await next();
	} catch (raw) {
		// A lost-update rejection is an expected outcome with a German message the
		// user can act on, not a server fault. Mapping it here keeps every settings
		// procedure from repeating the same try/catch.
		const err =
			raw instanceof SettingsConcurrencyError ||
			raw instanceof CashRegisterConcurrencyError
				? new ORPCError("CONFLICT", { message: raw.message })
				: raw;
		const procedure = Array.isArray(path) ? path.join(".") : undefined;
		if (err instanceof ORPCError) {
			logger.debug("orpc procedure rejected", {
				event: "orpc.request.rejected",
				requestId: context.requestId,
				procedure,
				code: err.code,
			});
		} else {
			logger.error("orpc procedure failed", {
				event: "orpc.request.failed",
				requestId: context.requestId,
				procedure,
				err,
			});
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
