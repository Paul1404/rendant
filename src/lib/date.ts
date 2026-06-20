// All formatting and "today"/"current year" computations are pinned to
// Europe/Berlin. The production server runs in UTC, so without an explicit
// timeZone, timestamps (erstellt_am, storniert_am) would render in UTC and the
// belegnummer year could flip a day early around New Year.
export const BERLIN_TZ = "Europe/Berlin";

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
	timeZone: BERLIN_TZ,
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("de-DE", {
	timeZone: BERLIN_TZ,
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
});

// yyyy-mm-dd date strings are stored without a time. Parsing them as UTC
// midnight and formatting in Berlin (a positive offset) keeps the same
// calendar day, so date-only values are unaffected by the timezone.
function toDate(value: Date | string): Date {
	return value instanceof Date ? value : new Date(value);
}

export function formatDateDe(value: Date | string): string {
	return dateFormatter.format(toDate(value));
}

export function formatDateTimeDe(value: Date | string): string {
	return dateTimeFormatter.format(toDate(value));
}

const isoDateFormatter = new Intl.DateTimeFormat("en-CA", {
	timeZone: BERLIN_TZ,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

// Current date in Berlin as yyyy-mm-dd.
export function todayIsoDate(now: Date = new Date()): string {
	return isoDateFormatter.format(now);
}

// Current calendar year in Berlin.
export function currentYearBerlin(now: Date = new Date()): number {
	return Number(
		new Intl.DateTimeFormat("en-CA", {
			timeZone: BERLIN_TZ,
			year: "numeric",
		}).format(now),
	);
}

const stampFormatter = new Intl.DateTimeFormat("en-CA", {
	timeZone: BERLIN_TZ,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
});

// Filename-safe Berlin timestamp, e.g. 2026-06-20_14-57.
export function formatFilenameStamp(value: Date): string {
	const parts = stampFormatter.formatToParts(value);
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
	return `${get("year")}-${get("month")}-${get("day")}_${get("hour")}-${get("minute")}`;
}
