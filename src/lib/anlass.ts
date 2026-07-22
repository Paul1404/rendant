// Shared, dependency-free helpers for the Anlass catalog (plans/007). Safe to
// import from both server and client.

export type AnlassTyp = "wiederkehrend" | "einmalig";

export type AnlassKatalogEntry = {
	id: string;
	name: string;
	typ: AnlassTyp;
	aktiv: boolean;
	reihenfolge: number;
	updatedAt: string;
};

// Normalizes a free-text anlass to a stable key: trim, collapse inner whitespace,
// lowercase (de-DE). Used to match old spellings to a catalog entry via aliases.
export function anlassKey(value: string): string {
	return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("de-DE");
}
