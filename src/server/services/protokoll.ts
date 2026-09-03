import { createHash } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
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
import { umsatzbereichLabel } from "@/lib/umsatzbereich";
import { db } from "@/server/db";
import {
	anlassKatalog,
	ausgaben,
	protokolle,
	protokollUmsatzUst,
} from "@/server/db/schema";
import { logger } from "@/server/logger";
import {
	type RecordAuditInput,
	recordAuditEventStrict,
} from "@/server/services/audit";
import { nextBelegnummerInTx } from "@/server/services/belegnummer";
import { sendProtokollNotification } from "@/server/services/email";
import { renderProtokollPdf } from "@/server/services/pdf";
import { deletePdf, uploadPdf } from "@/server/services/s3";
import { getVereinStammdaten } from "@/server/services/settings";

type DbProtokoll = typeof protokolle.$inferSelect;
type AuditActor = {
	id: string;
	name: string;
	email: string;
	role?: string | null;
};
const POSTGRES_INTEGER_MAX = 2_147_483_647;
const POSTGRES_INTEGER_MIN = -2_147_483_648;

function actorName(actor: AuditActor): string {
	return actor.name.trim() || actor.email;
}

function rowToProtokoll(row: DbProtokoll): ProtokollRow {
	const counts = {} as DenominationCounts;
	for (const d of DENOMINATIONS) {
		counts[d.key] = Number((row as Record<string, unknown>)[d.key] ?? 0);
	}
	return {
		id: row.id,
		belegnummer: row.belegnummer,
		erstellt_von_user_id: row.erstellt_von_user_id ?? null,
		erstellt_von_name: row.erstellt_von_name ?? null,
		erstellt_am: row.erstellt_am,
		anlass_datum: row.anlass_datum,
		kassennummer: row.kassennummer ?? "",
		kassenbezeichnung: row.kassenbezeichnung ?? "",
		anlass: row.anlass,
		umsatzbereich: row.umsatzbereich as ProtokollRow["umsatzbereich"],
		anlass_katalog_id: row.anlass_katalog_id,
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
		storniert_von_user_id: row.storniert_von_user_id ?? null,
		storniert_von_name: row.storniert_von_name ?? null,
		storno_grund: row.storno_grund ?? null,
		storno_pdf_s3_key: row.storno_pdf_s3_key ?? null,
		storno_pdf_sha256: row.storno_pdf_sha256 ?? null,
		counts,
	};
}

function pdfKey(belegnummer: string, suffix: "" | "_STORNO"): string {
	return `${S3_PREFIX}/${belegnummer}${suffix}_${formatFilenameStamp(new Date())}_${crypto.randomUUID()}.pdf`;
}

// Only the columns rowToProtokoll actually maps. `select()` pulled all 46,
// including the stueckelung / umsatz_ust / import_warnungen jsonb blobs and both
// actor emails, which this function then discarded - transfer that grew with the
// row count on an endpoint the dashboard polls every 15 seconds.
const PROTOKOLL_LIST_COLUMNS = {
	id: protokolle.id,
	belegnummer: protokolle.belegnummer,
	erstellt_von_user_id: protokolle.erstellt_von_user_id,
	erstellt_von_name: protokolle.erstellt_von_name,
	erstellt_am: protokolle.erstellt_am,
	anlass_datum: protokolle.anlass_datum,
	kassennummer: protokolle.kassennummer,
	kassenbezeichnung: protokolle.kassenbezeichnung,
	anlass: protokolle.anlass,
	umsatzbereich: protokolle.umsatzbereich,
	anlass_katalog_id: protokolle.anlass_katalog_id,
	gezaehlt_von: protokolle.gezaehlt_von,
	geprueft_von: protokolle.geprueft_von,
	bemerkung: protokolle.bemerkung,
	wechselgeld_cent: protokolle.wechselgeld_cent,
	kartenzahlung_cent: protokolle.kartenzahlung_cent,
	gezaehlt_cent: protokolle.gezaehlt_cent,
	ausgaben_cent: protokolle.ausgaben_cent,
	bestand_cent: protokolle.bestand_cent,
	tageseinnahmen_cent: protokolle.tageseinnahmen_cent,
	umsatz_ust_basis: protokolle.umsatz_ust_basis,
	pdf_s3_key: protokolle.pdf_s3_key,
	pdf_sha256: protokolle.pdf_sha256,
	storniert_am: protokolle.storniert_am,
	storniert_von_user_id: protokolle.storniert_von_user_id,
	storniert_von_name: protokolle.storniert_von_name,
	storno_grund: protokolle.storno_grund,
	storno_pdf_s3_key: protokolle.storno_pdf_s3_key,
	storno_pdf_sha256: protokolle.storno_pdf_sha256,
	// The denominations feed ProtokollRow.counts, which detail views read.
	...Object.fromEntries(
		DENOMINATIONS.map((d) => [
			d.key,
			(protokolle as unknown as Record<string, unknown>)[d.key],
		]),
	),
} as const;

export async function listProtokolle(opts: {
	includeStorniert: boolean;
}): Promise<ProtokollRow[]> {
	const order = [desc(protokolle.anlass_datum), desc(protokolle.erstellt_am)];
	const rows = opts.includeStorniert
		? await db
				.select(PROTOKOLL_LIST_COLUMNS)
				.from(protokolle)
				.orderBy(...order)
		: await db
				.select(PROTOKOLL_LIST_COLUMNS)
				.from(protokolle)
				.where(isNull(protokolle.storniert_am))
				.orderBy(...order);
	return rows.map((row) => rowToProtokoll(row as DbProtokoll));
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

export type CreateResult = {
	id: string;
	belegnummer: string;
	anlass: string;
	created: boolean;
};

export class ProtokollIdempotencyConflictError extends Error {
	constructor() {
		super("Idempotenzschlüssel wurde bereits für andere Daten verwendet");
		this.name = "ProtokollIdempotencyConflictError";
	}
}

export function protokollIdempotencyPayloadHash(
	input: CreateProtokollInput,
	actor: AuditActor,
): string {
	return createHash("sha256")
		.update(JSON.stringify({ actor_id: actor.id, input }))
		.digest("hex");
}

export function deriveProtokollAccounting(input: CreateProtokollInput): {
	counts: DenominationCounts;
	gezaehlt_cent: number;
	ausgaben_cent: number;
	bestand_cent: number;
	tageseinnahmen_cent: number;
	umsatz_basis_cent: number;
} {
	const counts = {} as DenominationCounts;
	let gezaehlt_cent = 0;
	for (const d of DENOMINATIONS) {
		const value = (input as unknown as Record<string, number>)[d.key] ?? 0;
		if (!Number.isSafeInteger(value) || value > POSTGRES_INTEGER_MAX) {
			throw new Error(
				"Betrag oder Stückzahl überschreitet den zulässigen Bereich",
			);
		}
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

	const storedAmounts = [
		input.wechselgeld_cent,
		input.kartenzahlung_cent,
		gezaehlt_cent,
		ausgaben_cent,
		bestand_cent,
		tageseinnahmen_cent,
		...input.ausgaben.map((item) => item.betrag_cent),
		...input.umsatz_ust.map((item) => item.betrag_cent),
	];
	if (
		storedAmounts.some(
			(value) =>
				!Number.isSafeInteger(value) ||
				value < POSTGRES_INTEGER_MIN ||
				value > POSTGRES_INTEGER_MAX,
		)
	) {
		throw new Error(
			"Betrag oder Stückzahl überschreitet den zulässigen Bereich",
		);
	}

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

	return {
		counts,
		gezaehlt_cent,
		ausgaben_cent,
		bestand_cent,
		tageseinnahmen_cent,
		umsatz_basis_cent,
	};
}

export async function createProtokoll(
	input: CreateProtokollInput,
	actor: AuditActor,
	audit: Omit<RecordAuditInput, "category" | "action" | "actor" | "subject">,
): Promise<CreateResult> {
	const {
		counts,
		gezaehlt_cent,
		ausgaben_cent,
		bestand_cent,
		tageseinnahmen_cent,
	} = deriveProtokollAccounting(input);

	const year = currentYearBerlin();
	const customBelegnummer = input.belegnummer?.trim() || null;
	const payloadHash = protokollIdempotencyPayloadHash(input, actor);
	const maxRetries = customBelegnummer ? 1 : 3;
	let attempt = 0;
	let created: {
		id: string;
		belegnummer: string;
		erstellt_am: Date;
		anlass: string;
		created: boolean;
	} | null = null;

	while (attempt < maxRetries) {
		attempt++;
		try {
			created = await db.transaction(async (tx) => {
				await tx.execute(
					sql`select pg_advisory_xact_lock(hashtextextended(${input.idempotency_key}, 0))`,
				);
				const [replayed] = await tx
					.select({
						id: protokolle.id,
						belegnummer: protokolle.belegnummer,
						erstellt_am: protokolle.erstellt_am,
						anlass: protokolle.anlass,
						payloadHash: protokolle.idempotency_payload_sha256,
					})
					.from(protokolle)
					.where(eq(protokolle.idempotency_key, input.idempotency_key))
					.limit(1);
				if (replayed) {
					if (replayed.payloadHash !== payloadHash) {
						throw new ProtokollIdempotencyConflictError();
					}
					return {
						id: replayed.id,
						belegnummer: replayed.belegnummer,
						erstellt_am: replayed.erstellt_am,
						anlass: replayed.anlass,
						created: false,
					};
				}
				let anlass = `${umsatzbereichLabel(input.umsatzbereich)} · ${input.veranstaltungsbezeichnung}`;
				if (input.anlass_katalog_id) {
					const [umsatzgruppe] = await tx
						.select({ name: anlassKatalog.name })
						.from(anlassKatalog)
						.where(eq(anlassKatalog.id, input.anlass_katalog_id))
						.limit(1)
						.for("key share");
					if (!umsatzgruppe) {
						throw new Error("Umsatzgruppe wurde nicht gefunden");
					}
					anlass = `${umsatzgruppe.name} · ${input.veranstaltungsbezeichnung}`;
				}
				if (anlass.length > 200) {
					throw new Error(
						"Veranstaltungsbezeichnung ist zusammen mit der Umsatzgruppe zu lang",
					);
				}
				const belegnummer =
					customBelegnummer ?? (await nextBelegnummerInTx(tx, year));
				const protoRows = await tx
					.insert(protokolle)
					.values({
						idempotency_key: input.idempotency_key,
						idempotency_payload_sha256: payloadHash,
						belegnummer,
						erstellt_von_user_id: actor.id,
						erstellt_von_name: actorName(actor),
						anlass_datum: input.anlass_datum,
						kassennummer: input.kassennummer,
						kassenbezeichnung: input.kassenbezeichnung,
						anlass,
						umsatzbereich: input.umsatzbereich,
						anlass_katalog_id: input.anlass_katalog_id ?? null,
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
						anlass: protokolle.anlass,
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
				await recordAuditEventStrict(tx, {
					...audit,
					category: "protokolle",
					action: "protokolle.created",
					actor: { ...actor, role: actor.role ?? "user" },
					subject: {
						type: "protokoll",
						id: proto.id,
						label: proto.belegnummer,
					},
					metadata: {
						...audit.metadata,
						anlass: proto.anlass,
						anlass_datum: input.anlass_datum,
						kassennummer: input.kassennummer,
					},
				});
				return { ...proto, created: true };
			});
			break;
		} catch (e) {
			const code = (e as { code?: string }).code;
			if (code === "23505") {
				if (customBelegnummer) throw new Error("Belegnummer bereits vergeben");
				if (attempt < maxRetries) continue;
				// Out of retries: surface the mapped conflict instead of letting a raw
				// Postgres error reach the client as an unexplained 500.
				throw new Error("Belegnummer bereits vergeben");
			}
			throw e;
		}
	}

	if (!created) {
		throw new Error("Konnte Belegnummer nicht eindeutig vergeben");
	}
	if (!created.created) {
		return {
			id: created.id,
			belegnummer: created.belegnummer,
			anlass: created.anlass,
			created: false,
		};
	}

	// The protokoll now exists. PDF render + S3 upload may fail; if they do we
	// still return success so the user does not retry and create a duplicate.
	// The detail page surfaces a missing PDF and offers a regenerate button.
	try {
		const verein = await getVereinStammdaten();
		const { buffer, hash } = await renderProtokollPdf({
			vereinsname: verein.name,
			verein,
			belegnummer: created.belegnummer,
			erstellt_am: created.erstellt_am,
			anlass_datum: new Date(input.anlass_datum),
			kassennummer: input.kassennummer,
			kassenbezeichnung: input.kassenbezeichnung,
			anlass: created.anlass,
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

	// FYI notification to the configured recipients. Best effort: never throws,
	// so a mail problem cannot affect the created protokoll.
	await sendProtokollNotification({
		id: created.id,
		belegnummer: created.belegnummer,
		anlass: created.anlass,
		anlass_datum: input.anlass_datum,
		kassenbezeichnung: input.kassenbezeichnung,
		gezaehlt_von: input.gezaehlt_von,
	});

	return {
		id: created.id,
		belegnummer: created.belegnummer,
		anlass: created.anlass,
		created: true,
	};
}

async function pdfDataFromDetail(detail: ProtokollDetail) {
	const { protokoll, ausgaben: ausg, umsatzUst } = detail;
	const verein = await getVereinStammdaten();
	return {
		vereinsname: verein.name,
		verein,
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
	actor: AuditActor,
	audit: Omit<RecordAuditInput, "category" | "action" | "actor" | "subject">,
): Promise<void> {
	const detail = await getProtokoll(id);
	if (!detail) throw new Error("Protokoll nicht gefunden");
	if (detail.protokoll.storniert_am) {
		throw new Error("Protokoll ist bereits storniert");
	}
	const stornoAm = new Date();
	const claimed = await db.transaction(async (tx) => {
		const rows = await tx
			.update(protokolle)
			.set({
				storniert_am: stornoAm,
				storniert_von_user_id: actor.id,
				storniert_von_name: actorName(actor),
				storno_grund: input.storno_grund,
			})
			.where(and(eq(protokolle.id, id), isNull(protokolle.storniert_am)))
			.returning({ id: protokolle.id });
		if (rows.length > 0) {
			await recordAuditEventStrict(tx, {
				...audit,
				category: "protokolle",
				action: "protokolle.cancelled",
				actor: { ...actor, role: actor.role ?? "user" },
				subject: {
					type: "protokoll",
					id,
					label: detail.protokoll.belegnummer,
				},
				metadata: { ...audit.metadata, grund: input.storno_grund },
			});
		}
		return rows;
	});

	if (claimed.length === 0) {
		throw new Error("Protokoll ist bereits storniert");
	}

	// Cancellation is the authoritative event. PDF generation is recoverable,
	// so a storage outage must not invite a second cancellation attempt.
	try {
		const { buffer, hash } = await renderProtokollPdf({
			...(await pdfDataFromDetail(detail)),
			storno: { am: stornoAm, grund: input.storno_grund },
		});
		const key = pdfKey(detail.protokoll.belegnummer, "_STORNO");
		await uploadPdf(key, buffer);
		await db
			.update(protokolle)
			.set({ storno_pdf_s3_key: key, storno_pdf_sha256: hash })
			.where(and(eq(protokolle.id, id), eq(protokolle.storniert_am, stornoAm)));
	} catch (pdfErr) {
		logger.error("Storno-PDF-Erzeugung fehlgeschlagen", {
			belegnummer: detail.protokoll.belegnummer,
			err: pdfErr,
		});
	}
}

export async function deleteAllPdfsForProtokoll(
	protokoll: ProtokollRow,
): Promise<void> {
	if (protokoll.pdf_s3_key) {
		await deletePdfBestEffort(protokoll.pdf_s3_key, protokoll.id, "original");
	}
	if (protokoll.storno_pdf_s3_key) {
		await deletePdfBestEffort(
			protokoll.storno_pdf_s3_key,
			protokoll.id,
			"cancellation",
		);
	}
}

async function deletePdfBestEffort(
	key: string,
	protokollId: string,
	documentType: "original" | "cancellation",
): Promise<void> {
	try {
		await deletePdf(key);
	} catch (err) {
		logger.warn("Obsolete PDF cleanup failed", {
			event: "storage.pdf_cleanup.failed",
			protokollId,
			documentType,
			err,
		});
	}
}

export async function regenerateProtokollPdf(id: string): Promise<void> {
	const detail = await getProtokoll(id);
	if (!detail) throw new Error("Protokoll nicht gefunden");
	const { protokoll } = detail;
	const baseData = await pdfDataFromDetail(detail);

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

	// Conditional on the key this regeneration started from, matching how the
	// storno branch below already guards itself. Two concurrent regenerations
	// otherwise both claim the row, and the loser's uploaded object is left in S3
	// with nothing referencing it.
	const mainRows = await db
		.update(protokolle)
		.set({
			pdf_s3_key: mainKey,
			pdf_sha256: main.hash,
		})
		.where(
			and(
				eq(protokolle.id, id),
				protokoll.pdf_s3_key === null
					? isNull(protokolle.pdf_s3_key)
					: eq(protokolle.pdf_s3_key, protokoll.pdf_s3_key),
			),
		)
		.returning({ id: protokolle.id });
	if (mainRows.length === 0) {
		// Someone else regenerated first; drop the object this call uploaded rather
		// than orphaning it.
		await deletePdfBestEffort(mainKey, id, "original");
		throw new Error(
			"Das PDF wurde zwischenzeitlich neu erzeugt. Bitte die Seite neu laden.",
		);
	}

	let stornoUpdated = false;
	if (stornoKey && stornoHash && protokoll.storniert_am) {
		const rows = await db
			.update(protokolle)
			.set({
				storno_pdf_s3_key: stornoKey,
				storno_pdf_sha256: stornoHash,
			})
			.where(
				and(
					eq(protokolle.id, id),
					eq(protokolle.storniert_am, protokoll.storniert_am),
				),
			)
			.returning({ id: protokolle.id });
		stornoUpdated = rows.length > 0;
	}

	if (protokoll.pdf_s3_key && protokoll.pdf_s3_key !== mainKey) {
		await deletePdfBestEffort(protokoll.pdf_s3_key, protokoll.id, "original");
	}
	if (
		stornoUpdated &&
		stornoKey &&
		protokoll.storno_pdf_s3_key &&
		protokoll.storno_pdf_s3_key !== stornoKey
	) {
		await deletePdfBestEffort(
			protokoll.storno_pdf_s3_key,
			protokoll.id,
			"cancellation",
		);
	} else if (stornoKey && !stornoUpdated) {
		// The storno row moved on under us; the object just uploaded is unreferenced.
		await deletePdfBestEffort(stornoKey, protokoll.id, "cancellation");
	}
}
