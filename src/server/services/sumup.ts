// SumUp-Anbindung. Ein Admin hinterlegt einen API-Key aus dem SumUp-Dashboard
// (Einstellungen > Für Entwickler > API-Keys). Rendant ermittelt daraus den
// Händlercode und kann beim Erfassen eines Protokolls die Kartenumsätze eines
// Tages abrufen, statt dass jemand sie aus der SumUp-App abschreibt.
//
// Der Key liegt wie das SMTP-Passwort verschlüsselt in app_settings und wird
// nie an den Browser gegeben. Jeder Abruf ist ein reiner Lesezugriff auf die
// Transaktionshistorie; Rendant schreibt nichts nach SumUp.

import { eq } from "drizzle-orm";
import { berlinDayRangeUtc } from "@/lib/date";
import { db } from "@/server/db";
import { appSettings } from "@/server/db/schema";
import { logger } from "@/server/logger";
import {
	type RecordAuditInput,
	recordAuditEventStrict,
} from "@/server/services/audit";
import { decryptSecret, encryptSecret } from "@/server/services/secret-box";
import { claimSettingsGroup } from "@/server/services/settings";

export const SUMUP_API_BASE = "https://api.sumup.com";
const REQUEST_TIMEOUT_MS = 15_000;
const PAGE_SIZE = 100;
// Ein Vereinstag hat einige Dutzend Kartenzahlungen, nicht Tausende. Die
// Grenze schützt nur vor einer Endlosschleife bei kaputten Paging-Links.
const MAX_PAGES = 50;

export type SumupSettings = {
	enabled: boolean;
	has_api_key: boolean;
	merchant_code: string;
	merchant_name: string;
	updated_at: string | undefined;
};

export type SumupSettingsPatch = {
	enabled: boolean;
	// Write-only. Empty string leaves the stored key untouched.
	api_key?: string;
	// Explicitly removes the stored key (and with it the merchant binding).
	clear_api_key?: boolean;
};

type SettingsRow = typeof appSettings.$inferSelect;

// Sichtbare Fehlermeldung für den Admin bzw. den Erfasser. Alles, was SumUp
// selbst antwortet, bleibt im Log; nur die Einordnung erreicht die Oberfläche.
export class SumupError extends Error {
	readonly code:
		| "NOT_CONFIGURED"
		| "UNAUTHORIZED"
		| "NO_MERCHANT"
		| "UPSTREAM"
		| "INVALID_RESPONSE";
	constructor(code: SumupError["code"], message: string) {
		super(message);
		this.name = "SumupError";
		this.code = code;
	}
}

async function loadRow(): Promise<SettingsRow | undefined> {
	const rows = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.id, 1))
		.limit(1);
	return rows[0];
}

function rowToSettings(row: SettingsRow): SumupSettings {
	return {
		enabled: row.sumup_enabled,
		has_api_key: row.sumup_api_key_enc.length > 0,
		merchant_code: row.sumup_merchant_code,
		merchant_name: row.sumup_merchant_name,
		updated_at: row.sumup_updated_at.toISOString(),
	};
}

export async function getSumupSettings(): Promise<SumupSettings> {
	const row = await loadRow();
	if (!row) {
		return {
			enabled: false,
			has_api_key: false,
			merchant_code: "",
			merchant_name: "",
			updated_at: undefined,
		};
	}
	return rowToSettings(row);
}

// Was der Erfasser wissen muss: gibt es den Knopf "aus SumUp übernehmen".
// Aktiv heißt Schalter an und ein Key mit ermitteltem Händlercode hinterlegt.
export async function isSumupActive(): Promise<boolean> {
	const row = await loadRow();
	return Boolean(
		row?.sumup_enabled &&
			row.sumup_api_key_enc.length > 0 &&
			row.sumup_merchant_code.length > 0,
	);
}

// Speichert Schalter und Key. Ein neuer Key wird sofort gegen SumUp geprüft,
// damit kein Key gespeichert wird, der nie funktionieren wird, und der
// Händlercode gleich mitkommt. Der Abgleich läuft vor der Transaktion, damit
// die Sperre auf app_settings nicht für einen Netzwerkaufruf gehalten wird.
export async function updateSumupSettings(
	patch: SumupSettingsPatch,
	audit: RecordAuditInput,
	expectedUpdatedAt?: string,
): Promise<SumupSettings> {
	let merchant: SumupMerchant | null = null;
	const newKey = patch.clear_api_key ? "" : (patch.api_key ?? "").trim();
	if (newKey) {
		merchant = await verifySumupApiKey(newKey);
	}

	return db.transaction(async (tx) => {
		const stamp = await claimSettingsGroup(
			tx,
			"sumup_updated_at",
			expectedUpdatedAt,
		);
		const set: Partial<SettingsRow> = {
			sumup_enabled: patch.enabled,
			sumup_updated_at: stamp,
			updated_at: stamp,
		};
		if (patch.clear_api_key) {
			set.sumup_api_key_enc = "";
			set.sumup_merchant_code = "";
			set.sumup_merchant_name = "";
			set.sumup_enabled = false;
		} else if (newKey && merchant) {
			set.sumup_api_key_enc = encryptSecret(newKey);
			set.sumup_merchant_code = merchant.code;
			set.sumup_merchant_name = merchant.name;
		}
		const rows = await tx
			.update(appSettings)
			.set(set)
			.where(eq(appSettings.id, 1))
			.returning();
		if (rows.length === 0) {
			throw new Error("Einstellungen konnten nicht aktualisiert werden");
		}
		await recordAuditEventStrict(tx, audit);
		return rowToSettings(rows[0]);
	});
}

// ---- HTTP -----------------------------------------------------------------

type SumupRequestInit = {
	apiKey: string;
	path: string;
	fetchImpl?: typeof fetch;
};

async function sumupGet(init: SumupRequestInit): Promise<unknown> {
	const doFetch = init.fetchImpl ?? fetch;
	const url = init.path.startsWith("http")
		? init.path
		: `${SUMUP_API_BASE}${init.path}`;
	let res: Response;
	try {
		res = await doFetch(url, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${init.apiKey}`,
				Accept: "application/json",
			},
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
	} catch (e) {
		logger.warn("SumUp nicht erreichbar", { error: e });
		throw new SumupError(
			"UPSTREAM",
			"SumUp ist gerade nicht erreichbar. Bitte später erneut versuchen.",
		);
	}
	if (res.status === 401 || res.status === 403) {
		throw new SumupError(
			"UNAUTHORIZED",
			"SumUp lehnt den API-Key ab. Bitte im SumUp-Dashboard einen neuen Key erzeugen und hier eintragen.",
		);
	}
	if (!res.ok) {
		logger.warn("SumUp antwortet mit Fehler", {
			status: res.status,
			path: init.path.replace(/\?.*$/, ""),
		});
		throw new SumupError(
			"UPSTREAM",
			`SumUp antwortet mit Fehler ${res.status}. Bitte später erneut versuchen.`,
		);
	}
	try {
		return await res.json();
	} catch {
		throw new SumupError(
			"INVALID_RESPONSE",
			"SumUp hat eine unlesbare Antwort geliefert.",
		);
	}
}

// ---- Händler ----------------------------------------------------------------

export type SumupMerchant = { code: string; name: string };

type MembershipItem = {
	resource_id?: unknown;
	type?: unknown;
	status?: unknown;
	resource?: { id?: unknown; name?: unknown; type?: unknown } | null;
};

// Ein API-Key gehört zu genau einem Händlerkonto; die Mitgliedschaftsliste
// nennt es. Mehrere Händler wären ein Multi-Konto-Setup, das Rendant nicht
// abbildet: dann gewinnt der erste akzeptierte Eintrag, und der Name im
// Formular zeigt, welcher das ist.
export function pickMerchant(payload: unknown): SumupMerchant | null {
	const items = (payload as { items?: unknown })?.items;
	if (!Array.isArray(items)) return null;
	const merchants = (items as MembershipItem[]).filter((m) => {
		const type = m.resource?.type ?? m.type;
		return type === "merchant" && (m.status == null || m.status === "accepted");
	});
	const first = merchants[0];
	if (!first) return null;
	const code = first.resource?.id ?? first.resource_id;
	if (typeof code !== "string" || !code) return null;
	const name =
		typeof first.resource?.name === "string" ? first.resource.name : "";
	return { code, name };
}

export async function verifySumupApiKey(
	apiKey: string,
	fetchImpl?: typeof fetch,
): Promise<SumupMerchant> {
	const payload = await sumupGet({
		apiKey,
		path: "/v0.1/memberships?limit=50&resource.type=merchant",
		fetchImpl,
	});
	const merchant = pickMerchant(payload);
	if (!merchant) {
		throw new SumupError(
			"NO_MERCHANT",
			"Der API-Key gehört zu keinem SumUp-Händlerkonto. Bitte den Key im Konto des Vereins erzeugen.",
		);
	}
	return merchant;
}

// ---- Transaktionen ---------------------------------------------------------

export type SumupTransaction = {
	id: string;
	transaction_code: string;
	amount: number;
	currency: string;
	timestamp: string;
	status: string;
	payment_type: string;
	type: string;
	refunded_amount: number;
	card_type: string;
};

function asString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function normalizeTransaction(raw: unknown): SumupTransaction | null {
	if (!raw || typeof raw !== "object") return null;
	const r = raw as Record<string, unknown>;
	const id = asString(r.id) || asString(r.transaction_id);
	if (!id) return null;
	return {
		id,
		transaction_code: asString(r.transaction_code),
		amount: asNumber(r.amount),
		currency: asString(r.currency),
		timestamp: asString(r.timestamp),
		status: asString(r.status),
		payment_type: asString(r.payment_type),
		type: asString(r.type),
		refunded_amount: asNumber(r.refunded_amount),
		card_type: asString(r.card_type),
	};
}

// SumUp liefert Beträge in Euro mit Nachkommastellen als Gleitkommazahl.
// Runden statt abschneiden, sonst wird aus 10.1 der Wert 1009.
export function euroToCent(amount: number): number {
	return Math.round(amount * 100);
}

export type SumupDaySummary = {
	// Netto: erfolgreiche Kartenzahlungen abzüglich bereits erstatteter Anteile.
	kartenzahlung_cent: number;
	brutto_cent: number;
	erstattet_cent: number;
	anzahl: number;
	// Zahlungen, die im Zeitraum liegen, aber nicht mitzählen (bar, fehlgeschlagen,
	// fremde Währung). Für den Hinweis im Formular.
	uebersprungen: number;
};

// Zählt, was tatsächlich als Kartenumsatz auf dem Konto ankommt: erfolgreiche
// oder (teil)erstattete Zahlungen ohne Bargeld, abzüglich der Erstattung. Die
// Erstattungen selbst erscheinen in der Historie zusätzlich als eigene Zeilen
// vom Typ REFUND, die hier bewusst nicht noch einmal abgezogen werden.
export function summarizeCardRevenue(
	transactions: SumupTransaction[],
	currency = "EUR",
): SumupDaySummary {
	const seen = new Set<string>();
	let brutto = 0;
	let erstattet = 0;
	let anzahl = 0;
	let uebersprungen = 0;
	for (const t of transactions) {
		if (seen.has(t.id)) continue;
		seen.add(t.id);
		const isPayment = t.type === "" || t.type === "PAYMENT";
		const ok = t.status === "SUCCESSFUL" || t.status === "REFUNDED";
		const isCard = t.payment_type !== "CASH";
		const sameCurrency = !t.currency || t.currency === currency;
		if (!isPayment || !ok || !isCard || !sameCurrency) {
			uebersprungen += 1;
			continue;
		}
		const amountCent = euroToCent(t.amount);
		const refundCent = Math.min(euroToCent(t.refunded_amount), amountCent);
		brutto += amountCent;
		erstattet += refundCent;
		anzahl += 1;
	}
	return {
		kartenzahlung_cent: brutto - erstattet,
		brutto_cent: brutto,
		erstattet_cent: erstattet,
		anzahl,
		uebersprungen,
	};
}

// Der "next"-Link kommt als Query-String ohne Pfad. Er wird an den Pfad der
// Historie gehängt; ein absoluter Link wird unverändert übernommen.
export function resolveNextLink(
	basePath: string,
	links: unknown,
): string | null {
	if (!Array.isArray(links)) return null;
	const next = links.find(
		(l) =>
			l &&
			typeof l === "object" &&
			(l as { rel?: unknown }).rel === "next" &&
			typeof (l as { href?: unknown }).href === "string",
	) as { href: string } | undefined;
	if (!next?.href) return null;
	const href = next.href;
	if (href.startsWith("http")) return href;
	if (href.startsWith("/")) return href;
	return `${basePath}?${href.replace(/^\?/, "")}`;
}

export async function listSumupTransactions(input: {
	apiKey: string;
	merchantCode: string;
	from: Date;
	to: Date;
	fetchImpl?: typeof fetch;
}): Promise<SumupTransaction[]> {
	const basePath = `/v2.1/merchants/${encodeURIComponent(input.merchantCode)}/transactions/history`;
	const params = new URLSearchParams({
		limit: String(PAGE_SIZE),
		order: "ascending",
		oldest_time: input.from.toISOString(),
		newest_time: input.to.toISOString(),
	});
	let path: string | null = `${basePath}?${params.toString()}`;
	const out: SumupTransaction[] = [];
	for (let page = 0; path && page < MAX_PAGES; page += 1) {
		const payload = (await sumupGet({
			apiKey: input.apiKey,
			path,
			fetchImpl: input.fetchImpl,
		})) as { items?: unknown; links?: unknown };
		const items = Array.isArray(payload?.items) ? payload.items : [];
		for (const raw of items) {
			const t = normalizeTransaction(raw);
			if (!t) continue;
			// Ein Folge-Link kann über das Tagesende hinauslaufen; der Zeitraum
			// wird deshalb auch hier eingehalten.
			const ts = t.timestamp ? Date.parse(t.timestamp) : Number.NaN;
			if (Number.isFinite(ts)) {
				if (ts < input.from.getTime() || ts >= input.to.getTime()) continue;
			}
			out.push(t);
		}
		if (items.length === 0) break;
		path = resolveNextLink(basePath, payload?.links);
	}
	return out;
}

export type SumupCardRevenueResult = SumupDaySummary & {
	datum: string;
	merchant_name: string;
};

// Kartenumsatz eines Veranstaltungstags (Berliner Kalendertag) aus SumUp.
export async function fetchSumupCardRevenue(
	datum: string,
	fetchImpl?: typeof fetch,
): Promise<SumupCardRevenueResult> {
	const row = await loadRow();
	const apiKey = row ? decryptSecret(row.sumup_api_key_enc) : "";
	if (!row?.sumup_enabled || !apiKey || !row.sumup_merchant_code) {
		throw new SumupError(
			"NOT_CONFIGURED",
			"SumUp ist nicht eingerichtet. Ein Admin kann die Anbindung unter Einstellungen aktivieren.",
		);
	}
	const { from, to } = berlinDayRangeUtc(datum);
	const transactions = await listSumupTransactions({
		apiKey,
		merchantCode: row.sumup_merchant_code,
		from,
		to,
		fetchImpl,
	});
	return {
		...summarizeCardRevenue(transactions),
		datum,
		merchant_name: row.sumup_merchant_name,
	};
}
