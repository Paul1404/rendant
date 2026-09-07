import {
	and,
	asc,
	desc,
	eq,
	gte,
	ilike,
	inArray,
	isNull,
	lt,
	or,
	sql,
} from "drizzle-orm";
import { minutesFromCent } from "@/lib/helper-hours";
import type {
	HelperHourCreateInput,
	HelperHourEntriesInput,
	HelperHourEntryCorrectInput,
	HelperHourExpenseCreateInput,
	HelperHourNoteRuleCreateInput,
} from "@/lib/schemas";
import { db } from "@/server/db";
import {
	helperHourAllocations,
	helperHourCategories,
	helperHourEvents,
	helperHourExpenses,
	helperHourNoteRules,
	helperHourPersons,
	helperHours,
} from "@/server/db/schema";
import type { AuthUser } from "@/server/orpc/base";
import {
	type RecordAuditInput,
	recordAuditEventStrict,
} from "@/server/services/audit";
import { catalogKey, personKey } from "@/server/services/helper-hour-catalog";
import { listHelperHourCategories } from "@/server/services/helper-hour-categories";
import type { HelperHourExpenseImportRow } from "@/server/services/helper-hour-expense-import";
import { helperHourExpenseSignature } from "@/server/services/helper-hour-expense-import";
import type { HelperHoursImportRow } from "@/server/services/helper-hours-import";
import { similarHelperNames } from "@/server/services/helper-hours-import";
import {
	getHelperHourValueCent,
	getSettingsStamp,
} from "@/server/services/settings";

const HELPER_KEY = sql<string>`lower(trim(${helperHours.vorname})) || '|' || lower(trim(${helperHours.nachname}))`;

function periodFilter(year?: number) {
	return year
		? and(
				gte(helperHours.datum, `${year}-01-01`),
				lt(helperHours.datum, `${year + 1}-01-01`),
			)
		: undefined;
}

/**
 * Rounds each purchase on its own before summing, so the department total is
 * exactly the sum of the hour figures shown next to the individual purchases.
 */
function spentMinutesExpression(valueCent: number) {
	return sql<number>`coalesce(sum(round(${helperHourExpenses.betrag_cent} * 60.0 / ${valueCent})), 0)`;
}

export async function listHelperHours(year?: number) {
	const valueCent = await getHelperHourValueCent();
	// Sent to the client so the rate form can detect a concurrent change: the
	// rate retroactively revalues every department deduction.
	const valueUpdatedAt = await getSettingsStamp("helferstunde_wert_updated_at");
	const period = periodFilter(year);
	const yearExpression = sql<number>`extract(year from ${helperHours.datum})::int`;
	const [
		categories,
		summary,
		allocationTotals,
		periodTotals,
		spent,
		expenseRows,
		years,
		helperTotals,
		helperAllocations,
	] = await Promise.all([
		listHelperHourCategories(),
		db
			.select({
				entries: sql<number>`count(*)`,
				helpers: sql<number>`count(distinct nullif(lower(trim(${helperHours.nachname}) || ',' || trim(${helperHours.vorname})), ','))`,
				minutes: sql<number>`coalesce(sum(${helperHours.gemeldete_summe_minuten}), 0)`,
			})
			.from(helperHours)
			.where(period),
		db
			.select({
				kategorie_id: helperHourAllocations.kategorie_id,
				minutes: sql<number>`coalesce(sum(${helperHourAllocations.minuten}), 0)`,
			})
			.from(helperHourAllocations)
			.groupBy(helperHourAllocations.kategorie_id),
		db
			.select({
				kategorie_id: helperHourAllocations.kategorie_id,
				minutes: sql<number>`coalesce(sum(${helperHourAllocations.minuten}), 0)`,
			})
			.from(helperHourAllocations)
			.innerJoin(
				helperHours,
				eq(helperHours.id, helperHourAllocations.helper_hour_id),
			)
			.where(period)
			.groupBy(helperHourAllocations.kategorie_id),
		db
			.select({
				kategorie_id: helperHourExpenses.kategorie_id,
				cent: sql<number>`coalesce(sum(${helperHourExpenses.betrag_cent}), 0)`,
				minutes: spentMinutesExpression(valueCent),
			})
			.from(helperHourExpenses)
			.where(isNull(helperHourExpenses.storniert_am))
			.groupBy(helperHourExpenses.kategorie_id),
		db
			.select()
			.from(helperHourExpenses)
			.orderBy(
				desc(helperHourExpenses.datum),
				desc(helperHourExpenses.erstellt_am),
			)
			.limit(500),
		db
			.select({ year: yearExpression })
			.from(helperHours)
			.groupBy(yearExpression)
			.orderBy(desc(yearExpression)),
		db
			.select({
				key: HELPER_KEY,
				vorname: sql<string>`min(trim(${helperHours.vorname}))`,
				nachname: sql<string>`min(trim(${helperHours.nachname}))`,
				entries: sql<number>`count(*)`,
				events: sql<number>`count(distinct lower(trim(${helperHours.veranstaltung})))`,
				minutes: sql<number>`coalesce(sum(${helperHours.gemeldete_summe_minuten}), 0)`,
				lastDate: sql<string>`max(${helperHours.datum})`,
			})
			.from(helperHours)
			.where(
				and(
					period,
					sql`length(trim(${helperHours.vorname} || ${helperHours.nachname})) > 0`,
				),
			)
			.groupBy(HELPER_KEY)
			.orderBy(
				desc(sql`sum(${helperHours.gemeldete_summe_minuten})`),
				sql`min(trim(${helperHours.nachname}))`,
			),
		db
			.select({
				key: HELPER_KEY,
				kategorie_id: helperHourAllocations.kategorie_id,
				minutes: sql<number>`coalesce(sum(${helperHourAllocations.minuten}), 0)`,
			})
			.from(helperHourAllocations)
			.innerJoin(
				helperHours,
				eq(helperHours.id, helperHourAllocations.helper_hour_id),
			)
			.where(
				and(
					period,
					sql`length(trim(${helperHours.vorname} || ${helperHours.nachname})) > 0`,
				),
			)
			.groupBy(HELPER_KEY, helperHourAllocations.kategorie_id),
	]);

	const categoryById = new Map(categories.map((entry) => [entry.id, entry]));
	const earnedById = new Map(
		allocationTotals.map((row) => [row.kategorie_id, Number(row.minutes)]),
	);
	const periodById = new Map(
		periodTotals.map((row) => [row.kategorie_id, Number(row.minutes)]),
	);
	const spentById = new Map(
		spent.map((row) => [
			row.kategorie_id,
			{ cent: Number(row.cent), minutes: Number(row.minutes) },
		]),
	);

	const budgets = categories
		.filter((category) => category.art === "abteilung")
		.map((category) => {
			const earnedMinutes = earnedById.get(category.id) ?? 0;
			const charged = spentById.get(category.id) ?? { cent: 0, minutes: 0 };
			return {
				id: category.id,
				code: category.code,
				label: category.label,
				aktiv: category.aktiv,
				minutes: earnedMinutes,
				earnedMinutes,
				spentMinutes: charged.minutes,
				spentCent: charged.cent,
				balanceMinutes: earnedMinutes - charged.minutes,
			};
		})
		// A retired department keeps its card as long as it still holds hours.
		.filter(
			(entry) => entry.aktiv || entry.minutes > 0 || entry.spentMinutes > 0,
		);

	const contributions = categories
		.filter((category) => category.art === "verein")
		.map((category) => ({
			id: category.id,
			code: category.code,
			label: category.label,
			minutes: earnedById.get(category.id) ?? 0,
		}));
	const contribution = contributions[0] ?? {
		id: "",
		code: "gesamtverein",
		label: "Vereinsbeitrag",
		minutes: 0,
	};

	const distribution = categories
		.map((category) => ({
			id: category.id,
			code: category.code,
			label: category.label,
			art: category.art,
			minutes: periodById.get(category.id) ?? 0,
		}))
		.filter((category) => category.minutes > 0);

	const allocationsByHelper = new Map<string, Record<string, number>>();
	for (const row of helperAllocations) {
		const category = categoryById.get(row.kategorie_id);
		if (!category) continue;
		const current = allocationsByHelper.get(row.key) ?? {};
		current[category.code] = Number(row.minutes);
		allocationsByHelper.set(row.key, current);
	}
	const helpers = helperTotals.map((helper) => ({
		vorname: helper.vorname,
		nachname: helper.nachname,
		entries: Number(helper.entries),
		events: Number(helper.events),
		minutes: Number(helper.minutes),
		lastDate: helper.lastDate,
		allocations: allocationsByHelper.get(helper.key) ?? {},
	}));

	const expenses = expenseRows.map((row) => ({
		...row,
		kategorie_code: categoryById.get(row.kategorie_id)?.code ?? "",
		kategorie_label: categoryById.get(row.kategorie_id)?.label ?? "",
		minuten: minutesFromCent(row.betrag_cent, valueCent),
	}));

	return {
		categories,
		expenses,
		budgets,
		contribution,
		contributions,
		distribution,
		helpers,
		years: years.map((entry) => Number(entry.year)),
		selectedYear: year ?? null,
		valueCent,
		valueUpdatedAt,
		summary: {
			entries: Number(summary[0]?.entries ?? 0),
			helpers: Number(summary[0]?.helpers ?? 0),
			minutes: Number(summary[0]?.minutes ?? 0),
		},
	};
}

export async function listHelperHourEntries(input: HelperHourEntriesInput) {
	const conditions = [];
	if (input.jahr) {
		conditions.push(
			gte(helperHours.datum, `${input.jahr}-01-01`),
			lt(helperHours.datum, `${input.jahr + 1}-01-01`),
		);
	}
	if (input.quelle) conditions.push(eq(helperHours.quelle, input.quelle));
	if (input.kategorie) {
		conditions.push(
			sql`exists (
				select 1 from ${helperHourAllocations}
				join ${helperHourCategories} on ${helperHourCategories.id} = ${helperHourAllocations.kategorie_id}
				where ${helperHourAllocations.helper_hour_id} = ${helperHours.id}
					and ${helperHourCategories.code} = ${input.kategorie}
			)`,
		);
	}
	if (input.query) {
		const escaped = input.query.replace(/[\\%_]/g, "\\$&");
		const pattern = `%${escaped}%`;
		const search = or(
			ilike(
				sql<string>`trim(${helperHours.vorname} || ' ' || ${helperHours.nachname})`,
				pattern,
			),
			ilike(helperHours.veranstaltung, pattern),
			ilike(helperHours.bemerkung, pattern),
			ilike(helperHours.quelle_blatt, pattern),
		);
		if (search) conditions.push(search);
	}
	const where = conditions.length ? and(...conditions) : undefined;
	const sortColumn = {
		date: helperHours.datum,
		helper: sql<string>`lower(trim(${helperHours.nachname} || ' ' || ${helperHours.vorname}))`,
		event: sql<string>`lower(${helperHours.veranstaltung})`,
		source: helperHours.quelle,
		hours: helperHours.gemeldete_summe_minuten,
	}[input.sort];
	const order = input.direction === "asc" ? asc : desc;
	const [{ total = 0 } = { total: 0 }] = await db
		.select({ total: sql<number>`count(*)` })
		.from(helperHours)
		.where(where);
	const pageCount = Math.ceil(Number(total) / input.page_size);
	const page = Math.min(input.page, Math.max(pageCount, 1));
	const items = await db
		.select()
		.from(helperHours)
		.where(where)
		.orderBy(
			order(sortColumn),
			desc(helperHours.datum),
			desc(helperHours.erstellt_am),
			desc(helperHours.id),
		)
		.limit(input.page_size)
		.offset((page - 1) * input.page_size);
	const allocations = items.length
		? await db
				.select({
					helper_hour_id: helperHourAllocations.helper_hour_id,
					code: helperHourCategories.code,
					label: helperHourCategories.label,
					minuten: helperHourAllocations.minuten,
				})
				.from(helperHourAllocations)
				.innerJoin(
					helperHourCategories,
					eq(helperHourCategories.id, helperHourAllocations.kategorie_id),
				)
				.where(
					inArray(
						helperHourAllocations.helper_hour_id,
						items.map((item) => item.id),
					),
				)
				.orderBy(asc(helperHourCategories.sortierung))
		: [];
	const byEntry = new Map<
		string,
		Array<{ code: string; label: string; minuten: number }>
	>();
	for (const row of allocations) {
		const list = byEntry.get(row.helper_hour_id) ?? [];
		list.push({ code: row.code, label: row.label, minuten: row.minuten });
		byEntry.set(row.helper_hour_id, list);
	}
	return {
		items: items.map((item) => ({
			...item,
			allocations: byEntry.get(item.id) ?? [],
		})),
		total: Number(total),
		page,
		pageSize: input.page_size,
		pageCount,
	};
}

async function requireCategory(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	code: string,
	options: { requireBudget?: boolean } = {},
) {
	const [category] = await tx
		.select()
		.from(helperHourCategories)
		.where(eq(helperHourCategories.code, code))
		.limit(1);
	if (!category) throw new Error("Der gewählte Punkt existiert nicht");
	if (!category.aktiv) throw new Error(`"${category.label}" ist deaktiviert`);
	if (options.requireBudget && category.art !== "abteilung")
		throw new Error(`"${category.label}" bildet kein Abteilungsguthaben`);
	return category;
}

export async function createHelperHourExpense(
	input: HelperHourExpenseCreateInput,
	actor: AuthUser,
	audit: Pick<RecordAuditInput, "request">,
) {
	return db.transaction(async (tx) => {
		const category = await requireCategory(tx, input.abteilung, {
			requireBudget: true,
		});
		const [row] = await tx
			.insert(helperHourExpenses)
			.values({
				idempotency_key: input.idempotency_key,
				kategorie_id: category.id,
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
				existing.kategorie_id !== category.id ||
				existing.datum !== input.datum ||
				existing.bezeichnung !== input.bezeichnung ||
				existing.betrag_cent !== input.betrag_cent ||
				existing.bemerkung !== input.bemerkung
			)
				throw new Error(
					"Diese Ausgabe wurde bereits mit anderen Angaben gespeichert",
				);
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
				abteilung: category.code,
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
			metadata: { betrag_cent: row.betrag_cent, grund: reason },
		});
		return row;
	});
}

export async function loadHelperHourExport(categoryCode: string) {
	const dashboard = await listHelperHours();
	const category = dashboard.categories.find(
		(entry) => entry.code === categoryCode,
	);
	if (!category) throw new Error("Abteilung nicht gefunden");
	const [hours, expenses] = await Promise.all([
		db
			.select({
				id: helperHours.id,
				datum: helperHours.datum,
				veranstaltung: helperHours.veranstaltung,
				nachname: helperHours.nachname,
				vorname: helperHours.vorname,
				bemerkung: helperHours.bemerkung,
				quelle: helperHours.quelle,
				quelle_blatt: helperHours.quelle_blatt,
				allocatedMinutes: helperHourAllocations.minuten,
			})
			.from(helperHours)
			.innerJoin(
				helperHourAllocations,
				eq(helperHourAllocations.helper_hour_id, helperHours.id),
			)
			.where(eq(helperHourAllocations.kategorie_id, category.id))
			.orderBy(helperHours.datum, helperHours.nachname, helperHours.vorname),
		db
			.select()
			.from(helperHourExpenses)
			.where(eq(helperHourExpenses.kategorie_id, category.id))
			.orderBy(helperHourExpenses.datum, helperHourExpenses.erstellt_am),
	]);
	const budget =
		dashboard.budgets.find((entry) => entry.code === categoryCode) ??
		(category.art === "verein"
			? {
					id: category.id,
					code: category.code,
					label: category.label,
					aktiv: category.aktiv,
					minutes:
						dashboard.contributions.find((entry) => entry.code === categoryCode)
							?.minutes ?? 0,
					earnedMinutes:
						dashboard.contributions.find((entry) => entry.code === categoryCode)
							?.minutes ?? 0,
					spentMinutes: 0,
					spentCent: 0,
					balanceMinutes:
						dashboard.contributions.find((entry) => entry.code === categoryCode)
							?.minutes ?? 0,
				}
			: null);
	if (!budget) throw new Error("Abteilung nicht gefunden");
	return {
		category: category.code,
		categoryLabel: category.label,
		budget,
		valueCent: dashboard.valueCent,
		hours,
		expenses: expenses.map((row) => ({
			...row,
			minuten: minutesFromCent(row.betrag_cent, dashboard.valueCent),
		})),
	};
}

export async function createHelperHour(
	input: HelperHourCreateInput,
	actor: AuthUser,
	audit: Pick<RecordAuditInput, "request">,
) {
	return db.transaction(async (tx) => {
		const category = await requireCategory(tx, input.kategorie);
		const [person] = await tx
			.select()
			.from(helperHourPersons)
			.where(eq(helperHourPersons.id, input.person_id))
			.limit(1);
		if (!person) throw new Error("Die gewählte Person existiert nicht");
		if (!person.aktiv) throw new Error("Die gewählte Person ist deaktiviert");
		const [event] = await tx
			.select()
			.from(helperHourEvents)
			.where(eq(helperHourEvents.id, input.veranstaltung_id))
			.limit(1);
		if (!event) throw new Error("Die gewählte Veranstaltung existiert nicht");
		if (!event.aktiv)
			throw new Error("Die gewählte Veranstaltung ist deaktiviert");
		const [row] = await tx
			.insert(helperHours)
			.values({
				idempotency_key: input.idempotency_key,
				datum: input.datum,
				person_id: person.id,
				veranstaltung_id: event.id,
				veranstaltung: event.name,
				nachname: person.nachname,
				vorname: person.vorname,
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
			const [allocation] = await tx
				.select()
				.from(helperHourAllocations)
				.where(eq(helperHourAllocations.helper_hour_id, existing.id));
			if (
				existing.datum !== input.datum ||
				existing.veranstaltung_id !== event.id ||
				existing.person_id !== person.id ||
				existing.gemeldete_summe_minuten !== input.minuten ||
				existing.bemerkung !== input.bemerkung ||
				allocation?.kategorie_id !== category.id ||
				allocation?.minuten !== input.minuten
			)
				throw new Error(
					"Diese Helferstunde wurde bereits mit anderen Angaben gespeichert",
				);
			return existing;
		}
		await tx.insert(helperHourAllocations).values({
			helper_hour_id: row.id,
			kategorie_id: category.id,
			minuten: input.minuten,
		});
		await recordAuditEventStrict(tx, {
			category: "helferstunden",
			action: "helferstunden.created",
			actor,
			subject: {
				type: "helferstunde",
				id: row.id,
				label: `${person.vorname} ${person.nachname}`.trim(),
			},
			request: audit.request,
			metadata: {
				datum: row.datum,
				veranstaltung: event.name,
				minuten: row.gemeldete_summe_minuten,
				kategorie: category.code,
			},
		});
		return row;
	});
}

/**
 * How many Excel rows Rendant already holds for the sheets a file covers. The
 * monthly sheet is the register of record, so re-importing it replaces what
 * came from an earlier version of the same list instead of duplicating it.
 */
export async function helperHourSheetStatus(sheets: string[]) {
	if (sheets.length === 0) return { existing: 0, digests: [] as string[] };
	const rows = await db
		.select({
			digest: helperHours.quelle_sha256,
			count: sql<number>`count(*)`,
		})
		.from(helperHours)
		.where(
			and(
				eq(helperHours.quelle, "excel"),
				inArray(helperHours.quelle_blatt, sheets),
			),
		)
		.groupBy(helperHours.quelle_sha256);
	return {
		existing: rows.reduce((sum, row) => sum + Number(row.count), 0),
		digests: rows.map((row) => row.digest).filter((v): v is string => !!v),
	};
}

export async function importHelperHours(
	rows: HelperHoursImportRow[],
	sheets: string[],
	katalog: {
		personen: Map<string, { id: string; nachname: string; vorname: string }>;
		veranstaltungen: Map<string, { id: string; name: string }>;
	},
	actor: AuthUser,
	audit: Pick<RecordAuditInput, "request" | "subject">,
	review: { corrected: number; accepted: number; repaired: number } = {
		corrected: 0,
		accepted: 0,
		repaired: 0,
	},
) {
	const categories = await listHelperHourCategories();
	const categoryByCode = new Map(
		categories.map((category) => [category.code, category]),
	);
	return db.transaction(async (tx) => {
		// Everything previously imported for these sheets goes, so the result is
		// exactly the current list. Manually entered hours are never touched.
		const removed = sheets.length
			? await tx
					.delete(helperHours)
					.where(
						and(
							eq(helperHours.quelle, "excel"),
							inArray(helperHours.quelle_blatt, sheets),
						),
					)
					.returning({ id: helperHours.id })
			: [];
		let created = 0;
		for (const row of rows) {
			// Jede Zeile muss auf Katalogeintraege zeigen; ungeklaerte Schreibweisen
			// haelt die Importpruefung vorher auf.
			const veranstaltung = katalog.veranstaltungen.get(
				catalogKey(row.veranstaltung),
			);
			if (!veranstaltung)
				throw new Error(
					`${row.sheet} Zeile ${row.rowNumber}: Die Veranstaltung "${row.veranstaltung}" ist nicht zugeordnet.`,
				);
			const person =
				row.nachname && row.vorname
					? katalog.personen.get(personKey(row.nachname, row.vorname))
					: undefined;
			if (row.nachname && row.vorname && !person)
				throw new Error(
					`${row.sheet} Zeile ${row.rowNumber}: "${row.nachname}, ${row.vorname}" ist nicht zugeordnet.`,
				);
			const [inserted] = await tx
				.insert(helperHours)
				.values({
					idempotency_key: row.idempotency_key,
					datum: row.datum,
					veranstaltung_id: veranstaltung.id,
					veranstaltung: veranstaltung.name,
					person_id: person?.id ?? null,
					nachname: person?.nachname ?? "",
					vorname: person?.vorname ?? "",
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
			if (!inserted) continue;
			created++;
			const allocations = Object.entries(row.allocations)
				.filter(([, minutes]) => minutes > 0)
				.map(([code, minutes]) => {
					const category = categoryByCode.get(code);
					if (!category)
						throw new Error(
							`${row.sheet} Zeile ${row.rowNumber}: Der Punkt "${code}" existiert nicht mehr.`,
						);
					return {
						helper_hour_id: inserted.id,
						kategorie_id: category.id,
						minuten: minutes,
					};
				});
			if (allocations.length)
				await tx.insert(helperHourAllocations).values(allocations);
		}
		await recordAuditEventStrict(tx, {
			category: "helferstunden",
			action: "helferstunden.imported",
			actor,
			request: audit.request,
			subject: audit.subject,
			metadata: {
				erstellt: created,
				ersetzt: removed.length,
				zeilen: rows.length,
				blaetter: sheets,
				automatisch_korrigiert: review.repaired,
				korrigierte_zeilen: review.corrected,
				bewusst_uebernommene_hinweise: review.accepted,
			},
		});
		return {
			created,
			replaced: removed.length,
			skipped: rows.length - created,
		};
	});
}

/**
 * Deductions already booked in Rendant, keyed by content. Used to recognise
 * rows of the settlement list that were imported before.
 */
export async function existingHelperHourExpenseSignatures() {
	const rows = await db
		.select({
			code: helperHourCategories.code,
			datum: helperHourExpenses.datum,
			bezeichnung: helperHourExpenses.bezeichnung,
			betrag_cent: helperHourExpenses.betrag_cent,
			storniert_am: helperHourExpenses.storniert_am,
		})
		.from(helperHourExpenses)
		.innerJoin(
			helperHourCategories,
			eq(helperHourCategories.id, helperHourExpenses.kategorie_id),
		);
	const active = new Set<string>();
	const all = new Set<string>();
	for (const row of rows) {
		const signature = helperHourExpenseSignature({
			kategorie_code: row.code,
			datum: row.datum,
			bezeichnung: row.bezeichnung,
			betrag_cent: row.betrag_cent,
		});
		all.add(signature);
		if (!row.storniert_am) active.add(signature);
	}
	return { active, all };
}

export async function importHelperHourExpenses(
	rows: HelperHourExpenseImportRow[],
	actor: AuthUser,
	audit: Pick<RecordAuditInput, "request" | "subject">,
) {
	const categories = await listHelperHourCategories();
	const categoryByCode = new Map(
		categories.map((category) => [category.code, category]),
	);
	return db.transaction(async (tx) => {
		let created = 0;
		for (const row of rows) {
			const category = categoryByCode.get(row.kategorie_code);
			if (!category)
				throw new Error(
					`${row.sheet} Zeile ${row.rowNumber}: Der Punkt "${row.kategorie_code}" existiert nicht mehr.`,
				);
			const inserted = await tx
				.insert(helperHourExpenses)
				.values({
					idempotency_key: row.idempotency_key,
					kategorie_id: category.id,
					datum: row.datum,
					bezeichnung: row.bezeichnung,
					betrag_cent: row.betrag_cent,
					quelle: "excel",
					quelle_datei: row.sourceFile,
					quelle_sha256: row.sourceDigest,
					quelle_blatt: row.sheet,
					quelle_zeile: row.rowNumber,
					erstellt_von_user_id: actor.id,
					erstellt_von_name: actor.name,
				})
				.onConflictDoNothing({ target: helperHourExpenses.idempotency_key })
				.returning({ id: helperHourExpenses.id });
			created += inserted.length;
		}
		await recordAuditEventStrict(tx, {
			category: "helferstunden",
			action: "helferstunden.expenses_imported",
			actor,
			request: audit.request,
			subject: audit.subject,
			metadata: { erstellt: created, zeilen: rows.length },
		});
		return { created, skipped: rows.length - created };
	});
}

/**
 * Catalogue entries that look like the same person. With names now selected
 * rather than typed, this is a clean-up tool for what the old free-text data
 * left behind, not a permanent repair path.
 */
export async function listHelperHourNameVariants() {
	const persons = await db
		.select({
			id: helperHourPersons.id,
			nachname: helperHourPersons.nachname,
			vorname: helperHourPersons.vorname,
			entries: sql<number>`(select count(*) from ${helperHours} where ${helperHours.person_id} = ${helperHourPersons.id})`,
			minutes: sql<number>`(select coalesce(sum(${helperHours.gemeldete_summe_minuten}), 0) from ${helperHours} where ${helperHours.person_id} = ${helperHourPersons.id})`,
		})
		.from(helperHourPersons);
	const paare = similarHelperNames(
		persons.map((person) => ({
			nachname: person.nachname,
			vorname: person.vorname,
			minutes: Number(person.minutes),
			entries: Number(person.entries),
		})),
	);
	const byLabel = new Map(
		persons.map((person) => [
			`${person.nachname}, ${person.vorname}`,
			person.id,
		]),
	);
	return paare.map((paar) => ({
		...paar,
		leftId: byLabel.get(paar.left) ?? null,
		rightId: byLabel.get(paar.right) ?? null,
	}));
}

export async function listHelperHourNoteRules() {
	const rows = await db
		.select({
			id: helperHourNoteRules.id,
			vermerk: helperHourNoteRules.vermerk,
			bemerkung: helperHourNoteRules.bemerkung,
			kategorie_id: helperHourNoteRules.kategorie_id,
			kategorie_code: helperHourCategories.code,
			kategorie_label: helperHourCategories.label,
		})
		.from(helperHourNoteRules)
		.innerJoin(
			helperHourCategories,
			eq(helperHourCategories.id, helperHourNoteRules.kategorie_id),
		)
		.orderBy(asc(helperHourNoteRules.vermerk));
	return rows;
}

/**
 * Records that rows carrying a given note belong to a point of their own, and
 * moves the hours already stored. Both halves matter for the same reason the
 * name variants do: the next import replaces the monthly sheets, so a one-off
 * correction would not survive it.
 */
export async function createHelperHourNoteRule(
	input: HelperHourNoteRuleCreateInput,
	actor: AuthUser,
	audit: Pick<RecordAuditInput, "request">,
) {
	return db.transaction(async (tx) => {
		const category = await requireCategory(tx, input.kategorie);
		const [row] = await tx
			.insert(helperHourNoteRules)
			.values({
				vermerk: input.vermerk,
				kategorie_id: category.id,
				bemerkung: input.bemerkung,
				erstellt_von_user_id: actor.id,
				erstellt_von_name: actor.name,
			})
			.onConflictDoNothing()
			.returning();
		if (!row) throw new Error("Für diesen Vermerk gibt es bereits eine Regel");
		// Move what is already stored, so the rule and the data agree at once.
		const betroffen = await tx
			.select({
				id: helperHours.id,
				minuten: helperHours.gemeldete_summe_minuten,
			})
			.from(helperHours)
			.where(
				sql`lower(trim(${helperHours.bemerkung})) = ${input.vermerk.trim().toLocaleLowerCase("de-DE")}`,
			);
		for (const eintrag of betroffen) {
			await tx
				.delete(helperHourAllocations)
				.where(eq(helperHourAllocations.helper_hour_id, eintrag.id));
			if (eintrag.minuten > 0)
				await tx.insert(helperHourAllocations).values({
					helper_hour_id: eintrag.id,
					kategorie_id: category.id,
					minuten: eintrag.minuten,
				});
		}
		await recordAuditEventStrict(tx, {
			category: "helferstunden",
			action: "helferstunden.note_rule_created",
			actor,
			request: audit.request,
			subject: {
				type: "helferstunden_vermerkregel",
				id: row.id,
				label: row.vermerk,
			},
			metadata: {
				vermerk: row.vermerk,
				kategorie: category.code,
				umgebuchte_eintraege: betroffen.length,
				umgebuchte_minuten: betroffen.reduce((a, b) => a + b.minuten, 0),
			},
		});
		return { ...row, updated: betroffen.length };
	});
}

export async function deleteHelperHourNoteRule(
	id: string,
	actor: AuthUser,
	audit: Pick<RecordAuditInput, "request">,
) {
	return db.transaction(async (tx) => {
		const [row] = await tx
			.delete(helperHourNoteRules)
			.where(eq(helperHourNoteRules.id, id))
			.returning();
		if (!row) throw new Error("Regel nicht gefunden");
		// Hours already moved keep their point; only future imports stop applying
		// the rule, and the next import of those sheets restores the old booking.
		await recordAuditEventStrict(tx, {
			category: "helferstunden",
			action: "helferstunden.note_rule_deleted",
			actor,
			request: audit.request,
			subject: {
				type: "helferstunden_vermerkregel",
				id: row.id,
				label: row.vermerk,
			},
			metadata: { vermerk: row.vermerk },
		});
		return { id: row.id };
	});
}

/**
 * Corrects one stored entry. Person and event come from the catalogue, never
 * from typed text; the mirrored name columns are rewritten from the chosen
 * entry so they cannot drift. The total is recomputed from the split, the
 * values as first imported are preserved, and a reason is required.
 */
export async function correctHelperHourEntry(
	input: HelperHourEntryCorrectInput,
	actor: AuthUser,
	audit: Pick<RecordAuditInput, "request">,
) {
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select()
			.from(helperHours)
			.where(eq(helperHours.id, input.id))
			.limit(1);
		if (!current) throw new Error("Helferstunde nicht gefunden");
		const before = await tx
			.select({
				code: helperHourCategories.code,
				minuten: helperHourAllocations.minuten,
			})
			.from(helperHourAllocations)
			.innerJoin(
				helperHourCategories,
				eq(helperHourCategories.id, helperHourAllocations.kategorie_id),
			)
			.where(eq(helperHourAllocations.helper_hour_id, current.id));

		let person: { id: string; nachname: string; vorname: string } | null = null;
		if (input.person_id) {
			const [found] = await tx
				.select()
				.from(helperHourPersons)
				.where(eq(helperHourPersons.id, input.person_id))
				.limit(1);
			if (!found) throw new Error("Die gewählte Person existiert nicht");
			person = found;
		}
		let event: { id: string; name: string } | null = null;
		if (input.veranstaltung_id) {
			const [found] = await tx
				.select()
				.from(helperHourEvents)
				.where(eq(helperHourEvents.id, input.veranstaltung_id))
				.limit(1);
			if (!found) throw new Error("Die gewählte Veranstaltung existiert nicht");
			event = found;
		}

		let minutes = current.gemeldete_summe_minuten;
		if (input.zuordnung) {
			const seen = new Set<string>();
			const rows = [];
			for (const entry of input.zuordnung) {
				if (seen.has(entry.kategorie))
					throw new Error(`Der Punkt "${entry.kategorie}" kommt doppelt vor`);
				seen.add(entry.kategorie);
				const category = await requireCategory(tx, entry.kategorie);
				rows.push({
					helper_hour_id: current.id,
					kategorie_id: category.id,
					minuten: entry.minuten,
				});
			}
			minutes = rows.reduce((sum, row) => sum + row.minuten, 0);
			await tx
				.delete(helperHourAllocations)
				.where(eq(helperHourAllocations.helper_hour_id, current.id));
			await tx.insert(helperHourAllocations).values(rows);
		}
		const [row] = await tx
			.update(helperHours)
			.set({
				person_id: person?.id ?? current.person_id,
				nachname: person?.nachname ?? current.nachname,
				vorname: person?.vorname ?? current.vorname,
				veranstaltung_id: event?.id ?? current.veranstaltung_id,
				veranstaltung: event?.name ?? current.veranstaltung,
				gemeldete_summe_minuten: minutes,
				import_originalwerte: current.import_originalwerte ?? {
					vorname: current.vorname,
					nachname: current.nachname,
					datum: current.datum,
					allocations: Object.fromEntries(
						before.map((entry) => [entry.code, entry.minuten]),
					),
					gemeldete_summe_minuten: current.gemeldete_summe_minuten,
				},
			})
			.where(eq(helperHours.id, current.id))
			.returning();
		await recordAuditEventStrict(tx, {
			category: "helferstunden",
			action: "helferstunden.entry_corrected",
			actor,
			request: audit.request,
			subject: {
				type: "helferstunde",
				id: current.id,
				label: `${row.vorname} ${row.nachname}`.trim(),
			},
			metadata: {
				grund: input.grund,
				vorher: {
					name: `${current.nachname}, ${current.vorname}`,
					veranstaltung: current.veranstaltung,
					minuten: current.gemeldete_summe_minuten,
					zuordnung: Object.fromEntries(
						before.map((entry) => [entry.code, entry.minuten]),
					),
				},
				nachher: {
					name: `${row.nachname}, ${row.vorname}`,
					veranstaltung: row.veranstaltung,
					minuten: row.gemeldete_summe_minuten,
				},
			},
		});
		return row;
	});
}

/**
 * Removes one stored entry. The row is deleted outright, its category split
 * goes with it through the cascade, and the audit event keeps the full booking
 * so the deletion stays reconstructable. An entry that came from the list is
 * restored by the next import of its sheet, because the monthly sheet stays the
 * register of record.
 */
export async function deleteHelperHourEntry(
	id: string,
	grund: string,
	actor: AuthUser,
	audit: Pick<RecordAuditInput, "request">,
) {
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select()
			.from(helperHours)
			.where(eq(helperHours.id, id))
			.limit(1);
		if (!current) throw new Error("Helferstunde nicht gefunden");
		const allocations = await tx
			.select({
				code: helperHourCategories.code,
				minuten: helperHourAllocations.minuten,
			})
			.from(helperHourAllocations)
			.innerJoin(
				helperHourCategories,
				eq(helperHourCategories.id, helperHourAllocations.kategorie_id),
			)
			.where(eq(helperHourAllocations.helper_hour_id, current.id));
		await tx.delete(helperHours).where(eq(helperHours.id, current.id));
		await recordAuditEventStrict(tx, {
			category: "helferstunden",
			action: "helferstunden.entry_deleted",
			actor,
			request: audit.request,
			subject: {
				type: "helferstunde",
				id: current.id,
				label: `${current.vorname} ${current.nachname}`.trim(),
			},
			metadata: {
				grund,
				datum: current.datum,
				name: `${current.nachname}, ${current.vorname}`,
				veranstaltung: current.veranstaltung,
				minuten: current.gemeldete_summe_minuten,
				zuordnung: Object.fromEntries(
					allocations.map((entry) => [entry.code, entry.minuten]),
				),
				quelle: current.quelle,
				quelle_blatt: current.quelle_blatt,
				quelle_zeile: current.quelle_zeile,
			},
		});
		return { id: current.id };
	});
}
