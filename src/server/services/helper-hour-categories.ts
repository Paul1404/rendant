import { and, asc, eq, ne, sql } from "drizzle-orm";
import {
	HELPER_HOUR_CONTRIBUTION_CODE,
	type HelperHourCategory,
	helperHourCategoryCode,
	normalizeHelperHourLabel,
} from "@/lib/helper-hours";
import type {
	HelperHourCategoryCreateInput,
	HelperHourCategoryUpdateInput,
} from "@/lib/schemas";
import { db } from "@/server/db";
import {
	helperHourAllocations,
	helperHourCategories,
	helperHourExpenses,
} from "@/server/db/schema";
import type { AuthUser } from "@/server/orpc/base";
import {
	type RecordAuditInput,
	recordAuditEventStrict,
} from "@/server/services/audit";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function listHelperHourCategories(
	tx: Tx | typeof db = db,
): Promise<HelperHourCategory[]> {
	const rows = await tx
		.select()
		.from(helperHourCategories)
		.orderBy(
			asc(helperHourCategories.sortierung),
			asc(helperHourCategories.label),
		);
	return rows.map((row) => ({
		id: row.id,
		code: row.code,
		label: row.label,
		art: row.art === "verein" ? "verein" : "abteilung",
		sortierung: row.sortierung,
		aktiv: row.aktiv,
		system: row.system,
	}));
}

/**
 * Categories with usage counts, so the settings screen can explain why a
 * category may only be deactivated rather than removed.
 */
export async function listHelperHourCategoriesWithUsage() {
	const [categories, allocations, expenses] = await Promise.all([
		listHelperHourCategories(),
		db
			.select({
				kategorie_id: helperHourAllocations.kategorie_id,
				entries: sql<number>`count(*)`,
				minutes: sql<number>`coalesce(sum(${helperHourAllocations.minuten}), 0)`,
			})
			.from(helperHourAllocations)
			.groupBy(helperHourAllocations.kategorie_id),
		db
			.select({
				kategorie_id: helperHourExpenses.kategorie_id,
				entries: sql<number>`count(*)`,
			})
			.from(helperHourExpenses)
			.groupBy(helperHourExpenses.kategorie_id),
	]);
	const byAllocation = new Map(
		allocations.map((row) => [
			row.kategorie_id,
			{ entries: Number(row.entries), minutes: Number(row.minutes) },
		]),
	);
	const byExpense = new Map(
		expenses.map((row) => [row.kategorie_id, Number(row.entries)]),
	);
	return categories.map((category) => {
		const usage = byAllocation.get(category.id);
		return {
			...category,
			entries: usage?.entries ?? 0,
			minutes: usage?.minutes ?? 0,
			expenses: byExpense.get(category.id) ?? 0,
		};
	});
}

/**
 * Import and entry paths address categories by code. Both the code and the
 * current label resolve, so a renamed category still matches its Excel column.
 */
export function helperHourCategoryIndex(categories: HelperHourCategory[]) {
	const byKey = new Map<string, HelperHourCategory>();
	for (const category of categories) {
		byKey.set(normalizeHelperHourLabel(category.code), category);
		byKey.set(normalizeHelperHourLabel(category.label), category);
	}
	return {
		byId: new Map(categories.map((entry) => [entry.id, entry])),
		byCode: new Map(categories.map((entry) => [entry.code, entry])),
		/** Resolves an Excel column heading or a stored code. */
		match: (value: string) => byKey.get(normalizeHelperHourLabel(value)),
	};
}

export async function createHelperHourCategory(
	input: HelperHourCategoryCreateInput,
	actor: AuthUser,
	audit: Pick<RecordAuditInput, "request">,
) {
	const code = helperHourCategoryCode(input.label);
	if (!code) throw new Error("Der Name enthält keine verwendbaren Zeichen");
	return db.transaction(async (tx) => {
		const [maxSort] = await tx
			.select({
				value: sql<number>`coalesce(max(${helperHourCategories.sortierung}), 0)`,
			})
			.from(helperHourCategories);
		const [row] = await tx
			.insert(helperHourCategories)
			.values({
				code,
				label: input.label,
				art: input.art,
				sortierung: Number(maxSort?.value ?? 0) + 1,
				erstellt_von_user_id: actor.id,
				erstellt_von_name: actor.name,
			})
			.onConflictDoNothing({ target: helperHourCategories.code })
			.returning();
		if (!row) throw new Error("Es gibt bereits einen Punkt mit diesem Namen");
		await recordAuditEventStrict(tx, {
			category: "helferstunden",
			action: "helferstunden.category_created",
			actor,
			request: audit.request,
			subject: {
				type: "helferstunden_kategorie",
				id: row.id,
				label: row.label,
			},
			metadata: { code: row.code, art: row.art },
		});
		return row;
	});
}

export async function updateHelperHourCategory(
	input: HelperHourCategoryUpdateInput,
	actor: AuthUser,
	audit: Pick<RecordAuditInput, "request">,
) {
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select()
			.from(helperHourCategories)
			.where(eq(helperHourCategories.id, input.id))
			.limit(1);
		if (!current) throw new Error("Punkt nicht gefunden");
		// The contribution category anchors the "unassigned hours count for the
		// club" rule the Excel list documents, so its kind stays fixed.
		if (
			current.code === HELPER_HOUR_CONTRIBUTION_CODE &&
			input.art !== "verein"
		)
			throw new Error(
				"Der Vereinsbeitrag kann nicht zu einer Abteilung werden",
			);
		if (current.code === HELPER_HOUR_CONTRIBUTION_CODE && !input.aktiv)
			throw new Error("Der Vereinsbeitrag kann nicht deaktiviert werden");
		const [duplicate] = await tx
			.select({ id: helperHourCategories.id })
			.from(helperHourCategories)
			.where(
				and(
					ne(helperHourCategories.id, input.id),
					sql`lower(trim(${helperHourCategories.label})) = lower(trim(${input.label}))`,
				),
			)
			.limit(1);
		if (duplicate)
			throw new Error("Es gibt bereits einen Punkt mit diesem Namen");
		const [row] = await tx
			.update(helperHourCategories)
			.set({
				label: input.label,
				art: input.art,
				aktiv: input.aktiv,
				sortierung: input.sortierung,
				aktualisiert_am: new Date(),
			})
			.where(eq(helperHourCategories.id, input.id))
			.returning();
		if (!row) throw new Error("Punkt nicht gefunden");
		await recordAuditEventStrict(tx, {
			category: "helferstunden",
			action: "helferstunden.category_updated",
			actor,
			request: audit.request,
			subject: {
				type: "helferstunden_kategorie",
				id: row.id,
				label: row.label,
			},
			metadata: {
				code: row.code,
				vorher: {
					label: current.label,
					art: current.art,
					aktiv: current.aktiv,
				},
				nachher: { label: row.label, art: row.art, aktiv: row.aktiv },
			},
		});
		return row;
	});
}

/**
 * Only an unused, non-seeded category can be removed. Everything else is
 * deactivated instead, so existing hours and exports keep their labels.
 */
export async function deleteHelperHourCategory(
	id: string,
	actor: AuthUser,
	audit: Pick<RecordAuditInput, "request">,
) {
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select()
			.from(helperHourCategories)
			.where(eq(helperHourCategories.id, id))
			.limit(1);
		if (!current) throw new Error("Punkt nicht gefunden");
		if (current.system)
			throw new Error(
				"Vorgegebene Punkte können nur deaktiviert, nicht gelöscht werden",
			);
		const [used] = await tx
			.select({ count: sql<number>`count(*)` })
			.from(helperHourAllocations)
			.where(eq(helperHourAllocations.kategorie_id, id));
		const [charged] = await tx
			.select({ count: sql<number>`count(*)` })
			.from(helperHourExpenses)
			.where(eq(helperHourExpenses.kategorie_id, id));
		if (Number(used?.count ?? 0) > 0 || Number(charged?.count ?? 0) > 0)
			throw new Error(
				"Der Punkt wird bereits verwendet und kann nur deaktiviert werden",
			);
		await tx
			.delete(helperHourCategories)
			.where(eq(helperHourCategories.id, id));
		await recordAuditEventStrict(tx, {
			category: "helferstunden",
			action: "helferstunden.category_deleted",
			actor,
			request: audit.request,
			subject: {
				type: "helferstunden_kategorie",
				id: current.id,
				label: current.label,
			},
			metadata: { code: current.code },
		});
		return { id: current.id };
	});
}
