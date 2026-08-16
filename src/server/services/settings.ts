import { eq } from "drizzle-orm";
import type { VereinStammdaten } from "@/lib/verein";
import { db } from "@/server/db";
import { appSettings } from "@/server/db/schema";
import {
	type RecordAuditInput,
	recordAuditEventStrict,
} from "@/server/services/audit";

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
export const DEFAULT_HELPER_HOUR_VALUE_CENT = 600;

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
	audit: RecordAuditInput,
): Promise<BelegnummerSettings> {
	return db.transaction(async (tx) => {
		const rows = await tx
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
		await recordAuditEventStrict(tx, audit);
		return rowToSettings(rows[0]);
	});
}

export async function getUmsatzUstBasisDefault(): Promise<UmsatzUstBasis> {
	const row = await loadRow();
	if (!row) return DEFAULT_UMSATZ_UST_BASIS;
	return normalizeUmsatzUstBasis(row.umsatz_ust_basis);
}

export async function updateUmsatzUstBasisDefault(
	basis: UmsatzUstBasis,
	audit: RecordAuditInput,
): Promise<UmsatzUstBasis> {
	return db.transaction(async (tx) => {
		const rows = await tx
			.update(appSettings)
			.set({ umsatz_ust_basis: basis, updated_at: new Date() })
			.where(eq(appSettings.id, 1))
			.returning();
		if (rows.length === 0) {
			throw new Error("Einstellungen konnten nicht aktualisiert werden");
		}
		await recordAuditEventStrict(tx, audit);
		return normalizeUmsatzUstBasis(rows[0].umsatz_ust_basis);
	});
}

export async function getHelperHourValueCent(): Promise<number> {
	const row = await loadRow();
	return Number(row?.helferstunde_wert_cent ?? DEFAULT_HELPER_HOUR_VALUE_CENT);
}

export async function updateHelperHourValueCent(
	valueCent: number,
	audit: RecordAuditInput,
): Promise<number> {
	return db.transaction(async (tx) => {
		const rows = await tx
			.update(appSettings)
			.set({ helferstunde_wert_cent: valueCent, updated_at: new Date() })
			.where(eq(appSettings.id, 1))
			.returning({ valueCent: appSettings.helferstunde_wert_cent });
		if (rows.length === 0) {
			throw new Error("Einstellungen konnten nicht aktualisiert werden");
		}
		await recordAuditEventStrict(tx, audit);
		return Number(rows[0].valueCent);
	});
}

// Club name powering the app's "läuft für ..." attribution and the PDF header.
// DB value wins; an empty value falls back to the VEREINSNAME env var, then a
// generic default, so an unconfigured deployment still renders sensibly.
export async function getVereinsname(): Promise<string> {
	const row = await loadRow();
	const fromDb = row?.vereinsname?.trim();
	if (fromDb) return fromDb;
	return process.env.VEREINSNAME?.trim() || "Verein";
}

function rowToStammdaten(row: SettingsRow): VereinStammdaten {
	return {
		name: row.vereinsname.trim() || process.env.VEREINSNAME?.trim() || "Verein",
		strasse: row.verein_strasse,
		plz: row.verein_plz,
		ort: row.verein_ort,
		vorstand: row.verein_vorstand,
		registergericht: row.verein_registergericht,
		registernummer: row.verein_registernummer,
	};
}

// Full club master data for the PDF footer and the settings form. The name
// keeps its env/default fallback; the rest are plain stored values (empty
// until configured) and are left out of the document when blank.
export async function getVereinStammdaten(): Promise<VereinStammdaten> {
	const row = await loadRow();
	if (!row) {
		return {
			name: process.env.VEREINSNAME?.trim() || "Verein",
			strasse: "",
			plz: "",
			ort: "",
			vorstand: "",
			registergericht: "",
			registernummer: "",
		};
	}
	return rowToStammdaten(row);
}

export async function updateVereinStammdaten(
	patch: VereinStammdaten,
	audit: RecordAuditInput,
): Promise<VereinStammdaten> {
	return db.transaction(async (tx) => {
		const rows = await tx
			.update(appSettings)
			.set({
				vereinsname: patch.name.trim(),
				verein_strasse: patch.strasse.trim(),
				verein_plz: patch.plz.trim(),
				verein_ort: patch.ort.trim(),
				verein_vorstand: patch.vorstand.trim(),
				verein_registergericht: patch.registergericht.trim(),
				verein_registernummer: patch.registernummer.trim(),
				updated_at: new Date(),
			})
			.where(eq(appSettings.id, 1))
			.returning();
		if (rows.length === 0) {
			throw new Error("Einstellungen konnten nicht aktualisiert werden");
		}
		await recordAuditEventStrict(tx, audit);
		return rowToStammdaten(rows[0]);
	});
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
