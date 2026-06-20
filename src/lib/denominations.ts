export type DenominationKind = "schein" | "muenze";

export type Denomination = {
	key: string;
	cent: number;
	label: string;
	kind: DenominationKind;
};

export const DENOMINATIONS = [
	{ key: "anzahl_500_eur", cent: 50000, label: "500 EUR", kind: "schein" },
	{ key: "anzahl_200_eur", cent: 20000, label: "200 EUR", kind: "schein" },
	{ key: "anzahl_100_eur", cent: 10000, label: "100 EUR", kind: "schein" },
	{ key: "anzahl_50_eur", cent: 5000, label: "50 EUR", kind: "schein" },
	{ key: "anzahl_20_eur", cent: 2000, label: "20 EUR", kind: "schein" },
	{ key: "anzahl_10_eur", cent: 1000, label: "10 EUR", kind: "schein" },
	{ key: "anzahl_5_eur", cent: 500, label: "5 EUR", kind: "schein" },
	{ key: "anzahl_2_eur", cent: 200, label: "2 EUR", kind: "muenze" },
	{ key: "anzahl_1_eur", cent: 100, label: "1 EUR", kind: "muenze" },
	{ key: "anzahl_50_cent", cent: 50, label: "50 ct", kind: "muenze" },
	{ key: "anzahl_20_cent", cent: 20, label: "20 ct", kind: "muenze" },
	{ key: "anzahl_10_cent", cent: 10, label: "10 ct", kind: "muenze" },
	{ key: "anzahl_5_cent", cent: 5, label: "5 ct", kind: "muenze" },
	{ key: "anzahl_2_cent", cent: 2, label: "2 ct", kind: "muenze" },
	{ key: "anzahl_1_cent", cent: 1, label: "1 ct", kind: "muenze" },
] as const satisfies readonly Denomination[];

export type DenominationKey = (typeof DENOMINATIONS)[number]["key"];

export type DenominationCounts = Record<DenominationKey, number>;

export const DENOMINATION_KEYS: readonly DenominationKey[] = DENOMINATIONS.map(
	(d) => d.key,
);

export function emptyCounts(): DenominationCounts {
	const out = {} as DenominationCounts;
	for (const d of DENOMINATIONS) out[d.key] = 0;
	return out;
}

export function sumGezaehltCent(counts: DenominationCounts): number {
	let total = 0;
	for (const d of DENOMINATIONS) total += counts[d.key] * d.cent;
	return total;
}
