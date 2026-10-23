import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), error: vi.fn() }));
vi.mock("@/server/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("@/server/logger", () => ({
	logger: { child: () => ({ error: mocks.error }) },
}));
import { collectHealthSnapshot } from "@/server/services/health";

beforeEach(() => {
	vi.useFakeTimers();
	mocks.execute.mockReset();
	mocks.error.mockReset();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("database readiness without external telemetry", () => {
	it("reports a healthy database and clears the timeout", async () => {
		mocks.execute.mockResolvedValue({ rows: [{ value: 1 }] });
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		expect(await collectHealthSnapshot()).toMatchObject({
			ok: true,
			db: true,
			status: "up",
		});
		expect(mocks.execute).toHaveBeenCalledOnce();
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("keeps slow but available databases distinct from failures", async () => {
		mocks.execute.mockImplementation(
			() =>
				new Promise((resolve) => {
					setTimeout(() => resolve({ rows: [] }), 1_501);
				}),
		);
		const snapshot = collectHealthSnapshot();
		await vi.advanceTimersByTimeAsync(1_501);
		expect(await snapshot).toMatchObject({
			ok: true,
			db: true,
			status: "degraded",
			latencyMs: 1_501,
		});
		expect(vi.getTimerCount()).toBe(0);
	});

	it("reports query failures without exposing error details", async () => {
		mocks.execute.mockRejectedValue(new Error("private connection details"));
		const snapshot = await collectHealthSnapshot();
		expect(snapshot).toMatchObject({ ok: false, db: false, status: "down" });
		expect(JSON.stringify(snapshot)).not.toContain(
			"private connection details",
		);
		expect(mocks.error).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("bounds a stuck query to ten seconds", async () => {
		mocks.execute.mockImplementation(() => new Promise(() => {}));
		const snapshot = collectHealthSnapshot();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(await snapshot).toMatchObject({
			ok: false,
			db: false,
			status: "down",
			latencyMs: 10_000,
		});
		expect(vi.getTimerCount()).toBe(0);
	});
});
