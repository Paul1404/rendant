import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { cashRegisters } from "@/server/db/schema";
import {
	type RecordAuditInput,
	recordAuditEventStrict,
} from "@/server/services/audit";

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
	audit: RecordAuditInput,
): Promise<CashRegister> {
	return db.transaction(async (tx) => {
		const maxRow = await tx
			.select({ max: sql<number | null>`max(${cashRegisters.reihenfolge})` })
			.from(cashRegisters);
		const currentMax = maxRow[0]?.max;
		const nextOrder = currentMax == null ? 0 : Number(currentMax) + 1;
		const [row] = await tx
			.insert(cashRegisters)
			.values({
				kassennummer: input.kassennummer,
				kassenbezeichnung: input.kassenbezeichnung,
				wechselgeld_cent: input.wechselgeld_cent,
				reihenfolge: nextOrder,
			})
			.returning();
		const register = rowToRegister(row);
		await recordAuditEventStrict(tx, {
			...audit,
			subject: {
				type: "kasse",
				id: register.id,
				label: `${register.kassennummer} ${register.kassenbezeichnung}`,
			},
			metadata: {
				...audit.metadata,
				wechselgeld_cent: register.wechselgeld_cent,
			},
		});
		return register;
	});
}

export async function updateCashRegister(
	id: string,
	input: CashRegisterInput,
	audit: RecordAuditInput,
): Promise<CashRegister | null> {
	return db.transaction(async (tx) => {
		const rows = await tx
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
		const register = rowToRegister(rows[0]);
		await recordAuditEventStrict(tx, {
			...audit,
			subject: {
				type: "kasse",
				id: register.id,
				label: `${register.kassennummer} ${register.kassenbezeichnung}`,
			},
			metadata: {
				...audit.metadata,
				wechselgeld_cent: register.wechselgeld_cent,
			},
		});
		return register;
	});
}

export async function deleteCashRegister(
	id: string,
	audit: RecordAuditInput,
): Promise<CashRegister | null> {
	return db.transaction(async (tx) => {
		const rows = await tx
			.delete(cashRegisters)
			.where(eq(cashRegisters.id, id))
			.returning();
		if (!rows[0]) return null;
		const register = rowToRegister(rows[0]);
		await recordAuditEventStrict(tx, {
			...audit,
			subject: {
				type: "kasse",
				id: register.id,
				label: `${register.kassennummer} ${register.kassenbezeichnung}`,
			},
		});
		return register;
	});
}
