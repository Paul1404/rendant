import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
	process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/test";
});

describe("HysteresisGate", () => {
	it("degrades only after sustained bad samples and recovers after good samples", async () => {
		const { HysteresisGate } = await import("@/server/services/lfio-health");
		const gate = new HysteresisGate(3, 2);

		expect(gate.evaluate(true)).toEqual({ degraded: false, samples: 1 });
		expect(gate.evaluate(true)).toEqual({ degraded: false, samples: 2 });
		expect(gate.evaluate(true)).toEqual({ degraded: true, samples: 3 });
		expect(gate.evaluate(false)).toEqual({ degraded: true, samples: 1 });
		expect(gate.evaluate(false)).toEqual({ degraded: false, samples: 2 });
	});

	it("resets the bad counter after a good sample", async () => {
		const { HysteresisGate } = await import("@/server/services/lfio-health");
		const gate = new HysteresisGate(2, 1);

		expect(gate.evaluate(true).degraded).toBe(false);
		expect(gate.evaluate(false).degraded).toBe(false);
		expect(gate.evaluate(true).degraded).toBe(false);
		expect(gate.evaluate(true).degraded).toBe(true);
	});
});

describe("calculateCpuPct", () => {
	it("uses process CPU deltas divided by elapsed time and core count", async () => {
		const { calculateCpuPct } = await import("@/server/services/lfio-health");

		expect(
			calculateCpuPct(
				{ usage: { user: 100_000, system: 50_000 }, timeMs: 1_000 },
				{ usage: { user: 300_000, system: 150_000 }, timeMs: 2_000 },
				4,
			),
		).toBe(8);
	});

	it("caps CPU at 100 percent", async () => {
		const { calculateCpuPct } = await import("@/server/services/lfio-health");

		expect(
			calculateCpuPct(
				{ usage: { user: 0, system: 0 }, timeMs: 1_000 },
				{ usage: { user: 10_000_000, system: 0 }, timeMs: 2_000 },
				1,
			),
		).toBe(100);
	});

	it("returns zero for invalid elapsed time", async () => {
		const { calculateCpuPct } = await import("@/server/services/lfio-health");

		expect(
			calculateCpuPct(
				{ usage: { user: 0, system: 0 }, timeMs: 1_000 },
				{ usage: { user: 1_000, system: 1_000 }, timeMs: 1_000 },
				2,
			),
		).toBe(0);
	});
});

describe("container memory helpers", () => {
	it("parses cgroup v2 max as unlimited", async () => {
		const { parseCgroupLimit } = await import("@/server/services/lfio-health");

		expect(parseCgroupLimit("max\n")).toBeUndefined();
	});

	it("parses numeric cgroup limits", async () => {
		const { parseCgroupLimit } = await import("@/server/services/lfio-health");

		expect(parseCgroupLimit("536870912\n")).toBe(536_870_912);
	});

	it("calculates memory percentage from used bytes and container limit", async () => {
		const { calculateMemoryPct } = await import("@/server/services/lfio-health");

		expect(calculateMemoryPct(256, 1024)).toBe(25);
		expect(calculateMemoryPct(2048, 1024)).toBe(100);
	});
});
