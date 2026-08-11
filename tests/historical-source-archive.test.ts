import { describe, expect, it } from "vitest";
import {
	historicalSourceContentType,
	historicalSourceObjectKey,
} from "@/server/services/historical-source-archive";

describe("historical source archive", () => {
	it("uses a deterministic content-addressed object key", () => {
		const sha = "a".repeat(64);
		expect(historicalSourceObjectKey(sha, "Zählprotokoll 42.XLSX")).toBe(
			`historical-sources/${sha}/original.xlsx`,
		);
	});

	it("keeps spreadsheet MIME types explicit", () => {
		expect(historicalSourceContentType("protokoll.ods")).toBe(
			"application/vnd.oasis.opendocument.spreadsheet",
		);
		expect(historicalSourceContentType("protokoll.xlsx")).toBe(
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		);
	});
});
