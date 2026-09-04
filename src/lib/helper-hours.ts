export type HelperHourCategoryArt = "verein" | "abteilung";

export type HelperHourCategory = {
	id: string;
	code: string;
	label: string;
	art: HelperHourCategoryArt;
	sortierung: number;
	aktiv: boolean;
	system: boolean;
};

/**
 * The categories every installation starts with. They are seeded by migration
 * and flagged `system`, so they can be renamed or deactivated but never
 * removed: historical allocations and exports still reference them.
 */
export const HELPER_HOUR_SEED_CATEGORIES = [
	{ code: "gesamtverein", label: "Vereinsbeitrag", art: "verein" },
	{ code: "fussball", label: "Fußball", art: "abteilung" },
	{ code: "korbball", label: "Korbball", art: "abteilung" },
	{ code: "tischtennis", label: "Tischtennis", art: "abteilung" },
	{ code: "darts", label: "Darts", art: "abteilung" },
	{ code: "gymnastik", label: "Gymnastik", art: "abteilung" },
	{ code: "senioren", label: "Senioren", art: "abteilung" },
	{ code: "combo", label: "Combo", art: "abteilung" },
] as const satisfies ReadonlyArray<{
	code: string;
	label: string;
	art: HelperHourCategoryArt;
}>;

export const HELPER_HOUR_CONTRIBUTION_CODE = "gesamtverein";

export const HELPER_HOUR_CATEGORY_ARTEN: ReadonlyArray<{
	value: HelperHourCategoryArt;
	label: string;
	description: string;
}> = [
	{
		value: "abteilung",
		label: "Abteilung",
		description:
			"Erarbeitete Stunden bilden ein eigenes Guthaben, von dem Käufe abgezogen werden.",
	},
	{
		value: "verein",
		label: "Vereinsbeitrag",
		description:
			"Stunden gelten als Beitrag an den Gesamtverein und bilden kein abrufbares Guthaben.",
	},
];

/**
 * Column headings in the Excel lists are matched against this form, so a
 * category is found by its code as well as by its current label.
 */
export function normalizeHelperHourLabel(value: string): string {
	return value
		.trim()
		.toLocaleLowerCase("de-DE")
		.replace(/ß/g, "ss")
		.replace(/[^a-z0-9äöü]+/g, "");
}

/** Stable, URL- and header-safe identifier derived from a new category name. */
export function helperHourCategoryCode(label: string): string {
	const base = label
		.trim()
		.toLocaleLowerCase("de-DE")
		.replace(/ä/g, "ae")
		.replace(/ö/g, "oe")
		.replace(/ü/g, "ue")
		.replace(/ß/g, "ss")
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
	return base.slice(0, 40);
}

export function helperHourCategoryLabel(
	categories: ReadonlyArray<Pick<HelperHourCategory, "code" | "label">>,
	code: string,
): string {
	return categories.find((entry) => entry.code === code)?.label ?? code;
}

/**
 * A purchase is booked in euro and shown as the hours it consumes. The
 * conversion always runs through minutes so the deduction lines up exactly
 * with the way earned minutes are stored.
 */
export function minutesFromCent(cent: number, valueCent: number): number {
	if (valueCent <= 0) return 0;
	return Math.round((cent * 60) / valueCent);
}

export function formatMinutes(minutes: number): string {
	return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(
		minutes / 60,
	);
}

/** Signed variant for deductions and balances, e.g. "-49" or "+12,5". */
export function formatMinutesSigned(minutes: number): string {
	const formatted = formatMinutes(Math.abs(minutes));
	if (minutes === 0) return formatted;
	return `${minutes < 0 ? "-" : "+"}${formatted}`;
}
