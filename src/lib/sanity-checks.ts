import { formatCent } from "@/lib/money";

export type SanityWarning = {
	id: string;
	message: string;
};

export type SanityCheckInput = {
	// Computed money values (in cent). null when not yet valid.
	gezaehltCent: number;
	wechselgeldCent: number | null;
	bestandCent: number | null;
	tageseinnahmenCent: number | null;

	// Whether the user has typed anything in the count grid at all
	// (sum of all counts > 0).
	anyCountEntered: boolean;

	// Names — already trimmed strings; "" when empty.
	gezaehltVon: string;
	geprueftVon: string;

	// Selected register's wechselgeld preset, or null if no preset is selected.
	presetWechselgeldCent: number | null;

	// ISO date string from the form (yyyy-mm-dd), or "" if empty.
	datum: string;

	// "today" in the same format — passed in for testability and so server-
	// rendered date never affects the warning.
	today: string;
};

function normalizeName(s: string): string {
	return s.trim().toLowerCase();
}

function isoToDate(iso: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
	const d = new Date(`${iso}T00:00:00`);
	return Number.isNaN(d.getTime()) ? null : d;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function runSanityChecks(input: SanityCheckInput): SanityWarning[] {
	const warnings: SanityWarning[] = [];

	// Negative Tageseinnahmen — only when both Wechselgeld and Bestand are
	// valid; otherwise the user is mid-typing.
	if (
		input.bestandCent != null &&
		input.wechselgeldCent != null &&
		input.tageseinnahmenCent != null &&
		input.tageseinnahmenCent < 0
	) {
		warnings.push({
			id: "negative-tageseinnahmen",
			message:
				"Tageseinnahmen sind negativ. Bitte Wechselgeld und gezählten Endbestand prüfen.",
		});
	}

	// Stückelung komplett leer, aber Wechselgeld eingegeben (Mehr-als-Defaults).
	// Nur warnen, wenn der User schon mit dem Formular interagiert hat — also
	// einen Anlass eingegeben hat.
	if (!input.anyCountEntered && input.gezaehltVon !== "") {
		warnings.push({
			id: "no-counts",
			message: "Es wurde keine einzige Münze oder Schein gezählt.",
		});
	}

	// Wechselgeld weicht stark vom Preset ab.
	if (
		input.presetWechselgeldCent != null &&
		input.presetWechselgeldCent > 0 &&
		input.wechselgeldCent != null &&
		input.wechselgeldCent > 0
	) {
		const ratio =
			Math.abs(input.wechselgeldCent - input.presetWechselgeldCent) /
			input.presetWechselgeldCent;
		if (ratio > 0.5) {
			warnings.push({
				id: "wechselgeld-deviation",
				message: `Wechselgeld weicht stark vom Preset der Kasse ab (Preset ${formatCent(
					input.presetWechselgeldCent,
				)}, eingegeben ${formatCent(input.wechselgeldCent)}).`,
			});
		}
	}

	// Vier-Augen-Prinzip.
	if (
		input.gezaehltVon !== "" &&
		input.geprueftVon !== "" &&
		normalizeName(input.gezaehltVon) === normalizeName(input.geprueftVon)
	) {
		warnings.push({
			id: "vier-augen",
			message:
				"„Gezählt von“ und „Geprüft von“ sind identisch. Das Vier-Augen-Prinzip empfiehlt zwei verschiedene Personen.",
		});
	}

	// Datum in der Zukunft.
	const datumD = isoToDate(input.datum);
	const todayD = isoToDate(input.today);
	if (datumD && todayD) {
		if (datumD.getTime() > todayD.getTime()) {
			warnings.push({
				id: "date-future",
				message: "Das Datum des Protokolls liegt in der Zukunft.",
			});
		} else {
			const diffDays = (todayD.getTime() - datumD.getTime()) / MS_PER_DAY;
			if (diffDays > 30) {
				warnings.push({
					id: "date-old",
					message:
						"Das Datum des Protokolls liegt mehr als 30 Tage zurück. Korrekt?",
				});
			}
		}
	}

	return warnings;
}
