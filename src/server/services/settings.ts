import { ORPCError } from "@orpc/server";
import { and, eq, sql } from "drizzle-orm";
import { hasPermission } from "@/lib/permissions";
import type { VereinStammdaten } from "@/lib/verein";
import { type DbOrTx, db, globalDb } from "@/server/db";
import { appSettings } from "@/server/db/schema";
import { tenants } from "@/server/db/tenant-schema";
import {
	type RecordAuditInput,
	recordAuditEventStrict,
} from "@/server/services/audit";
import { requireTenant, SVU_TENANT_ID } from "@/server/tenant-context";
import { assertTenantPermissionsInTransaction } from "./role-policy";

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

// Two admins can have the same settings page open. Without an optimistic check
// the later save silently overwrites the earlier one, and for the hourly value
// that retroactively revalues every department budget - a money figure changing
// with nothing to show it happened.
export class SettingsConcurrencyError extends Error {
	constructor() {
		super(
			"Die Einstellungen wurden zwischenzeitlich geändert. Bitte neu laden und erneut speichern.",
		);
		this.name = "SettingsConcurrencyError";
	}
}

// Each group carries its own stamp so saving one form on the settings page does
// not invalidate the others.
export type SettingsGroup =
	| "belegnummer_updated_at"
	| "umsatz_ust_updated_at"
	| "helferstunde_wert_updated_at"
	| "verein_updated_at"
	| "email_updated_at"
	| "datev_updated_at"
	| "sumup_updated_at"
	| "mcp_updated_at";

type SettingsRow = typeof appSettings.$inferSelect;

// Reads the current stamp under a row lock and rejects a stale write. Returns
// the new stamp to store, so every updater writes it the same way.
export async function claimSettingsGroup(
	tx: DbOrTx,
	group: SettingsGroup,
	expectedUpdatedAt: string | undefined,
	tenantId = requireTenant().id,
): Promise<Date> {
	const [current] = await tx
		.select()
		.from(appSettings)
		.where(and(eq(appSettings.id, 1), eq(appSettings.tenant_id, tenantId)))
		.limit(1)
		.for("update");
	if (!current) {
		throw new Error("Einstellungen konnten nicht aktualisiert werden");
	}
	// Undefined means a caller that predates the check (or a first write against a
	// row that has no stamp yet); only a mismatch is a conflict.
	if (
		expectedUpdatedAt !== undefined &&
		current[group].toISOString() !== expectedUpdatedAt
	) {
		throw new SettingsConcurrencyError();
	}
	return new Date(Math.max(Date.now(), current[group].getTime() + 1));
}

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

async function loadRow(client: DbOrTx = db): Promise<SettingsRow | undefined> {
	const rows = await client
		.select()
		.from(appSettings)
		.where(eq(appSettings.id, 1))
		.limit(1);
	return rows[0];
}

// The stamp a form sends back on save. Returned with every settings read so the
// client always holds the value its form was rendered from.
export async function getSettingsStamp(
	group: SettingsGroup,
): Promise<string | undefined> {
	const row = await loadRow();
	return row?.[group]?.toISOString();
}

// Callers inside an open transaction must pass their `tx`. Reaching for the root
// client here would take a second connection out of a pool of 10 while the first
// is still held, so ten concurrent writers deadlock the pool against itself.
export async function getBelegnummerSettings(
	client: DbOrTx = db,
): Promise<BelegnummerSettings> {
	const row = await loadRow(client);
	if (!row) return DEFAULT_BELEGNUMMER_SETTINGS;
	return rowToSettings(row);
}

export async function updateBelegnummerSettings(
	patch: BelegnummerSettings,
	audit: RecordAuditInput,
	expectedUpdatedAt?: string,
): Promise<BelegnummerSettings> {
	return db.transaction(async (tx) => {
		const stamp = await claimSettingsGroup(
			tx,
			"belegnummer_updated_at",
			expectedUpdatedAt,
		);
		const rows = await tx
			.update(appSettings)
			.set({
				belegnummer_min_digits: patch.min_digits,
				belegnummer_prefix: patch.prefix,
				belegnummer_include_year: patch.include_year,
				belegnummer_year_format: patch.year_format,
				belegnummer_separator: patch.separator,
				belegnummer_updated_at: stamp,
				updated_at: stamp,
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
	expectedUpdatedAt?: string,
): Promise<UmsatzUstBasis> {
	return db.transaction(async (tx) => {
		const stamp = await claimSettingsGroup(
			tx,
			"umsatz_ust_updated_at",
			expectedUpdatedAt,
		);
		const rows = await tx
			.update(appSettings)
			.set({
				umsatz_ust_basis: basis,
				umsatz_ust_updated_at: stamp,
				updated_at: stamp,
			})
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
	expectedUpdatedAt?: string,
): Promise<number> {
	return db.transaction(async (tx) => {
		const stamp = await claimSettingsGroup(
			tx,
			"helferstunde_wert_updated_at",
			expectedUpdatedAt,
		);
		const rows = await tx
			.update(appSettings)
			.set({
				helferstunde_wert_cent: valueCent,
				helferstunde_wert_updated_at: stamp,
				updated_at: stamp,
			})
			.where(eq(appSettings.id, 1))
			.returning({ valueCent: appSettings.helferstunde_wert_cent });
		if (rows.length === 0) {
			throw new Error("Einstellungen konnten nicht aktualisiert werden");
		}
		await recordAuditEventStrict(tx, audit);
		return Number(rows[0].valueCent);
	});
}

// The deployment-level name predates tenancy and belongs to SVU only. An
// unconfigured club must never inherit another club's name on its documents.
export function resolveVereinsname(storedName?: string | null): string {
	const tenant = requireTenant();
	return (
		storedName?.trim() ||
		(tenant.id === SVU_TENANT_ID ? process.env.VEREINSNAME?.trim() : "") ||
		"Verein"
	);
}

export async function getVereinsname(): Promise<string> {
	const row = await loadRow();
	return resolveVereinsname(row?.vereinsname);
}

function rowToStammdaten(row: SettingsRow): VereinStammdaten {
	return {
		name: resolveVereinsname(row.vereinsname),
		strasse: row.verein_strasse,
		plz: row.verein_plz,
		ort: row.verein_ort,
		vorstand: row.verein_vorstand,
		registergericht: row.verein_registergericht,
		registernummer: row.verein_registernummer,
	};
}

// Full club master data for the PDF footer and the settings form. The name
// keeps the tenant-safe default; the rest are plain stored values (empty
// until configured) and are left out of the document when blank.
export async function getVereinStammdaten(): Promise<VereinStammdaten> {
	const row = await loadRow();
	if (!row) {
		return {
			name: resolveVereinsname(),
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
	expectedUpdatedAt?: string,
): Promise<VereinStammdaten> {
	const tenant = requireTenant();
	const actor = audit.actor;
	if (!actor)
		throw new ORPCError("FORBIDDEN", { message: "Adminrechte erforderlich" });
	// The club name is both public control-plane metadata and club settings.
	// Keep the two representations atomic without granting business-role access
	// to the global registry. Every privileged query carries the selected club.
	return globalDb.transaction(async (tx) => {
		// MCP identities are issued only by verified tenant-bound transports. Human
		// callers still require their live membership and permission in this TX.
		const scopedMcp =
			actor.id === `mcp:${tenant.id}` &&
			hasPermission(tenant, "settings.manage");
		const legacyMcp =
			actor.id === "mcp:codex" &&
			tenant.id === SVU_TENANT_ID &&
			(tenant.permissions === undefined ||
				hasPermission(tenant, "settings.manage"));
		const mcpAdmin = tenant.role === "admin" && (scopedMcp || legacyMcp);
		if (!mcpAdmin) {
			await assertTenantPermissionsInTransaction(
				tx,
				tenant.id,
				actor.id,
				"settings.manage",
			);
		}
		const [registered] = await tx
			.select({ id: tenants.id })
			.from(tenants)
			.where(eq(tenants.id, tenant.id))
			.for("update");
		if (!registered)
			throw new ORPCError("NOT_FOUND", { message: "Verein nicht gefunden" });
		await tx.execute(
			sql`select set_config('app.tenant_id', ${tenant.id}, true)`,
		);
		const stamp = await claimSettingsGroup(
			tx,
			"verein_updated_at",
			expectedUpdatedAt,
			tenant.id,
		);
		const rows = await tx
			.update(appSettings)
			.set({
				verein_updated_at: stamp,
				vereinsname: patch.name.trim(),
				verein_strasse: patch.strasse.trim(),
				verein_plz: patch.plz.trim(),
				verein_ort: patch.ort.trim(),
				verein_vorstand: patch.vorstand.trim(),
				verein_registergericht: patch.registergericht.trim(),
				verein_registernummer: patch.registernummer.trim(),
				updated_at: stamp,
			})
			.where(and(eq(appSettings.id, 1), eq(appSettings.tenant_id, tenant.id)))
			.returning();
		if (rows.length === 0) {
			throw new Error("Einstellungen konnten nicht aktualisiert werden");
		}
		await tx
			.update(tenants)
			.set({ name: patch.name.trim() })
			.where(eq(tenants.id, tenant.id));
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
