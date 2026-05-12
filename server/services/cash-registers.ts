import { sql } from "@/lib/db";

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

type Row = {
  id: string;
  kassennummer: string;
  kassenbezeichnung: string;
  wechselgeld_cent: number | string;
  reihenfolge: number | string;
};

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
  const rows = await sql<Row[]>`
    SELECT id, kassennummer, kassenbezeichnung, wechselgeld_cent, reihenfolge
    FROM cash_registers
    ORDER BY reihenfolge ASC, kassennummer ASC
  `;
  return rows.map(rowToRegister);
}

export async function createCashRegister(
  input: CashRegisterInput,
): Promise<CashRegister> {
  const maxRow = await sql<{ max: number | string | null }[]>`
    SELECT MAX(reihenfolge) AS max FROM cash_registers
  `;
  const currentMax = maxRow[0]?.max;
  const nextOrder = currentMax == null ? 0 : Number(currentMax) + 1;
  const rows = await sql<Row[]>`
    INSERT INTO cash_registers
      (kassennummer, kassenbezeichnung, wechselgeld_cent, reihenfolge)
    VALUES
      (${input.kassennummer}, ${input.kassenbezeichnung},
       ${input.wechselgeld_cent}, ${nextOrder})
    RETURNING id, kassennummer, kassenbezeichnung,
              wechselgeld_cent, reihenfolge
  `;
  return rowToRegister(rows[0]);
}

export async function updateCashRegister(
  id: string,
  input: CashRegisterInput,
): Promise<CashRegister | null> {
  const rows = await sql<Row[]>`
    UPDATE cash_registers
    SET kassennummer = ${input.kassennummer},
        kassenbezeichnung = ${input.kassenbezeichnung},
        wechselgeld_cent = ${input.wechselgeld_cent},
        updated_at = now()
    WHERE id = ${id}
    RETURNING id, kassennummer, kassenbezeichnung,
              wechselgeld_cent, reihenfolge
  `;
  if (rows.length === 0) return null;
  return rowToRegister(rows[0]);
}

export async function deleteCashRegister(id: string): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    DELETE FROM cash_registers WHERE id = ${id} RETURNING id
  `;
  return rows.length > 0;
}
