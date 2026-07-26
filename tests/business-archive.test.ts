import { describe, expect, it } from "vitest";
import {
	buildBusinessArchive,
	sanitizeAppSettingsForArchive,
	type BusinessArchiveCollections,
} from "@/server/services/export";

function collections(): BusinessArchiveCollections {
	return {
		protokolle: [{ id: "protokoll-1" }] as never,
		historische_umsaetze: [{ id: "historisch-1" }] as never,
		umsatzgruppen: [{ id: "gruppe-1" }, { id: "gruppe-2" }] as never,
		umsatzgruppen_aliase: [] as never,
		kassen: [{ id: "kasse-1" }] as never,
		belegnummer_sequenzen: [{ year: 2026 }] as never,
		einstellungen: { id: 1 } as never,
	};
}

describe("business archive", () => {
	it("carries a versioned format, range and per-section counts", () => {
		const archive = buildBusinessArchive(collections(), {
			von: "2025-01-01",
			bis: "2026-12-31",
			exportedAt: "2026-07-26T08:00:00.000Z",
		});

		expect(archive.format).toBe("svufo-business-archive");
		expect(archive.schemaVersion).toBe(1);
		expect(archive.appVersion).toMatch(/^\d+\.\d+\.\d+$/);
		expect(archive.range).toEqual({
			von: "2025-01-01",
			bis: "2026-12-31",
		});
		expect(archive.counts).toEqual({
			protokolle: 1,
			historische_umsaetze: 1,
			umsatzgruppen: 2,
			umsatzgruppen_aliase: 0,
			kassen: 1,
			belegnummer_sequenzen: 1,
			einstellungen: 1,
		});
	});

	it("states that credentials, audit rows and object bodies are excluded", () => {
		const archive = buildBusinessArchive(collections(), {
			von: "2026-01-01",
			bis: "2026-12-31",
		});
		const exclusions = archive.excluded.join(" ");

		expect(exclusions).toContain("Anmeldedaten");
		expect(exclusions).toContain("Audit-Log");
		expect(exclusions).toContain("SMTP-Passwort");
		expect(exclusions).toContain("PDF-Dateiinhalte");
	});

	it("removes the encrypted SMTP password from exported settings", () => {
		const settings = sanitizeAppSettingsForArchive({
			id: 1,
			smtp_password_enc: "encrypted-secret",
			vereinsname: "SV Test",
		} as never);

		expect(settings).toMatchObject({ id: 1, vereinsname: "SV Test" });
		expect(settings).not.toHaveProperty("smtp_password_enc");
	});
});
