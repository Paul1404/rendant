import { describe, expect, it } from "vitest";
import { csvCell, csvDocument } from "@/lib/csv";

describe("csvCell", () => {
	it("escapes semicolons, quotes, and line breaks", () => {
		expect(csvCell("simple")).toBe("simple");
		expect(csvCell("A;B")).toBe('"A;B"');
		expect(csvCell('A "quoted" value')).toBe('"A ""quoted"" value"');
		expect(csvCell("A\nB")).toBe('"A\nB"');
	});

	it("neutralizes spreadsheet formulas without changing negative numbers", () => {
		expect(csvCell("=HYPERLINK(\"https://example.invalid\")")).toBe(
			'"\'=HYPERLINK(""https://example.invalid"")"',
		);
		expect(csvCell("+SUM(1;2)")).toBe('"\'+SUM(1;2)"');
		expect(csvCell("@command")).toBe("'@command");
		expect(csvCell("-cmd|'/C calc'!A0")).toBe("'-cmd|'/C calc'!A0");
		expect(csvCell("-12,50")).toBe("-12,50");
	});
});

describe("csvDocument", () => {
	it("writes semicolon CSV with UTF-8 BOM and CRLF rows", () => {
		expect(
			csvDocument([
				["Name", "Wert"],
				["A;B", "1,00"],
			]),
		).toBe('﻿Name;Wert\r\n"A;B";1,00\r\n');
	});
});
