const dateFormatter = new Intl.DateTimeFormat("de-DE", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("de-DE", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
});

export function formatDateDe(value: Date | string): string {
	const d = value instanceof Date ? value : new Date(value);
	return dateFormatter.format(d);
}

export function formatDateTimeDe(value: Date | string): string {
	const d = value instanceof Date ? value : new Date(value);
	return dateTimeFormatter.format(d);
}

export function formatFilenameStamp(value: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	const yyyy = value.getFullYear();
	const mm = pad(value.getMonth() + 1);
	const dd = pad(value.getDate());
	const hh = pad(value.getHours());
	const mi = pad(value.getMinutes());
	return `${yyyy}-${mm}-${dd}_${hh}-${mi}`;
}

export function todayIsoDate(): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
