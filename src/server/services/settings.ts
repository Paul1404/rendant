import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { appSettings } from "@/server/db/schema";

export type YearFormat = "long" | "short";
export type Separator = "-" | "/" | "." | "_";
export type UmsatzUstBasis = "pre_card" | "post_card";

export type BelegnummerSettings = {
	min_digits: number;
	prefix: string;
	include_year: boolean;
	year_format: YearFormat;
	separator: Separator;
};

export const DEFAULT_BELEGNUMMER_SETTINGS: BelegnummerSettings = {
	min_digits: 2,
	prefix: "",
	include_year: false,
	year_format: "long",
	separator: "-",
};

export const DEFAULT_UMSATZ_UST_BASIS: UmsatzUstBasis = "post_card";

type SettingsRow = typeof appSettings.$inferSelect;

function rowToSettings(row: SettingsRow): BelegnummerSettings {
	return {
		min_digits: Number(row.belegnummer_min_digits),
		prefix: row.belegnummer_prefix,
		include_year: row.belegnummer_include_year,
		year_format: row.belegnummer_year_format === "short" ? "short" : "long",
		separator: (["-", "/", ".", "_"].includes(row.belegnummer_separator)
			? row.belegnummer_separator
			: "-") as Separator,
	};
}

function normalizeUmsatzUstBasis(value: unknown): UmsatzUstBasis {
	return value === "pre_card" ? "pre_card" : "post_card";
}

async function loadRow(): Promise<SettingsRow | undefined> {
	const rows = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.id, 1))
		.limit(1);
	return rows[0];
}

export async function getBelegnummerSettings(): Promise<BelegnummerSettings> {
	const row = await loadRow();
	if (!row) return DEFAULT_BELEGNUMMER_SETTINGS;
	return rowToSettings(row);
}

export async function updateBelegnummerSettings(
	patch: BelegnummerSettings,
): Promise<BelegnummerSettings> {
	const rows = await db
		.update(appSettings)
		.set({
			belegnummer_min_digits: patch.min_digits,
			belegnummer_prefix: patch.prefix,
			belegnummer_include_year: patch.include_year,
			belegnummer_year_format: patch.year_format,
			belegnummer_separator: patch.separator,
			updated_at: new Date(),
		})
		.where(eq(appSettings.id, 1))
		.returning();
	if (rows.length === 0) {
		throw new Error("Einstellungen konnten nicht aktualisiert werden");
	}
	return rowToSettings(rows[0]);
}

export async function getUmsatzUstBasisDefault(): Promise<UmsatzUstBasis> {
	const row = await loadRow();
	if (!row) return DEFAULT_UMSATZ_UST_BASIS;
	return normalizeUmsatzUstBasis(row.umsatz_ust_basis);
}

export async function updateUmsatzUstBasisDefault(
	basis: UmsatzUstBasis,
): Promise<UmsatzUstBasis> {
	const rows = await db
		.update(appSettings)
		.set({ umsatz_ust_basis: basis, updated_at: new Date() })
		.where(eq(appSettings.id, 1))
		.returning();
	if (rows.length === 0) {
		throw new Error("Einstellungen konnten nicht aktualisiert werden");
	}
	return normalizeUmsatzUstBasis(rows[0].umsatz_ust_basis);
}

export function formatBelegnummerWithSettings(
	sequence: number,
	year: number,
	s: BelegnummerSettings,
): string {
	const parts: string[] = [];
	if (s.prefix) parts.push(s.prefix);
	if (s.include_year) {
		parts.push(
			s.year_format === "short"
				? String(year % 100).padStart(2, "0")
				: String(year),
		);
	}
	parts.push(String(sequence).padStart(s.min_digits, "0"));
	return parts.join(s.separator);
}
