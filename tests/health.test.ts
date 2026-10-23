import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execute: vi.fn(),
	error: vi.fn(),
	checkSchema: vi.fn(),
}));
vi.mock("@/server/auth", () => ({
	auth: { $context: Promise.resolve({ checkSchema: mocks.checkSchema }) },
}));
vi.mock("@/server/db", () => ({
	db: {
		execute: mocks.execute,
		select: () => ({ from: () => ({ limit: async () => [] }) }),
	},
}));
vi.mock("@/server/logger", () => ({
	logger: { child: () => ({ error: mocks.error }) },
}));
import {
	collectAuthReadiness,
	collectHealthSnapshot,
} from "@/server/services/health";

beforeEach(() => {
	vi.useFakeTimers();
	mocks.execute.mockReset();
	mocks.error.mockReset();
	mocks.checkSchema.mockReset();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("database readiness without external telemetry", () => {
	it("requires an authentication schema that accepts the current runtime", async () => {
		mocks.checkSchema.mockResolvedValue(undefined);
		mocks.execute.mockResolvedValue({ rows: [{ issuer_optional: true }] });
		expect(await collectAuthReadiness()).toBe(true);
		mocks.checkSchema.mockRejectedValue(new Error("private schema details"));
		expect(await collectAuthReadiness()).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("rejects a live issuer constraint even if the declared model is compatible", async () => {
		mocks.checkSchema.mockResolvedValue(undefined);
		mocks.execute.mockResolvedValue({ rows: [{ issuer_optional: false }] });
		expect(await collectAuthReadiness()).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("bounds a stuck authentication schema check", async () => {
		mocks.checkSchema.mockImplementation(() => new Promise(() => {}));
		const ready = collectAuthReadiness();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(await ready).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
	});

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
