import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { cashRegisters } from "@/server/db/schema";

export type CashRegister = {
	id: string;
	kassennummer: string;
	kassenbezeichnung: string;
	wechselgeld_cent: number;
	reihenfolge: number;
};

export type CashRegisterInput = {
	kassennummer: string;
	kassenbezeichnung: string;
	wechselgeld_cent: number;
};

type Row = typeof cashRegisters.$inferSelect;

function rowToRegister(row: Row): CashRegister {
	return {
		id: row.id,
		kassennummer: row.kassennummer,
		kassenbezeichnung: row.kassenbezeichnung,
		wechselgeld_cent: Number(row.wechselgeld_cent),
		reihenfolge: Number(row.reihenfolge),
	};
}

export async function listCashRegisters(): Promise<CashRegister[]> {
	const rows = await db
		.select()
		.from(cashRegisters)
		.orderBy(asc(cashRegisters.reihenfolge), asc(cashRegisters.kassennummer));
	return rows.map(rowToRegister);
}

export async function createCashRegister(
	input: CashRegisterInput,
): Promise<CashRegister> {
	const maxRow = await db
		.select({ max: sql<number | null>`max(${cashRegisters.reihenfolge})` })
		.from(cashRegisters);
	const currentMax = maxRow[0]?.max;
	const nextOrder = currentMax == null ? 0 : Number(currentMax) + 1;
	const rows = await db
		.insert(cashRegisters)
		.values({
			kassennummer: input.kassennummer,
			kassenbezeichnung: input.kassenbezeichnung,
			wechselgeld_cent: input.wechselgeld_cent,
			reihenfolge: nextOrder,
		})
		.returning();
	return rowToRegister(rows[0]);
}

export async function updateCashRegister(
	id: string,
	input: CashRegisterInput,
): Promise<CashRegister | null> {
	const rows = await db
		.update(cashRegisters)
		.set({
			kassennummer: input.kassennummer,
			kassenbezeichnung: input.kassenbezeichnung,
			wechselgeld_cent: input.wechselgeld_cent,
			updated_at: new Date(),
		})
		.where(eq(cashRegisters.id, id))
		.returning();
	if (rows.length === 0) return null;
	return rowToRegister(rows[0]);
}

export async function deleteCashRegister(
	id: string,
): Promise<CashRegister | null> {
	const rows = await db
		.delete(cashRegisters)
		.where(eq(cashRegisters.id, id))
		.returning();
	return rows[0] ? rowToRegister(rows[0]) : null;
}
