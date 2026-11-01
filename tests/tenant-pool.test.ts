import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { tenantPool } from "@/server/db/tenant-pool";
import { SVU_TENANT_ID, withTenant } from "@/server/tenant-context";

const svu = { id: SVU_TENANT_ID, slug: "svu", name: "SVU" };
const second = {
	id: "00000000-0000-4000-8000-000000000002",
	slug: "second",
	name: "Second club",
};

function fixture(fail?: (text: string) => Error | undefined) {
	const query = vi.fn(async (input: string | { text: string }, _params?: unknown[]) => {
		const text = typeof input === "string" ? input : input.text;
		const error = fail?.(text);
		if (error) throw error;
		return { rows: [{ value: text }], rowCount: 1 };
	});
	const release = vi.fn();
	const client = { query, release } as unknown as PoolClient;
	const connect = vi.fn(async () => client);
	const pool = tenantPool({ connect } as unknown as Pool);
	return { pool, connect, query, release };
}

describe("tenant database connection safety", () => {
	it("rejects missing tenant context before taking a connection", async () => {
		const { pool, connect } = fixture();
		await expect(pool.query("select 1")).rejects.toThrow("Vereinskontext fehlt");
		await expect(pool.connect()).rejects.toThrow("Vereinskontext fehlt");
		expect(connect).not.toHaveBeenCalled();
	});

	it("sets a restricted role and tenant inside every standalone query transaction", async () => {
		const { pool, query, release } = fixture();
		await withTenant(svu, () => pool.query("select 1"));
		await withTenant(second, () => pool.query("select 2"));
		expect(query.mock.calls).toEqual([
			["begin"],
			["set local role rendant_tenant"],
			["select set_config('app.tenant_id', $1, true)", [svu.id]],
			["select 1"],
			["commit"],
			["begin"],
			["set local role rendant_tenant"],
			["select set_config('app.tenant_id', $1, true)", [second.id]],
			["select 2"],
			["commit"],
		]);
		expect(release.mock.calls).toEqual([[false], [false]]);
	});

	it("rolls back a failed standalone query before reuse", async () => {
		const failure = new Error("query failed");
		const { pool, query, release } = fixture((text) => text === "select failure" ? failure : undefined);
		await expect(withTenant(svu, () => pool.query("select failure"))).rejects.toBe(failure);
		expect(query).toHaveBeenLastCalledWith("rollback");
		expect(release).toHaveBeenCalledWith(false);
	});

	it("destroys a standalone connection when rollback fails", async () => {
		const { pool, release } = fixture((text) =>
			text === "select failure" || text === "rollback" ? new Error(text) : undefined,
		);
		await expect(withTenant(svu, () => pool.query("select failure"))).rejects.toThrow("select failure");
		expect(release).toHaveBeenCalledWith(true);
	});

	it("releases a failed BEGIN configuration even before Drizzle enters its transaction try block", async () => {
		const { pool, query, release } = fixture((text) =>
			text === "set local role rendant_tenant" ? new Error("role denied") : undefined,
		);
		const client = await withTenant(svu, () => pool.connect());
		await expect(client.query("begin")).rejects.toThrow("role denied");
		expect(query).toHaveBeenLastCalledWith("rollback");
		expect(release).toHaveBeenCalledExactlyOnceWith(true);
		client.release();
		expect(release).toHaveBeenCalledTimes(1);
	});

	it("destroys an explicit transaction connection when rollback fails", async () => {
		const { pool, release } = fixture((text) => text === "rollback" ? new Error("connection lost") : undefined);
		const client = await withTenant(svu, () => pool.connect());
		await client.query("begin");
		await expect(client.query("rollback")).rejects.toThrow("connection lost");
		client.release();
		expect(release).toHaveBeenCalledExactlyOnceWith(true);
	});

	it("destroys an abandoned open transaction instead of exposing it to the next borrower", async () => {
		const { pool, release } = fixture();
		const client = await withTenant(svu, () => pool.connect());
		await client.query("begin");
		client.release();
		expect(release).toHaveBeenCalledExactlyOnceWith(true);
	});

	it("holds the acquisition tenant through a transaction and permits nested savepoints", async () => {
		const { pool, query, release } = fixture();
		const client = await withTenant(svu, () => pool.connect());
		await withTenant(second, async () => {
			await client.query({ text: "begin isolation level serializable" });
			await client.query("savepoint sp1");
			await client.query("rollback to savepoint sp1");
			await client.query("commit");
		});
		client.release();
		expect(query).toHaveBeenCalledWith("select set_config('app.tenant_id', $1, true)", [svu.id]);
		expect(release).toHaveBeenCalledExactlyOnceWith(false);
	});

	it("prevents raw checked-out queries before BEGIN and after commit", async () => {
		const { pool, query } = fixture();
		const client = await withTenant(svu, () => pool.connect());
		await expect(client.query("select 1")).rejects.toThrow("Datenbanktransaktion fehlt");
		expect(query).not.toHaveBeenCalled();
		await client.query("begin");
		await client.query("commit");
		await expect(client.query("select 2")).rejects.toThrow("Datenbanktransaktion fehlt");
		client.release();
		await expect(client.query("begin")).rejects.toThrow("bereits freigegeben");
	});
});
