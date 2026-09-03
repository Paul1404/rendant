// `%` and `_` are wildcards inside ILIKE, so a search for "50_" or "10%" would
// otherwise match far more than the user typed. Escaping them (and the escape
// character itself) makes the search term literal, which is what someone typing
// into a filter box expects.
export function ilikeContains(term: string, maxLength = 100): string {
	const escaped = term
		.trim()
		.slice(0, maxLength)
		.replace(/[\\%_]/g, "\\$&");
	return `%${escaped}%`;
}
