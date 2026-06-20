import { asc, desc, eq, isNull } from "drizzle-orm";
import { getBranding } from "@/lib/branding";
import { S3_PREFIX } from "@/lib/constants";
import { currentYearBerlin, formatFilenameStamp } from "@/lib/date";
import { DENOMINATIONS, type DenominationCounts } from "@/lib/denominations";
import type {
	AusgabeRow,
	ProtokollDetail,
	ProtokollRow,
	UmsatzUstRow,
} from "@/lib/protokoll-types";
import type { CreateProtokollInput, StornoInput } from "@/lib/schemas";
import { db } from "@/server/db";
import { ausgaben, protokolle, protokollUmsatzUst } from "@/server/db/schema";
import { logger } from "@/server/logger";
import { nextBelegnummerInTx } from "@/server/services/belegnummer";
import { renderProtokollPdf } from "@/server/services/pdf";
import { deletePdf, uploadPdf } from "@/server/services/s3";

type DbProtokoll = typeof protokolle.$inferSelect;

function rowToProtokoll(row: DbProtokoll): ProtokollRow {
	const counts = {} as DenominationCounts;
	for (const d of DENOMINATIONS) {
		counts[d.key] = Number((row as Record<string, unknown>)[d.key] ?? 0);
	}
	return {
		id: row.id,
		belegnummer: row.belegnummer,
		erstellt_am: row.erstellt_am,
		anlass_datum: row.anlass_datum,
		kassennummer: row.kassennummer ?? "",
		kassenbezeichnung: row.kassenbezeichnung ?? "",
		anlass: row.anlass,
		gezaehlt_von: row.gezaehlt_von,
		geprueft_von: row.geprueft_von,
		bemerkung: row.bemerkung,
		wechselgeld_cent: Number(row.wechselgeld_cent),
		kartenzahlung_cent: Number(row.kartenzahlung_cent ?? 0),
		gezaehlt_cent: Number(row.gezaehlt_cent),
		ausgaben_cent: Number(row.ausgaben_cent),
		bestand_cent: Number(row.bestand_cent),
		tageseinnahmen_cent: Number(row.tageseinnahmen_cent),
		umsatz_ust_basis:
			row.umsatz_ust_basis === "pre_card" ? "pre_card" : "post_card",
		pdf_s3_key: row.pdf_s3_key ?? null,
		pdf_sha256: row.pdf_sha256 ?? null,
		storniert_am: row.storniert_am ?? null,
		storno_grund: row.storno_grund ?? null,
		storno_pdf_s3_key: row.storno_pdf_s3_key ?? null,
		storno_pdf_sha256: row.storno_pdf_sha256 ?? null,
		counts,
	};
}

function pdfKey(belegnummer: string, suffix: "" | "_STORNO"): string {
	return `${S3_PREFIX}/${belegnummer}${suffix}_${formatFilenameStamp(new Date())}.pdf`;
}

export async function listProtokolle(opts: {
	includeStorniert: boolean;
}): Promise<ProtokollRow[]> {
	const order = [desc(protokolle.anlass_datum), desc(protokolle.erstellt_am)];
	const rows = opts.includeStorniert
		? await db
				.select()
				.from(protokolle)
				.orderBy(...order)
		: await db
				.select()
				.from(protokolle)
				.where(isNull(protokolle.storniert_am))
				.orderBy(...order);
	return rows.map(rowToProtokoll);
}

export async function getProtokoll(
	id: string,
): Promise<ProtokollDetail | null> {
	const protoRows = await db
		.select()
		.from(protokolle)
		.where(eq(protokolle.id, id))
		.limit(1);
	if (protoRows.length === 0) return null;

	const ausgabenRows = await db
		.select({
			id: ausgaben.id,
			bezeichnung: ausgaben.bezeichnung,
			empfaenger: ausgaben.empfaenger,
			beleg_nr: ausgaben.beleg_nr,
			betrag_cent: ausgaben.betrag_cent,
			ust_basis_punkte: ausgaben.ust_basis_punkte,
			reihenfolge: ausgaben.reihenfolge,
		})
		.from(ausgaben)
		.where(eq(ausgaben.protokoll_id, id))
		.orderBy(asc(ausgaben.reihenfolge), asc(ausgaben.id));

	const umsatzRows = await db
		.select({
			id: protokollUmsatzUst.id,
			ust_basis_punkte: protokollUmsatzUst.ust_basis_punkte,
			betrag_cent: protokollUmsatzUst.betrag_cent,
			reihenfolge: protokollUmsatzUst.reihenfolge,
		})
		.from(protokollUmsatzUst)
		.where(eq(protokollUmsatzUst.protokoll_id, id))
		.orderBy(asc(protokollUmsatzUst.reihenfolge), asc(protokollUmsatzUst.id));

	return {
		protokoll: rowToProtokoll(protoRows[0]),
		ausgaben: ausgabenRows.map(
			(a): AusgabeRow => ({
				...a,
				betrag_cent: Number(a.betrag_cent),
				ust_basis_punkte: Number(a.ust_basis_punkte ?? 0),
			}),
		),
		umsatzUst: umsatzRows.map(
			(u): UmsatzUstRow => ({
				...u,
				betrag_cent: Number(u.betrag_cent),
				ust_basis_punkte: Number(u.ust_basis_punkte ?? 0),
			}),
		),
	};
}

export type CreateResult = { id: string; belegnummer: string };

export async function createProtokoll(
	input: CreateProtokollInput,
): Promise<CreateResult> {
	const counts = {} as DenominationCounts;
	let gezaehlt_cent = 0;
	for (const d of DENOMINATIONS) {
		const value = (input as unknown as Record<string, number>)[d.key] ?? 0;
		counts[d.key] = value;
		gezaehlt_cent += value * d.cent;
	}
	const ausgaben_cent = input.ausgaben.reduce((s, a) => s + a.betrag_cent, 0);
	const bestand_cent = gezaehlt_cent + ausgaben_cent;
	const tageseinnahmen_cent = bestand_cent - input.wechselgeld_cent;
	const tageseinnahmen_gesamt_cent =
		tageseinnahmen_cent + input.kartenzahlung_cent;
	const umsatz_basis_cent =
		input.umsatz_ust_basis === "pre_card"
			? tageseinnahmen_cent
			: tageseinnahmen_gesamt_cent;

	if (input.umsatz_ust.length > 0) {
		const sum = input.umsatz_ust.reduce((s, u) => s + u.betrag_cent, 0);
		if (sum !== umsatz_basis_cent) {
			const basisLabel =
				input.umsatz_ust_basis === "pre_card"
					? "Tageseinnahmen (ohne Kartenzahlung)"
					: "Tageseinnahmen (inkl. Kartenzahlung)";
			throw new Error(
				`Summe der USt.-Aufteilung des Umsatzes muss den ${basisLabel} entsprechen`,
			);
		}
	}

	const year = currentYearBerlin();
	const customBelegnummer = input.belegnummer?.trim() || null;
	const maxRetries = customBelegnummer ? 1 : 3;
	let attempt = 0;
	let created: { id: string; belegnummer: string; erstellt_am: Date } | null =
		null;

	while (attempt < maxRetries) {
		attempt++;
		try {
			created = await db.transaction(async (tx) => {
				const belegnummer =
					customBelegnummer ?? (await nextBelegnummerInTx(tx, year));
				const protoRows = await tx
					.insert(protokolle)
					.values({
						belegnummer,
						anlass_datum: input.anlass_datum,
						kassennummer: input.kassennummer,
						kassenbezeichnung: input.kassenbezeichnung,
						anlass: input.anlass,
						gezaehlt_von: input.gezaehlt_von,
						geprueft_von: input.geprueft_von,
						bemerkung: input.bemerkung,
						wechselgeld_cent: input.wechselgeld_cent,
						kartenzahlung_cent: input.kartenzahlung_cent,
						gezaehlt_cent,
						ausgaben_cent,
						bestand_cent,
						tageseinnahmen_cent,
						umsatz_ust_basis: input.umsatz_ust_basis,
						...counts,
					})
					.returning({
						id: protokolle.id,
						belegnummer: protokolle.belegnummer,
						erstellt_am: protokolle.erstellt_am,
					});
				const proto = protoRows[0];
				if (input.ausgaben.length > 0) {
					await tx.insert(ausgaben).values(
						input.ausgaben.map((a, i) => ({
							protokoll_id: proto.id,
							bezeichnung: a.bezeichnung,
							empfaenger: a.empfaenger,
							beleg_nr: a.beleg_nr,
							betrag_cent: a.betrag_cent,
							ust_basis_punkte: a.ust_basis_punkte,
							reihenfolge: i,
						})),
					);
				}
				if (input.umsatz_ust.length > 0) {
					await tx.insert(protokollUmsatzUst).values(
						input.umsatz_ust.map((u, i) => ({
							protokoll_id: proto.id,
							ust_basis_punkte: u.ust_basis_punkte,
							betrag_cent: u.betrag_cent,
							reihenfolge: i,
						})),
					);
				}
				return proto;
			});
			break;
		} catch (e) {
			const code = (e as { code?: string }).code;
			if (code === "23505") {
				if (customBelegnummer) throw new Error("Belegnummer bereits vergeben");
				if (attempt < maxRetries) continue;
			}
			throw e;
		}
	}

	if (!created) {
		throw new Error("Konnte Belegnummer nicht eindeutig vergeben");
	}

	// The protokoll now exists. PDF render + S3 upload may fail; if they do we
	// still return success so the user does not retry and create a duplicate.
	// The detail page surfaces a missing PDF and offers a regenerate button.
	try {
		const { buffer, hash } = await renderProtokollPdf({
			vereinsname: getBranding().vereinsname,
			belegnummer: created.belegnummer,
			erstellt_am: created.erstellt_am,
			anlass_datum: new Date(input.anlass_datum),
			kassennummer: input.kassennummer,
			kassenbezeichnung: input.kassenbezeichnung,
			anlass: input.anlass,
			gezaehlt_von: input.gezaehlt_von,
			geprueft_von: input.geprueft_von,
			bemerkung: input.bemerkung,
			counts,
			wechselgeld_cent: input.wechselgeld_cent,
			kartenzahlung_cent: input.kartenzahlung_cent,
			gezaehlt_cent,
			ausgaben_cent,
			bestand_cent,
			tageseinnahmen_cent,
			ausgaben: input.ausgaben,
			umsatz_ust: input.umsatz_ust,
			umsatz_ust_basis: input.umsatz_ust_basis,
		});
		const key = pdfKey(created.belegnummer, "");
		await uploadPdf(key, buffer);
		await db
			.update(protokolle)
			.set({ pdf_s3_key: key, pdf_sha256: hash })
			.where(eq(protokolle.id, created.id));
	} catch (pdfErr) {
		logger.error("PDF-Erzeugung fehlgeschlagen", {
			belegnummer: created.belegnummer,
			err: pdfErr,
		});
	}

	return { id: created.id, belegnummer: created.belegnummer };
}

function pdfDataFromDetail(detail: ProtokollDetail) {
	const { protokoll, ausgaben: ausg, umsatzUst } = detail;
	return {
		vereinsname: getBranding().vereinsname,
		belegnummer: protokoll.belegnummer,
		erstellt_am: protokoll.erstellt_am,
		anlass_datum: new Date(protokoll.anlass_datum),
		kassennummer: protokoll.kassennummer,
		kassenbezeichnung: protokoll.kassenbezeichnung,
		anlass: protokoll.anlass,
		gezaehlt_von: protokoll.gezaehlt_von,
		geprueft_von: protokoll.geprueft_von,
		bemerkung: protokoll.bemerkung,
		counts: protokoll.counts,
		wechselgeld_cent: protokoll.wechselgeld_cent,
		kartenzahlung_cent: protokoll.kartenzahlung_cent,
		gezaehlt_cent: protokoll.gezaehlt_cent,
		ausgaben_cent: protokoll.ausgaben_cent,
		bestand_cent: protokoll.bestand_cent,
		tageseinnahmen_cent: protokoll.tageseinnahmen_cent,
		ausgaben: ausg,
		umsatz_ust: umsatzUst,
		umsatz_ust_basis: protokoll.umsatz_ust_basis,
	};
}

export async function stornoProtokoll(
	id: string,
	input: StornoInput,
): Promise<void> {
	const detail = await getProtokoll(id);
	if (!detail) throw new Error("Protokoll nicht gefunden");
	if (detail.protokoll.storniert_am) {
		throw new Error("Protokoll ist bereits storniert");
	}
	const stornoAm = new Date();
	const { buffer, hash } = await renderProtokollPdf({
		...pdfDataFromDetail(detail),
		storno: { am: stornoAm, grund: input.storno_grund },
	});
	const key = pdfKey(detail.protokoll.belegnummer, "_STORNO");
	await uploadPdf(key, buffer);

	await db
		.update(protokolle)
		.set({
			storniert_am: stornoAm,
			storno_grund: input.storno_grund,
			storno_pdf_s3_key: key,
			storno_pdf_sha256: hash,
		})
		.where(eq(protokolle.id, id));
}

export async function deleteAllPdfsForProtokoll(
	protokoll: ProtokollRow,
): Promise<void> {
	if (protokoll.pdf_s3_key) {
		await deletePdf(protokoll.pdf_s3_key).catch(() => {});
	}
	if (protokoll.storno_pdf_s3_key) {
		await deletePdf(protokoll.storno_pdf_s3_key).catch(() => {});
	}
}

export async function regenerateProtokollPdf(id: string): Promise<void> {
	const detail = await getProtokoll(id);
	if (!detail) throw new Error("Protokoll nicht gefunden");
	const { protokoll } = detail;
	const baseData = pdfDataFromDetail(detail);

	const main = await renderProtokollPdf(baseData);
	const mainKey = pdfKey(protokoll.belegnummer, "");
	await uploadPdf(mainKey, main.buffer);

	let stornoKey: string | null = null;
	let stornoHash: string | null = null;
	if (protokoll.storniert_am) {
		const storno = await renderProtokollPdf({
			...baseData,
			storno: {
				am: protokoll.storniert_am,
				grund: protokoll.storno_grund ?? "",
			},
		});
		stornoKey = pdfKey(protokoll.belegnummer, "_STORNO");
		stornoHash = storno.hash;
		await uploadPdf(stornoKey, storno.buffer);
	}

	await db
		.update(protokolle)
		.set({
			pdf_s3_key: mainKey,
			pdf_sha256: main.hash,
			storno_pdf_s3_key: stornoKey ?? protokoll.storno_pdf_s3_key,
			storno_pdf_sha256: stornoHash ?? protokoll.storno_pdf_sha256,
		})
		.where(eq(protokolle.id, id));

	if (protokoll.pdf_s3_key && protokoll.pdf_s3_key !== mainKey) {
		await deletePdf(protokoll.pdf_s3_key).catch(() => {});
	}
	if (
		stornoKey &&
		protokoll.storno_pdf_s3_key &&
		protokoll.storno_pdf_s3_key !== stornoKey
	) {
		await deletePdf(protokoll.storno_pdf_s3_key).catch(() => {});
	}
}
