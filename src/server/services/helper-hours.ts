import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
	HELPER_HOUR_BUDGET_CATEGORIES,
	type HelperHourBudgetCategory,
} from "@/lib/helper-hours";
import type {
	HelperHourCreateInput,
	HelperHourExpenseCreateInput,
} from "@/lib/schemas";
import { db } from "@/server/db";
import { helperHourExpenses, helperHours } from "@/server/db/schema";
import type { AuthUser } from "@/server/orpc/base";
import {
	type RecordAuditInput,
	recordAuditEventStrict,
} from "@/server/services/audit";
import type { HelperHoursImportRow } from "@/server/services/helper-hours-import";
import { getHelperHourValueCent } from "@/server/services/settings";

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
	const valueCent = await getHelperHourValueCent();
	const [items, summary, allocation, spent, expenses] = await Promise.all([
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
		db
			.select({
				gesamtverein: sql<number>`coalesce(sum(${helperHours.gesamtverein_minuten}), 0)`,
				fussball: sql<number>`coalesce(sum(${helperHours.fussball_minuten}), 0)`,
				korbball: sql<number>`coalesce(sum(${helperHours.korbball_minuten}), 0)`,
				tischtennis: sql<number>`coalesce(sum(${helperHours.tischtennis_minuten}), 0)`,
				darts: sql<number>`coalesce(sum(${helperHours.darts_minuten}), 0)`,
				gymnastik: sql<number>`coalesce(sum(${helperHours.gymnastik_minuten}), 0)`,
				senioren: sql<number>`coalesce(sum(${helperHours.senioren_minuten}), 0)`,
				combo: sql<number>`coalesce(sum(${helperHours.combo_minuten}), 0)`,
				gesamtvereinCent: sql<number>`coalesce(sum(round(${helperHours.gesamtverein_minuten} * ${valueCent} / 60.0)), 0)`,
				fussballCent: sql<number>`coalesce(sum(round(${helperHours.fussball_minuten} * ${valueCent} / 60.0)), 0)`,
				korbballCent: sql<number>`coalesce(sum(round(${helperHours.korbball_minuten} * ${valueCent} / 60.0)), 0)`,
				tischtennisCent: sql<number>`coalesce(sum(round(${helperHours.tischtennis_minuten} * ${valueCent} / 60.0)), 0)`,
				dartsCent: sql<number>`coalesce(sum(round(${helperHours.darts_minuten} * ${valueCent} / 60.0)), 0)`,
				gymnastikCent: sql<number>`coalesce(sum(round(${helperHours.gymnastik_minuten} * ${valueCent} / 60.0)), 0)`,
				seniorenCent: sql<number>`coalesce(sum(round(${helperHours.senioren_minuten} * ${valueCent} / 60.0)), 0)`,
				comboCent: sql<number>`coalesce(sum(round(${helperHours.combo_minuten} * ${valueCent} / 60.0)), 0)`,
			})
			.from(helperHours),
		db
			.select({
				abteilung: helperHourExpenses.abteilung,
				cent: sql<number>`coalesce(sum(${helperHourExpenses.betrag_cent}), 0)`,
			})
			.from(helperHourExpenses)
			.where(isNull(helperHourExpenses.storniert_am))
			.groupBy(helperHourExpenses.abteilung),
		db
			.select()
			.from(helperHourExpenses)
			.orderBy(
				desc(helperHourExpenses.datum),
				desc(helperHourExpenses.erstellt_am),
			)
			.limit(500),
	]);
	const allocationRow = allocation[0];
	const spentByDepartment = new Map(
		spent.map((entry) => [entry.abteilung, Number(entry.cent)]),
	);
	const budgets = HELPER_HOUR_BUDGET_CATEGORIES.map((category) => {
		const minutes = Number(allocationRow?.[category.code] ?? 0);
		const earnedCent = Number(
			allocationRow?.[`${category.code}Cent` as keyof typeof allocationRow] ??
				0,
		);
		const spentCent = spentByDepartment.get(category.code) ?? 0;
		return {
			...category,
			minutes,
			earnedCent,
			spentCent,
			balanceCent: earnedCent - spentCent,
		};
	});
	const contribution = {
		code: "gesamtverein" as const,
		label: "Vereinsbeitrag",
		minutes: Number(allocationRow?.gesamtverein ?? 0),
		earnedCent: Number(allocationRow?.gesamtvereinCent ?? 0),
	};
	return {
		items,
		expenses,
		budgets,
		contribution,
		valueCent,
		summary: {
			entries: Number(summary[0]?.entries ?? 0),
			helpers: Number(summary[0]?.helpers ?? 0),
			minutes: Number(summary[0]?.minutes ?? 0),
		},
	};
}

export async function createHelperHourExpense(
	input: HelperHourExpenseCreateInput,
	actor: AuthUser,
	audit: Pick<RecordAuditInput, "request">,
) {
	return db.transaction(async (tx) => {
		const [row] = await tx
			.insert(helperHourExpenses)
			.values({
				idempotency_key: input.idempotency_key,
				abteilung: input.abteilung,
				datum: input.datum,
				bezeichnung: input.bezeichnung,
				betrag_cent: input.betrag_cent,
				bemerkung: input.bemerkung,
				erstellt_von_user_id: actor.id,
				erstellt_von_name: actor.name,
			})
			.onConflictDoNothing({ target: helperHourExpenses.idempotency_key })
			.returning();
		if (!row) {
			const [existing] = await tx
				.select()
				.from(helperHourExpenses)
				.where(eq(helperHourExpenses.idempotency_key, input.idempotency_key))
				.limit(1);
			if (!existing) throw new Error("Ausgabe konnte nicht gespeichert werden");
			if (
				existing.abteilung !== input.abteilung ||
				existing.datum !== input.datum ||
				existing.bezeichnung !== input.bezeichnung ||
				existing.betrag_cent !== input.betrag_cent ||
				existing.bemerkung !== input.bemerkung
			) {
				throw new Error(
					"Diese Ausgabe wurde bereits mit anderen Angaben gespeichert",
				);
			}
			return existing;
		}
		await recordAuditEventStrict(tx, {
			category: "helferstunden",
			action: "helferstunden.expense_created",
			actor,
			request: audit.request,
			subject: {
				type: "helferstunden_ausgabe",
				id: row.id,
				label: row.bezeichnung,
			},
			metadata: {
				abteilung: row.abteilung,
				datum: row.datum,
				betrag_cent: row.betrag_cent,
			},
		});
		return row;
	});
}

export async function cancelHelperHourExpense(
	id: string,
	reason: string,
	actor: AuthUser,
	audit: Pick<RecordAuditInput, "request">,
) {
	return db.transaction(async (tx) => {
		const [row] = await tx
			.update(helperHourExpenses)
			.set({
				storniert_am: new Date(),
				storno_grund: reason,
				storniert_von_user_id: actor.id,
				storniert_von_name: actor.name,
			})
			.where(
				and(
					eq(helperHourExpenses.id, id),
					isNull(helperHourExpenses.storniert_am),
				),
			)
			.returning();
		if (!row) {
			const [existing] = await tx
				.select({ id: helperHourExpenses.id })
				.from(helperHourExpenses)
				.where(eq(helperHourExpenses.id, id))
				.limit(1);
			throw new Error(
				existing ? "Ausgabe wurde bereits storniert" : "Ausgabe nicht gefunden",
			);
		}
		await recordAuditEventStrict(tx, {
			category: "helferstunden",
			action: "helferstunden.expense_cancelled",
			actor,
			request: audit.request,
			subject: {
				type: "helferstunden_ausgabe",
				id: row.id,
				label: row.bezeichnung,
			},
			metadata: {
				abteilung: row.abteilung,
				betrag_cent: row.betrag_cent,
				grund: reason,
			},
		});
		return row;
	});
}

export async function loadHelperHourExport(category: HelperHourBudgetCategory) {
	const [dashboard, hours, expenses] = await Promise.all([
		listHelperHours(),
		db
			.select()
			.from(helperHours)
			.where(sql`${helperHours[CATEGORY_COLUMNS[category]]} > 0`)
			.orderBy(helperHours.datum, helperHours.nachname, helperHours.vorname),
		db
			.select()
			.from(helperHourExpenses)
			.where(eq(helperHourExpenses.abteilung, category))
			.orderBy(helperHourExpenses.datum, helperHourExpenses.erstellt_am),
	]);
	const budget = dashboard.budgets.find((entry) => entry.code === category);
	if (!budget) throw new Error("Abteilung nicht gefunden");
	return {
		category,
		budget,
		valueCent: dashboard.valueCent,
		hours: hours.map((row) => ({
			...row,
			allocatedMinutes: row[CATEGORY_COLUMNS[category]],
		})),
		expenses,
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
	review: { corrected: number; accepted: number } = {
		corrected: 0,
		accepted: 0,
	},
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
					import_originalwerte: row.originalValues,
					import_korrektur: row.correction,
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
			metadata: {
				erstellt: created,
				zeilen: rows.length,
				korrigierte_zeilen: review.corrected,
				bewusst_uebernommene_hinweise: review.accepted,
			},
		});
		return { created, skipped: rows.length - created };
	});
}
