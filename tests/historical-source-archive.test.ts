import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/tenant-context", () => ({
	SVU_TENANT_ID: "00000000-0000-4000-8000-000000000001",
	requireTenant: () => ({ id: "00000000-0000-4000-8000-000000000002" }),
}));
import {
	historicalSourceContentType,
	historicalSourceObjectKey,
} from "@/server/services/historical-source-archive";

describe("historical source archive", () => {
	it("uses a deterministic content-addressed object key", () => {
		const sha = "a".repeat(64);
		expect(historicalSourceObjectKey(sha, "Zählprotokoll 42.XLSX")).toBe(
			`tenants/00000000-0000-4000-8000-000000000002/historical-sources/${sha}/original.xlsx`,
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
