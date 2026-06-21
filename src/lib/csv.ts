export function csvCell(value: string): string {
	const needsQuote = /[;"\n\r]/.test(value);
	const escaped = value.replace(/"/g, '""');
	return needsQuote ? `"${escaped}"` : escaped;
}

export function csvDocument(rows: string[][]): string {
	const body = rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
	return `﻿${body}\r\n`;
}
