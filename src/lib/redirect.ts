const DEFAULT_AUTH_REDIRECT = "/protokolle";

export function sanitizeAuthRedirect(
	value: string | undefined,
	fallback = DEFAULT_AUTH_REDIRECT,
): string {
	if (!value) return fallback;
	if (
		!value.startsWith("/") ||
		value.startsWith("//") ||
		value.startsWith("/\\")
	) {
		return fallback;
	}
	return value;
}
