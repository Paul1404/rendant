import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { requireTenant, SVU_TENANT_ID } from "@/server/tenant-context";

const mocks = vi.hoisted(() => ({
	execute: vi.fn(),
	error: vi.fn(),
	checkSchema: vi.fn(),
	tenantExecute: vi.fn(),
	controlProbe: vi.fn(),
}));
vi.mock("@/server/auth", () => ({
	auth: { $context: Promise.resolve({ checkSchema: mocks.checkSchema }) },
}));
vi.mock("@/server/db", () => ({
	globalDb: {
		execute: mocks.execute,
		select: () => ({ from: () => ({ limit: mocks.controlProbe }) }),
	},
	db: { execute: mocks.tenantExecute },
}));
vi.mock("@/server/logger", () => ({
	logger: { child: () => ({ error: mocks.error }) },
}));
vi.mock("@/server/services/pdf-health", () => ({
	collectPdfHealthSnapshot: async () => ({ ok: true, latencyMs: 1 }),
}));
import {
	collectAuthReadiness,
	collectHealthSnapshot,
	collectTenantReadiness,
} from "@/server/services/health";

beforeEach(() => {
	vi.useFakeTimers();
	mocks.execute.mockReset();
	mocks.error.mockReset();
	mocks.checkSchema.mockReset();
	mocks.tenantExecute.mockReset();
	mocks.controlProbe.mockReset().mockResolvedValue([]);
});

describe("tenant readiness", () => {
	const physical = {
		global_access: true,
		runtime_role_safe: true,
		business_tables_secure: true,
	};
	const runtime = {
		runtime_role: true,
		tenant_scope: true,
		settings_ready: true,
		foreign_rows_hidden: true,
	};

	it("requires physical isolation and a working restricted runtime query", async () => {
		mocks.execute.mockResolvedValue({ rows: [physical] });
		mocks.tenantExecute.mockResolvedValue({ rows: [runtime] });
		expect(await collectTenantReadiness()).toBe(true);
		expect(mocks.controlProbe).toHaveBeenCalledTimes(3);
		expect(mocks.tenantExecute).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
		const query = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0][0]);
		expect(query.params).toHaveLength(1);
		expect(query.params[0]).toHaveLength(26);
	});

	it("executes lazy database queries inside the tenant context", async () => {
		mocks.execute.mockResolvedValue({ rows: [physical] });
		mocks.tenantExecute.mockImplementation(() => ({
			then(resolve: (value: { rows: typeof runtime[] }) => unknown) {
				expect(requireTenant().id).toBe(SVU_TENANT_ID);
				return Promise.resolve(resolve({ rows: [runtime] }));
			},
		}));
		expect(await collectTenantReadiness()).toBe(true);
	});

	for (const flag of Object.keys(physical)) {
		it(`rejects an invalid physical isolation flag: ${flag}`, async () => {
			mocks.execute.mockResolvedValue({ rows: [{ ...physical, [flag]: false }] });
			expect(await collectTenantReadiness()).toBe(false);
			expect(mocks.tenantExecute).not.toHaveBeenCalled();
			expect(vi.getTimerCount()).toBe(0);
		});
	}

	for (const flag of Object.keys(runtime)) {
		it(`rejects an invalid scoped runtime flag: ${flag}`, async () => {
			mocks.execute.mockResolvedValue({ rows: [physical] });
			mocks.tenantExecute.mockResolvedValue({ rows: [{ ...runtime, [flag]: false }] });
			expect(await collectTenantReadiness()).toBe(false);
			expect(vi.getTimerCount()).toBe(0);
		});
	}

	it("rejects missing control-plane tables or columns", async () => {
		mocks.controlProbe.mockRejectedValue(new Error("missing column"));
		expect(await collectTenantReadiness()).toBe(false);
		expect(mocks.execute).not.toHaveBeenCalled();
	});

	it("bounds a stuck tenant readiness probe", async () => {
		mocks.execute.mockImplementation(() => new Promise(() => {}));
		const ready = collectTenantReadiness();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(await ready).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
	});

	for (const ready of [true, false]) {
		it(`includes tenant readiness in the HTTP verdict: ${ready}`, async () => {
			mocks.checkSchema.mockResolvedValue(undefined);
			mocks.execute.mockResolvedValue({
				rows: [{ ...physical, issuer_optional: true, business_tables_secure: ready }],
			});
			mocks.tenantExecute.mockResolvedValue({ rows: [runtime] });
			const { Route } = await import("@/routes/api/health");
			const route = Route as unknown as {
				options: { server: { handlers: { GET: () => Promise<Response> } } };
			};
			const response = await route.options.server.handlers.GET();
			expect(response.status).toBe(ready ? 200 : 503);
			expect(await response.json()).toMatchObject({
				ok: ready, db: true, auth: true, pdf: true, tenants: ready,
			});
		});
	}
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
