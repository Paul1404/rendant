export const UMSATZBEREICHE = [
	{ code: "wirtschaftsbetrieb", label: "Wirtschaftsbetrieb" },
	{ code: "veranstaltungen", label: "Veranstaltungen" },
	{ code: "eintrittsgelder", label: "Eintrittsgelder" },
	{ code: "verkauf_spielfeld", label: "Verkauf Spielfeld" },
	{ code: "seniorennachmittag", label: "Seniorennachmittag" },
	{ code: "sonstiges", label: "Sonstiges" },
] as const;

export type Umsatzbereich = (typeof UMSATZBEREICHE)[number]["code"];

const LABELS = new Map<Umsatzbereich, string>(
	UMSATZBEREICHE.map((entry) => [entry.code, entry.label]),
);

export function umsatzbereichLabel(value: Umsatzbereich): string {
	return LABELS.get(value) ?? value;
}

export function isUmsatzbereich(value: unknown): value is Umsatzbereich {
	return UMSATZBEREICHE.some((entry) => entry.code === value);
}

// Compatibility mapping for the former detailed Umsatzgruppen catalog. It is
// deliberately conservative; ambiguous sport sales remain Sonstiges until an
// administrator classifies the individual historical row.
export function inferUmsatzbereich(name: string): Umsatzbereich {
	const key = name.trim().toLocaleLowerCase("de-DE");
	if (key.includes("biergarten") || key.includes("donnerstag")) {
		return "wirtschaftsbetrieb";
	}
	if (key.includes("seniorennachmittag")) return "seniorennachmittag";
	if (
		key.includes("sommerfest") ||
		key.includes("haxenabend") ||
		key.includes("bürgerversammlung") ||
		key.includes("frauenbund") ||
		key.includes("public viewing")
	) {
		return "veranstaltungen";
	}
	return "sonstiges";
}
