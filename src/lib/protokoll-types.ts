import type { DenominationCounts } from "@/lib/denominations";
import type { UmsatzUstBasis } from "@/lib/schemas";

// Pure, client-safe shapes for a protokoll and its children. The oRPC RPC
// serializer preserves Date values across the wire, so Date-typed fields stay
// Date on the client.

export type AusgabeRow = {
	id: string;
	bezeichnung: string;
	empfaenger: string;
	beleg_nr: string;
	betrag_cent: number;
	ust_basis_punkte: number;
	reihenfolge: number;
};

export type UmsatzUstRow = {
	id: string;
	ust_basis_punkte: number;
	betrag_cent: number;
	reihenfolge: number;
};

export type ProtokollRow = {
	id: string;
	belegnummer: string;
	erstellt_von_user_id: string | null;
	erstellt_von_name: string | null;
	erstellt_am: Date;
	anlass_datum: string;
	kassennummer: string;
	kassenbezeichnung: string;
	anlass: string;
	anlass_katalog_id: string | null;
	gezaehlt_von: string;
	geprueft_von: string;
	bemerkung: string;
	wechselgeld_cent: number;
	kartenzahlung_cent: number;
	gezaehlt_cent: number;
	ausgaben_cent: number;
	bestand_cent: number;
	tageseinnahmen_cent: number;
	umsatz_ust_basis: UmsatzUstBasis;
	pdf_s3_key: string | null;
	pdf_sha256: string | null;
	storniert_am: Date | null;
	storniert_von_user_id: string | null;
	storniert_von_name: string | null;
	storno_grund: string | null;
	storno_pdf_s3_key: string | null;
	storno_pdf_sha256: string | null;
	counts: DenominationCounts;
};

export type ProtokollDetail = {
	protokoll: ProtokollRow;
	ausgaben: AusgabeRow[];
	umsatzUst: UmsatzUstRow[];
};
