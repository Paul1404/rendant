import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const publicPath = (name: string) =>
	new URL(`../public/${name}`, import.meta.url);

describe("Rendant web branding", () => {
	it("keeps the manifest aligned with the production brand", () => {
		const manifest = JSON.parse(
			readFileSync(publicPath("manifest.webmanifest"), "utf8"),
		) as {
			name: string;
			short_name: string;
			start_url: string;
			background_color: string;
			theme_color: string;
			icons: Array<{ src: string; sizes: string; purpose: string }>;
		};

		expect(manifest).toMatchObject({
			name: "Rendant Finanzverwaltung für Vereine",
			short_name: "Rendant",
			start_url: "/protokolle",
			background_color: "#F7F3EA",
			theme_color: "#0F2A22",
		});
		expect(manifest.icons).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ sizes: "192x192", purpose: "any" }),
				expect.objectContaining({ sizes: "512x512", purpose: "any" }),
				expect.objectContaining({ sizes: "192x192", purpose: "maskable" }),
				expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
			]),
		);

		for (const icon of manifest.icons) {
			expect(existsSync(publicPath(icon.src.replace(/^\//, "")))).toBe(true);
		}
	});

	it("keeps accessible SVG sources for each icon context", () => {
		for (const name of [
			"favicon.svg",
			"logo.svg",
			"logo-square.svg",
			"logo-maskable.svg",
		]) {
			const source = readFileSync(publicPath(name), "utf8");
			expect(source).toContain("<title");
			expect(source).toContain("#0F2A22");
			expect(source).toMatch(/#(?:B08A3E|C9A960)/);
		}
	});
});
