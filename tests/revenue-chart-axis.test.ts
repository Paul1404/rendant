import { describe, expect, it } from "vitest";
import {
	hiddenAxisLabels,
	niceAxis,
} from "@/components/charts/revenue-area-chart";

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

describe("revenue chart axis scale", () => {
	// Cent values, as the chart stores them.
	it("rounds the maximum up to a value a person would write down", () => {
		// 17.400,00 EUR, the case that produced 17,4k / 13,1k / 8,7k / 4,4k.
		expect(niceAxis(1_740_000)).toEqual({ max: 2_000_000, step: 500_000 });
		expect(niceAxis(88_618_79)).toEqual({ max: 10_000_000, step: 2_500_000 });
		expect(niceAxis(320_00)).toEqual({ max: 40_000, step: 10_000 });
	});

	it("keeps the highest bucket at or below the top gridline", () => {
		for (const max of [1, 99, 1_000, 12_345, 634_00, 1_740_000, 9_999_999]) {
			const axis = niceAxis(max);
			expect(axis.max).toBeGreaterThanOrEqual(max);
			expect(axis.max % axis.step).toBe(0);
		}
	});

	it("produces four or five steps", () => {
		for (const max of [1_000, 4_321, 63_400, 273_700, 1_740_000, 88_618_79]) {
			const axis = niceAxis(max);
			const steps = axis.max / axis.step;
			expect(steps).toBeGreaterThanOrEqual(3);
			expect(steps).toBeLessThanOrEqual(5);
			expect(Number.isInteger(steps)).toBe(true);
		}
	});

	it("never falls below a whole cent per step", () => {
		expect(niceAxis(1).step).toBeGreaterThanOrEqual(1);
		expect(niceAxis(3).step).toBeGreaterThanOrEqual(1);
	});

	it("collapses to nothing without positive values", () => {
		expect(niceAxis(0)).toEqual({ max: 0, step: 0 });
		expect(niceAxis(-5)).toEqual({ max: 0, step: 0 });
		expect(niceAxis(Number.NaN)).toEqual({ max: 0, step: 0 });
	});
});
