const formatter = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCent(cent: number): string {
  const negative = cent < 0;
  const abs = Math.abs(cent);
  const euro = Math.floor(abs / 100);
  const rest = abs % 100;
  const value = euro + rest / 100;
  return (negative ? "-" : "") + formatter.format(value) + " EUR";
}

export function formatCentPlain(cent: number): string {
  const negative = cent < 0;
  const abs = Math.abs(cent);
  const euro = Math.floor(abs / 100);
  const rest = abs % 100;
  return (
    (negative ? "-" : "") +
    String(euro) +
    "," +
    String(rest).padStart(2, "0")
  );
}

export function parseGermanAmount(input: string): number | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const num = Number(normalized);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}
