import { describe, expect, it } from "vitest";
import { hiddenAxisLabels } from "@/components/charts/revenue-area-chart";

// Label widths measured in Chromium with IBM Plex Sans at 11px: a date label is
// 32.4 px wide and 33 px semibold, a month name 14.9 to 19.5 px. The axis is
// 260 px wide inside a 390 px phone viewport.
const PHONE_AXIS = 260;
const DESKTOP_AXIS = 760;

function measured(widths: number[], axisWidth: number) {
	return widths.map((width, index) => ({
		index,
		x: (index / (widths.length - 1)) * axisWidth,
		width,
	}));
}

function weeks(axisWidth: number) {
	return measured(
		[32.4, 32.4, 32.4, 32.4, 32.4, 32.4, 32.4, 32.4, 32.4, 32.4, 32.4, 33],
		axisWidth,
	);
}

function months(axisWidth: number) {
	return measured(
		[17.3, 19.3, 18.5, 17.7, 18.3, 18.8, 17.5, 17.6, 18.1, 14.9, 19.1, 19.5],
		axisWidth,
	);
}

describe("revenue chart axis labels", () => {
	it("hides nothing when every label fits", () => {
		expect(hiddenAxisLabels(weeks(DESKTOP_AXIS)).size).toBe(0);
		expect(hiddenAxisLabels(months(DESKTOP_AXIS)).size).toBe(0);
	});

	it("hides the week labels that would overlap on a phone", () => {
		const hidden = hiddenAxisLabels(weeks(PHONE_AXIS));
		expect(hidden.size).toBeGreaterThan(0);
		expect(12 - hidden.size).toBeGreaterThan(2);
	});

	it("keeps all twelve month labels on a phone", () => {
		expect(hiddenAxisLabels(months(PHONE_AXIS)).size).toBe(0);
	});

	it("never lets two shown labels overlap", () => {
		for (const build of [weeks, months]) {
			for (const axisWidth of [160, 220, 260, 340, 520, 760]) {
				const labels = build(axisWidth);
				const shown = labels.filter(
					(label) => !hiddenAxisLabels(labels).has(label.index),
				);
				for (let i = 1; i < shown.length; i++) {
					const gap =
						shown[i].x -
						shown[i].width / 2 -
						(shown[i - 1].x + shown[i - 1].width / 2);
					expect(gap).toBeGreaterThanOrEqual(3);
				}
			}
		}
	});

	it("always keeps the current period label", () => {
		for (const axisWidth of [80, 120, 200, 260, 420, 760]) {
			const labels = weeks(axisWidth);
			expect(hiddenAxisLabels(labels).has(labels.length - 1)).toBe(false);
		}
	});

	it("hides nothing on an empty axis", () => {
		expect(hiddenAxisLabels([]).size).toBe(0);
	});
});
