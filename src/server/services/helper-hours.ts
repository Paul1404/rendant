import { desc, eq, sql } from "drizzle-orm";
import type { HelperHourCreateInput } from "@/lib/schemas";
import { db } from "@/server/db";
import { helperHours } from "@/server/db/schema";
import type { AuthUser } from "@/server/orpc/base";
import {
	type RecordAuditInput,
	recordAuditEventStrict,
} from "@/server/services/audit";
import type { HelperHoursImportRow } from "@/server/services/helper-hours-import";

const CATEGORY_COLUMNS = {
	gesamtverein: "gesamtverein_minuten",
	fussball: "fussball_minuten",
	korbball: "korbball_minuten",
	tischtennis: "tischtennis_minuten",
	darts: "darts_minuten",
	gymnastik: "gymnastik_minuten",
	senioren: "senioren_minuten",
	combo: "combo_minuten",
} as const;

export async function listHelperHours() {
	const [items, summary] = await Promise.all([
		db
			.select()
			.from(helperHours)
			.orderBy(desc(helperHours.datum), desc(helperHours.erstellt_am))
			.limit(250),
		db
			.select({
				entries: sql<number>`count(*)`,
				helpers: sql<number>`count(distinct nullif(lower(trim(${helperHours.nachname}) || ',' || trim(${helperHours.vorname})), ','))`,
				minutes: sql<number>`coalesce(sum(${helperHours.gemeldete_summe_minuten}), 0)`,
			})
			.from(helperHours),
	]);
	return {
		items,
		summary: {
			entries: Number(summary[0]?.entries ?? 0),
			helpers: Number(summary[0]?.helpers ?? 0),
			minutes: Number(summary[0]?.minutes ?? 0),
		},
	};
}

export async function createHelperHour(
	input: HelperHourCreateInput,
	actor: AuthUser,
	audit: Pick<RecordAuditInput, "request">,
) {
	return db.transaction(async (tx) => {
		const categoryColumn = CATEGORY_COLUMNS[input.kategorie];
		const [row] = await tx
			.insert(helperHours)
			.values({
				idempotency_key: input.idempotency_key,
				datum: input.datum,
				veranstaltung: input.veranstaltung,
				nachname: input.nachname,
				vorname: input.vorname,
				[categoryColumn]: input.minuten,
				gemeldete_summe_minuten: input.minuten,
				bemerkung: input.bemerkung,
				erstellt_von_user_id: actor.id,
				erstellt_von_name: actor.name,
			})
			.onConflictDoNothing({ target: helperHours.idempotency_key })
			.returning();
		if (!row) {
			const [existing] = await tx
				.select()
				.from(helperHours)
				.where(eq(helperHours.idempotency_key, input.idempotency_key))
				.limit(1);
			if (!existing)
				throw new Error("Helferstunde konnte nicht gespeichert werden");
			if (
				existing.datum !== input.datum ||
				existing.veranstaltung !== input.veranstaltung ||
				existing.nachname !== input.nachname ||
				existing.vorname !== input.vorname ||
				existing[categoryColumn] !== input.minuten ||
				existing.gemeldete_summe_minuten !== input.minuten ||
				existing.bemerkung !== input.bemerkung
			)
				throw new Error(
					"Diese Helferstunde wurde bereits mit anderen Angaben gespeichert",
				);
			return existing;
		}
		await recordAuditEventStrict(tx, {
			category: "helferstunden",
			action: "helferstunden.created",
			actor,
			subject: {
				type: "helferstunde",
				id: row.id,
				label: `${row.vorname} ${row.nachname}`.trim(),
			},
			request: audit.request,
			metadata: {
				datum: row.datum,
				veranstaltung: row.veranstaltung,
				minuten: row.gemeldete_summe_minuten,
				kategorie: input.kategorie,
			},
		});
		return row;
	});
}

export async function importedHelperHourRows(digest: string) {
	const rows = await db
		.select({ sheet: helperHours.quelle_blatt, row: helperHours.quelle_zeile })
		.from(helperHours)
		.where(eq(helperHours.quelle_sha256, digest));
	return new Set(rows.map((entry) => `${entry.sheet}:${entry.row}`));
}

export async function importHelperHours(
	rows: HelperHoursImportRow[],
	actor: AuthUser,
	audit: Pick<RecordAuditInput, "request" | "subject">,
) {
	return db.transaction(async (tx) => {
		let created = 0;
		for (const row of rows) {
			const inserted = await tx
				.insert(helperHours)
				.values({
					idempotency_key: row.idempotency_key,
					datum: row.datum,
					veranstaltung: row.veranstaltung,
					nachname: row.nachname,
					vorname: row.vorname,
					...row.allocations,
					gemeldete_summe_minuten: row.gemeldete_summe_minuten,
					bemerkung: row.bemerkung,
					quelle: "excel",
					quelle_datei: row.sourceFile,
					quelle_sha256: row.sourceDigest,
					quelle_blatt: row.sheet,
					quelle_zeile: row.rowNumber,
					import_warnungen: row.warnings,
					erstellt_von_user_id: actor.id,
					erstellt_von_name: actor.name,
				})
				.onConflictDoNothing({
					target: [
						helperHours.quelle_sha256,
						helperHours.quelle_blatt,
						helperHours.quelle_zeile,
					],
				})
				.returning({ id: helperHours.id });
			created += inserted.length;
		}
		await recordAuditEventStrict(tx, {
			category: "helferstunden",
			action: "helferstunden.imported",
			actor,
			request: audit.request,
			subject: audit.subject,
			metadata: { erstellt: created, zeilen: rows.length },
		});
		return { created, skipped: rows.length - created };
	});
}
