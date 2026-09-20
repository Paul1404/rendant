import { ORPCError, os, ValidationError } from "@orpc/server";
import {
	type ValidationIssue,
	validationIssueFields,
	validationMessage,
} from "@/lib/validation-message";
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

// oRPC rejects a request whose input misses the schema with the English frame
// message "Input validation failed" and attaches the raw issues. Neither is fit
// for a person: the message names no field, and the issues carry the submitted
// value. Both get replaced below, so every procedure answers the same way.
function validationIssues(err: unknown): ValidationIssue[] | undefined {
	if (!(err instanceof ORPCError)) return undefined;
	if (!(err.cause instanceof ValidationError)) return undefined;
	const issues = err.cause.issues;
	return Array.isArray(issues) ? (issues as ValidationIssue[]) : undefined;
}

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
		const issues = validationIssues(err);
		if (issues) {
			// Which field a schema rejected is the only thing worth keeping, and the
			// only thing safe to keep: the issues carry the submitted value, and for
			// an API key or a password that must not reach a log or the browser.
			logger.warn("orpc input rejected", {
				event: "orpc.request.invalid",
				requestId: context.requestId,
				procedure,
				fields: validationIssueFields(issues),
			});
			throw new ORPCError("BAD_REQUEST", {
				message: validationMessage(issues),
			});
		}
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
