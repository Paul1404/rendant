// Standard-Schema-Fehler in einen kurzen deutschen Satz übersetzen.
//
// oRPC wirft bei ungültiger Eingabe einen BAD_REQUEST mit der englischen
// Rahmenmeldung "Input validation failed". Die erreichte niemanden, der etwas
// damit anfangen konnte: sie nennt weder das Feld noch den Grund. Hier wird aus
// den Issues eine Meldung gebaut, die sagt, welches Feld warum abgelehnt wurde.
//
// Werte tauchen darin nie auf. Ein abgelehnter API-Key oder ein Passwort soll
// nicht in einer Fehlermeldung landen, die irgendwo weiterwandert.

// Minimale Sicht auf ein Standard-Schema-Issue. Valibot liefert zusätzlich
// `type` und `requirement`; beides ist optional, damit die Funktion auch mit
// einem anderen Validator arbeitet.
export type ValidationIssue = {
	readonly message?: string;
	readonly type?: string;
	readonly requirement?: unknown;
	readonly received?: string;
	readonly path?: ReadonlyArray<
		PropertyKey | { readonly key?: unknown } | undefined
	>;
};

// Feldnamen, die jemand in der Oberfläche tatsächlich sieht. Alles andere wird
// aus dem technischen Schlüssel lesbar gemacht, statt hier eine Liste zu
// pflegen, die unbemerkt veraltet.
const FIELD_LABELS: Record<string, string> = {
	api_key: "API-Key",
	belegnummer: "Belegnummer",
	belegtext: "Belegtext",
	bis: "Enddatum",
	datum: "Datum",
	email: "E-Mail-Adresse",
	from: "Absender",
	host: "Server",
	min_digits: "Mindeststellen",
	name: "Name",
	nachname: "Nachname",
	password: "Passwort",
	port: "Port",
	prefix: "Präfix",
	recipients: "Empfänger",
	security: "Verschlüsselung",
	separator: "Trennzeichen",
	to: "Empfänger",
	user: "Benutzer",
	veranstaltung: "Veranstaltung",
	von: "Startdatum",
	vorname: "Vorname",
	year_format: "Jahresformat",
};

function pathSegments(issue: ValidationIssue): string[] {
	return (issue.path ?? [])
		.map((segment) => {
			if (segment === undefined || segment === null) return undefined;
			if (typeof segment === "object") {
				const key = (segment as { key?: unknown }).key;
				return typeof key === "string" || typeof key === "number"
					? String(key)
					: undefined;
			}
			return String(segment);
		})
		.filter((segment): segment is string => segment !== undefined);
}

function issueField(issue: ValidationIssue): string | undefined {
	const segments = pathSegments(issue);
	const last = segments.at(-1);
	if (last === undefined || last === "") return undefined;
	if (FIELD_LABELS[last]) return FIELD_LABELS[last];
	// Ein Index wie "2" allein sagt nichts; dann lieber das Feld davor nennen.
	if (/^\d+$/.test(last)) {
		const parent = segments.at(-2);
		if (parent === undefined) return undefined;
		return FIELD_LABELS[parent] ?? humanize(parent);
	}
	return humanize(last);
}

function humanize(key: string): string {
	const words = key.replace(/_/g, " ").trim();
	return words.charAt(0).toUpperCase() + words.slice(1);
}

function count(requirement: unknown): string | undefined {
	return typeof requirement === "number" ? String(requirement) : undefined;
}

// Grund in Deutsch. Gibt undefined zurück, wenn der Issue-Typ hier nicht
// bekannt ist; dann bleibt es bei der allgemeinen Meldung.
function reason(issue: ValidationIssue): string | undefined {
	const requirement = count(issue.requirement);
	switch (issue.type) {
		case "max_length":
			return requirement ? `höchstens ${requirement} Zeichen` : "zu lang";
		case "min_length":
			return requirement ? `mindestens ${requirement} Zeichen` : "zu kurz";
		case "length":
			return requirement ? `genau ${requirement} Zeichen` : undefined;
		case "non_empty":
			return "darf nicht leer sein";
		case "max_value":
			return requirement ? `höchstens ${requirement}` : "zu groß";
		case "min_value":
			return requirement ? `mindestens ${requirement}` : "zu klein";
		case "integer":
			return "muss eine ganze Zahl sein";
		case "email":
			return "keine gültige E-Mail-Adresse";
		case "url":
			return "keine gültige Adresse";
		case "uuid":
		case "iso_date":
		case "iso_timestamp":
			return "ungültiges Format";
		case "regex":
			return "enthält unzulässige Zeichen";
		case "picklist":
		case "enum":
		case "literal":
			return "kein zulässiger Wert";
		case "object":
		case "string":
		case "number":
		case "boolean":
		case "array":
			return issue.received === "undefined" ? "fehlt" : "ungültiger Wert";
		default:
			return undefined;
	}
}

// Valibots eingebaute Meldungen beginnen alle mit "Invalid ". Alles andere hat
// jemand im Schema selbst formuliert, und zwar auf Deutsch. Solche Meldungen
// sind genauer als alles, was hier nachgebaut werden könnte.
function isAuthored(message: string | undefined): message is string {
	return Boolean(message) && !(message as string).startsWith("Invalid ");
}

function describe(issue: ValidationIssue): string | undefined {
	if (isAuthored(issue.message)) return issue.message.replace(/\.$/, "");
	const field = issueField(issue);
	const why = reason(issue);
	if (field && why) return `${field}: ${why}`;
	if (field) return `${field} ist ungültig`;
	return undefined;
}

export const GENERIC_VALIDATION_MESSAGE =
	"Die Eingabe wurde abgelehnt. Bitte die Felder prüfen und erneut versuchen.";

// Höchstens drei Felder nennen. Wer zehn Fehler hat, liest sie ohnehin am
// Formular ab und nicht im Toast.
const MAX_LISTED = 3;

export function validationMessage(
	issues: readonly ValidationIssue[] | undefined,
): string {
	const described: string[] = [];
	for (const issue of issues ?? []) {
		const text = describe(issue);
		if (text && !described.includes(text)) described.push(text);
	}
	if (described.length === 0) return GENERIC_VALIDATION_MESSAGE;
	const listed = described.slice(0, MAX_LISTED).join("; ");
	const rest = described.length - MAX_LISTED;
	return rest > 0
		? `Eingabe abgelehnt. ${listed}; und ${rest} weitere.`
		: `Eingabe abgelehnt. ${listed}.`;
}

// Für das Log: technischer Pfad und Regel, niemals der Wert. Damit lässt sich
// eine abgelehnte Eingabe im Betrieb nachvollziehen, ohne dass ein API-Key oder
// ein Passwort in die Logs wandert.
export function validationIssueFields(
	issues: readonly ValidationIssue[] | undefined,
): Array<{ field: string; rule: string }> {
	return (issues ?? []).map((issue) => ({
		field: pathSegments(issue).join(".") || "(root)",
		rule: issue.type ?? "unknown",
	}));
}
