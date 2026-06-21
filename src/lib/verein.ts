// Vereinsstammdaten für rechtlich vollständige Dokumente (Fußzeile der
// Kassenzählprotokolle). Die Werte kommen aus den Einstellungen (DB), nicht aus
// dem Code. Hier liegen nur der Typ und reine Formatierungshelfer, die leere
// Felder sauber auslassen.

export type VereinStammdaten = {
	name: string;
	strasse: string;
	plz: string;
	ort: string;
	vorstand: string;
	registergericht: string;
	registernummer: string;
};

export const EMPTY_VEREIN_STAMMDATEN: VereinStammdaten = {
	name: "",
	strasse: "",
	plz: "",
	ort: "",
	vorstand: "",
	registergericht: "",
	registernummer: "",
};

export function vereinAnschriftLine(v: VereinStammdaten): string {
	const ort = [v.plz.trim(), v.ort.trim()].filter(Boolean).join(" ");
	return [v.strasse.trim(), ort].filter(Boolean).join(", ");
}

export function vereinRegisterLine(v: VereinStammdaten): string {
	return [v.registergericht.trim(), v.registernummer.trim()]
		.filter(Boolean)
		.join(" ");
}
