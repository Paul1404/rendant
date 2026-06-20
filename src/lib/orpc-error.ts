import { ORPCError } from "@orpc/client";

// Pull a user-facing message off an oRPC error. Procedures throw ORPCError with
// a German message for every expected failure; anything else falls back.
export function orpcMessage(e: unknown, fallback: string): string {
	if (e instanceof ORPCError) return e.message || fallback;
	if (e instanceof Error && e.message) return e.message;
	return fallback;
}
