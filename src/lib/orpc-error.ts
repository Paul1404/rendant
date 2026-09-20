import { ORPCError } from "@orpc/client";
import {
	GENERIC_VALIDATION_MESSAGE,
	validationMessage,
} from "@/lib/validation-message";

// Rahmenmeldungen von oRPC. Sie sind englisch und nennen kein Feld, also dürfen
// sie nie als Fehlermeldung durchgereicht werden. Der Server ersetzt sie bereits
// (siehe src/server/orpc/base.ts); das hier ist die zweite Sicherung für den
// Fall, dass ein Aufruf an dieser Middleware vorbeikommt.
const FRAME_MESSAGES = new Set([
	"Input validation failed",
	"Output validation failed",
]);

// Pull a user-facing message off an oRPC error. Procedures throw ORPCError with
// a German message for every expected failure; anything else falls back.
export function orpcMessage(e: unknown, fallback: string): string {
	if (e instanceof ORPCError) {
		if (FRAME_MESSAGES.has(e.message)) {
			const issues = (e.data as { issues?: unknown } | undefined)?.issues;
			return Array.isArray(issues)
				? validationMessage(issues)
				: GENERIC_VALIDATION_MESSAGE;
		}
		return e.message || fallback;
	}
	if (e instanceof Error && e.message) return e.message;
	return fallback;
}
