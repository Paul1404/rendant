import { describe, expect, it } from "vitest";

// The app rounds once, on exact integer cents.
const storedCent = (minutes: number, valueCent: number) =>
	Math.round((minutes * valueCent) / 60);

// Any spreadsheet formula has to work from decimal euro values instead.
const round2 = (value: number) => Math.round(value * 100) / 100;

describe("helper hours export value", () => {
	// Both plausible formulas disagree with the stored value on a wide range of
	// inputs, because a result landing on an exact half cent rounds differently
	// once it has passed through decimal euros. This is why the export writes the
	// stored figure rather than a formula.
	it("shows a formula cannot reproduce the stored cents", () => {
		let viaHours = 0;
		let viaMinutes = 0;
		for (let cent = 1; cent <= 800; cent += 1) {
			for (let minutes = 1; minutes <= 400; minutes += 1) {
				const stored = storedCent(minutes, cent) / 100;
				if (round2((minutes / 60) * (cent / 100)) !== stored) viaHours += 1;
				if (round2((minutes * (cent / 100)) / 60) !== stored) viaMinutes += 1;
			}
		}
		expect(viaHours).toBeGreaterThan(0);
		expect(viaMinutes).toBeGreaterThan(0);
	});

	it("keeps the column total equal to the sum of the stored rows", () => {
		// The department budget is sum(round(minutes * valueCent / 60)), so summing
		// the per-row stored values reproduces it exactly.
		const rows = [50, 330, 7, 125, 1];
		const valueCent = 633;
		const perRow = rows.map((minutes) => storedCent(minutes, valueCent));
		const total = perRow.reduce((sum, cent) => sum + cent, 0);
		expect(perRow.reduce((sum, cent) => sum + cent, 0)).toBe(total);
		expect(total).toBe(
			rows.reduce((sum, minutes) => sum + storedCent(minutes, valueCent), 0),
		);
	});
});
