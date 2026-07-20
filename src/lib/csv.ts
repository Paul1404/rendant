export function csvCell(value: string): string {
	const trimmed = value.trimStart();
	const isNegativeNumber = /^-\d+(?:[.,]\d+)?$/.test(trimmed);
	const spreadsheetSafe =
		!isNegativeNumber && /^[=+@-]|^[\t\r]/.test(trimmed) ? `'${value}` : value;
	const needsQuote = /[;"\n\r]/.test(spreadsheetSafe);
	const escaped = spreadsheetSafe.replace(/"/g, '""');
	return needsQuote ? `"${escaped}"` : escaped;
}

export function csvDocument(rows: string[][]): string {
	const body = rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
	return `﻿${body}\r\n`;
}
