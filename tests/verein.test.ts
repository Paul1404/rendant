import { describe, expect, it } from "vitest";
import {
	type VereinStammdaten,
	vereinAnschriftLine,
	vereinRegisterLine,
} from "@/lib/verein";

const base: VereinStammdaten = {
	name: "Sportverein 1945 Untereuerheim e.V.",
	strasse: "Triebweg 9",
	plz: "97508",
	ort: "Untereuerheim",
	vorstand: "Alexander Eckert (Vorstandsvorsitzender)",
	registergericht: "Amtsgericht Schweinfurt",
	registernummer: "VR 31",
};

describe("vereinAnschriftLine", () => {
	it("joins street and city with a comma", () => {
		expect(vereinAnschriftLine(base)).toBe("Triebweg 9, 97508 Untereuerheim");
	});

	it("omits missing parts without dangling separators", () => {
		expect(vereinAnschriftLine({ ...base, strasse: "" })).toBe(
			"97508 Untereuerheim",
		);
		expect(vereinAnschriftLine({ ...base, plz: "", ort: "" })).toBe(
			"Triebweg 9",
		);
		expect(
			vereinAnschriftLine({ ...base, strasse: "", plz: "", ort: "" }),
		).toBe("");
	});

	it("trims surrounding whitespace", () => {
		expect(
			vereinAnschriftLine({ ...base, strasse: "  Triebweg 9 ", ort: " Ort " }),
		).toBe("Triebweg 9, 97508 Ort");
	});
});

describe("vereinRegisterLine", () => {
	it("combines court and number", () => {
		expect(vereinRegisterLine(base)).toBe("Amtsgericht Schweinfurt VR 31");
	});

	it("returns an empty string when nothing is set", () => {
		expect(
			vereinRegisterLine({ ...base, registergericht: "", registernummer: "" }),
		).toBe("");
	});
});
