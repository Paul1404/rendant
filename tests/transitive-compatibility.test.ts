import { createRequire } from "node:module";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Readable } from "node:stream";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("patched transitive dependencies", () => {
	it("preserves recursive archive matching, exclusions and legacy glob expansion", async () => {
		const excelRequire = createRequire(require.resolve("exceljs/package.json"));
		const archiver = excelRequire("archiver");
		const archiveRequire = createRequire(excelRequire.resolve("archiver"));
		const utils = archiveRequire("archiver-utils");
		const directory = await mkdtemp(join(tmpdir(), "rendant-glob-"));
		try {
			await mkdir(join(directory, "nested"));
			await Promise.all([
				writeFile(join(directory, "first.txt"), "first"),
				writeFile(join(directory, "nested", "second.txt"), "second"),
				writeFile(join(directory, "nested", "skip.txt"), "excluded"),
				writeFile(join(directory, "other.csv"), "csv"),
				writeFile(join(directory, ".hidden.txt"), "hidden"),
			]);
			expect(
				utils.file
					.expand({ cwd: directory, nodir: true }, [
						"**/*.{txt,csv}",
						"!**/skip.txt",
					])
					.sort(),
			).toEqual(["first.txt", "nested/second.txt", "other.csv"]);

			const archive = archiver("zip");
			const chunks: Buffer[] = [];
			const completed = new Promise<Buffer>((resolve, reject) => {
				archive.on("data", (chunk: Buffer) => chunks.push(chunk));
				archive.on("error", reject);
				archive.on("end", () => resolve(Buffer.concat(chunks)));
			});
			archive.glob("**/*.txt", { cwd: directory, ignore: ["**/skip.txt"] });
			await archive.finalize();
			const zip = await JSZip.loadAsync(await completed);
			expect(Object.keys(zip.files).sort()).toEqual([
				"first.txt",
				"nested/second.txt",
			]);
			expect(await zip.file("nested/second.txt")!.async("string")).toBe(
				"second",
			);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("writes and reopens streaming Excel archives with styles and shared strings", async () => {
		const stream = new PassThrough();
		const chunks: Buffer[] = [];
		stream.on("data", (chunk: Buffer) => chunks.push(chunk));
		const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
			stream,
			useStyles: true,
			useSharedStrings: true,
		});
		const sheet = workbook.addWorksheet("Streaming");
		sheet.addRow(["Kartenumsatz", 12.5]);
		sheet.getCell("B1").numFmt = "0.00";
		sheet.getRow(1).commit();
		await workbook.commit();
		const bytes = Buffer.concat(chunks);
		const reopened = new ExcelJS.Workbook();
		await reopened.xlsx.load(
			bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
		);
		expect(reopened.getWorksheet("Streaming")?.getCell("A1").value).toBe(
			"Kartenumsatz",
		);
		expect(reopened.getWorksheet("Streaming")?.getCell("B1").value).toBe(12.5);
		expect(reopened.getWorksheet("Streaming")?.getCell("B1").numFmt).toBe(
			"0.00",
		);
		// WorkbookReader uses unzipper rather than the in-memory JSZip reader.
		const reader = new ExcelJS.stream.xlsx.WorkbookReader(
			Readable.from([bytes]),
			{
				sharedStrings: "cache",
				styles: "cache",
				worksheets: "emit",
			},
		);
		const rows: unknown[][] = [];
		for await (const worksheet of reader) {
			for await (const row of worksheet) {
				rows.push([
					row.getCell(1).value,
					row.getCell(2).value,
					row.getCell(2).numFmt,
				]);
			}
		}
		expect(rows).toEqual([["Kartenumsatz", 12.5, "0.00"]]);
	});

	it("generates UUID-backed Excel formatting and reopens the workbook", async () => {
		const excelRequire = createRequire(require.resolve("exceljs/package.json"));
		const { v4, validate, version } = excelRequire("uuid");
		const id = v4();
		expect(validate(id)).toBe(true);
		expect(version(id)).toBe(4);

		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet("Compatibility");
		sheet.addRows([[10], [50], [90]]);
		sheet.addConditionalFormatting({
			ref: "A1:A3",
			rules: [
				{
					type: "iconSet",
					iconSet: "3Triangles",
					priority: 1,
					cfvo: [
						{ type: "percent", value: 0 },
						{ type: "percent", value: 33 },
						{ type: "percent", value: 67 },
					],
				},
			],
		});
		const bytes = await workbook.xlsx.writeBuffer();
		const zip = await JSZip.loadAsync(bytes);
		const xml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
		const generatedId = xml.match(/id="\{([0-9A-F-]{36})\}"/i)?.[1];
		expect(generatedId).toBeDefined();
		expect(validate(generatedId)).toBe(true);
		expect(version(generatedId)).toBe(4);
		expect(xml).toContain('iconSet="3Triangles"');

		const reopened = new ExcelJS.Workbook();
		await reopened.xlsx.load(bytes);
		expect(reopened.getWorksheet("Compatibility")?.getCell("A2").value).toBe(
			50,
		);
	});

	it("keeps synchronous and asynchronous TypeScript transforms usable by the legacy loader", async () => {
		const kitRequire = createRequire(require.resolve("drizzle-kit"));
		const loaderRequire = createRequire(
			kitRequire.resolve("@esbuild-kit/esm-loader"),
		);
		const { transformSync, transform } = loaderRequire(
			"@esbuild-kit/core-utils",
		);
		const source = "const value: number = 42; export default value;";
		const synchronous = transformSync(source, "/tmp/compatibility.ts");
		expect(synchronous.code).not.toContain(": number");
		const module = { exports: {} as { default?: number } };
		new Function("module", "exports", "require", synchronous.code)(
			module,
			module.exports,
			require,
		);
		expect(module.exports.default).toBe(42);
		expect(synchronous.map).toBeDefined();

		const asynchronous = await transform(source, "/tmp/compatibility.ts");
		expect(asynchronous.code).not.toContain(": number");
		const url = `data:text/javascript;base64,${Buffer.from(asynchronous.code).toString("base64")}`;
		const loaded = await import(/* @vite-ignore */ url);
		expect(loaded.default).toBe(42);
		expect(asynchronous.map).toBeDefined();
	});
});
