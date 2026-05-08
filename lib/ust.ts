export type UstAusgabe = {
  betrag_cent: number;
  ust_basis_punkte: number;
};

export type UstGroup = {
  bp: number;
  brutto_cent: number;
  ust_cent: number;
  netto_cent: number;
};

export function ustAnteilCent(bruttoCent: number, bp: number): number {
  if (bp <= 0) return 0;
  const netCent = Math.round((bruttoCent * 10000) / (10000 + bp));
  return bruttoCent - netCent;
}

export function formatUstSatz(bp: number): string {
  const percent = bp / 100;
  const rounded = Math.round(percent * 10) / 10;
  return Number.isInteger(rounded)
    ? `${rounded} %`
    : `${rounded.toString().replace(".", ",")} %`;
}

export function groupByUstRate(ausgaben: UstAusgabe[]): UstGroup[] {
  const map = new Map<number, UstGroup>();
  for (const a of ausgaben) {
    const bp = a.ust_basis_punkte ?? 0;
    const ust = ustAnteilCent(a.betrag_cent, bp);
    const existing = map.get(bp);
    if (existing) {
      existing.brutto_cent += a.betrag_cent;
      existing.ust_cent += ust;
      existing.netto_cent += a.betrag_cent - ust;
    } else {
      map.set(bp, {
        bp,
        brutto_cent: a.betrag_cent,
        ust_cent: ust,
        netto_cent: a.betrag_cent - ust,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.bp - b.bp);
}

export function hasUstBreakdown(groups: UstGroup[]): boolean {
  return groups.some((g) => g.ust_cent > 0);
}
