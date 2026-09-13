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
	return `${(negative ? "-" : "") + formatter.format(value)} EUR`;
}

// Same figures as `formatCent`, but with the currency symbol. Used where a
// value sits next to a compact axis label, so one graphic never shows both
// notations. Accounting documents keep the `EUR` form.
export function formatCentSymbol(cent: number): string {
	const negative = cent < 0;
	const abs = Math.abs(cent);
	const value = Math.floor(abs / 100) + (abs % 100) / 100;
	return `${(negative ? "-" : "") + formatter.format(value)} €`;
}

export function formatCentPlain(cent: number): string {
	const negative = cent < 0;
	const abs = Math.abs(cent);
	const euro = Math.floor(abs / 100);
	const rest = abs % 100;
	return `${(negative ? "-" : "") + String(euro)},${String(rest).padStart(2, "0")}`;
}

function formatCompactNumber(value: number, suffix: string): string {
	const rounded = Math.round(value * 10) / 10;
	const text = Number.isInteger(rounded)
		? String(rounded)
		: String(rounded).replace(".", ",");
	return `${text}${suffix}`;
}

export function formatCentCompact(cent: number): string {
	const negative = cent < 0;
	const abs = Math.abs(cent);
	const sign = negative ? "-" : "";
	if (abs < 100_000_000) {
		if (abs < 100000) {
			return `${sign}${Math.round(abs / 100)} €`;
		}
		return `${sign}${formatCompactNumber(abs / 100 / 1000, "k €")}`;
	}
	return `${sign}${formatCompactNumber(abs / 100 / 1_000_000, "M €")}`;
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

const percentFormatter = new Intl.NumberFormat("de-DE", {
	minimumFractionDigits: 1,
	maximumFractionDigits: 1,
});

const signedPercentFormatter = new Intl.NumberFormat("de-DE", {
	minimumFractionDigits: 1,
	maximumFractionDigits: 1,
	signDisplay: "exceptZero",
});

// One percent notation for the whole app: one decimal and a space before the
// sign. A share that would round to zero is marked as small instead of being
// printed as nothing at all. `sign` adds the plus for deltas.
export function formatPercent(
	value: number,
	options: { sign?: boolean } = {},
): string {
	const format = options.sign ? signedPercentFormatter : percentFormatter;
	if (!Number.isFinite(value)) return `${format.format(0)} %`;
	if (value > 0 && value < 0.05) return "< 0,1 %";
	if (value < 0 && value > -0.05) return "> -0,1 %";
	return `${format.format(value)} %`;
}
