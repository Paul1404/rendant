import { describe, expect, it } from "vitest";
import packageJson from "../package.json";
import { RELEASES } from "@/lib/release-notes";

describe("release notes", () => {
	it("match the package version and remain newest first", () => {
		expect(RELEASES.length).toBeGreaterThan(0);
		expect(RELEASES[0].version).toBe(packageJson.version);

		const versions = new Set<string>();
		let previousDate = "9999-12-31";
		for (const release of RELEASES) {
			expect(release.version).toMatch(/^\d+\.\d+\.\d+$/);
			expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(release.notes.length).toBeGreaterThan(0);
			expect(versions.has(release.version)).toBe(false);
			expect(release.date! <= previousDate).toBe(true);
			versions.add(release.version);
			previousDate = release.date!;
		}
	});
});
