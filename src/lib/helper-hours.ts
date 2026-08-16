export const HELPER_HOUR_CATEGORIES = [
	{ code: "gesamtverein", label: "Vereinsbeitrag" },
	{ code: "fussball", label: "Fußball" },
	{ code: "korbball", label: "Korbball" },
	{ code: "tischtennis", label: "Tischtennis" },
	{ code: "darts", label: "Darts" },
	{ code: "gymnastik", label: "Gymnastik" },
	{ code: "senioren", label: "Senioren" },
	{ code: "combo", label: "Combo" },
] as const;

export const HELPER_HOUR_BUDGET_CATEGORIES = HELPER_HOUR_CATEGORIES.filter(
	(entry) => entry.code !== "gesamtverein",
);

export type HelperHourCategory =
	(typeof HELPER_HOUR_CATEGORIES)[number]["code"];

export type HelperHourBudgetCategory =
	(typeof HELPER_HOUR_BUDGET_CATEGORIES)[number]["code"];

export const HELPER_HOUR_CATEGORY_CODES = HELPER_HOUR_CATEGORIES.map(
	(entry) => entry.code,
);

export const HELPER_HOUR_BUDGET_CATEGORY_CODES =
	HELPER_HOUR_BUDGET_CATEGORIES.map((entry) => entry.code);

export function helperHourCategoryLabel(code: HelperHourCategory): string {
	return (
		HELPER_HOUR_CATEGORIES.find((entry) => entry.code === code)?.label ?? code
	);
}

export function formatMinutes(minutes: number): string {
	return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(
		minutes / 60,
	);
}
