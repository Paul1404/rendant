import type { Pool, PoolClient } from "pg";
import { requireTenant } from "@/server/tenant-context";

// Every standalone query gets a short transaction. Explicit Drizzle transactions
// retain the same connection and set their context immediately after BEGIN.
// SET LOCAL resets both role and tenant on commit/rollback, including pool reuse.
export function tenantPool(pool: Pool): Pool {
	async function configure(
		client: PoolClient,
		tenantId: string,
	): Promise<void> {
		await client.query("set local role rendant_tenant");
		await client.query("select set_config('app.tenant_id', $1, true)", [
			tenantId,
		]);
	}
	const query = (async (...args: unknown[]) => {
		const tenant = requireTenant();
		const client = await pool.connect();
		let broken = false;
		try {
			await client.query("begin");
			await configure(client, tenant.id);
			const result = await Reflect.apply(client.query, client, args);
			await client.query("commit");
			return result;
		} catch (error) {
			await client.query("rollback").catch(() => {
				broken = true;
			});
			throw error;
		} finally {
			client.release(broken);
		}
	}) as Pool["query"];
	const connect = (async () => {
		const tenant = requireTenant();
		const client = await pool.connect();
		let active = false;
		let broken = false;
		let released = false;
		function release(error?: Error | boolean): void {
			if (released) return;
			released = true;
			// Never hand an open or failed transaction back to an auth/global query.
			client.release(error || broken || active);
		}
		return new Proxy(client, {
			get(target, property) {
				if (property === "release") return release;
				if (property === "query") {
					return async (...args: unknown[]) => {
						if (released)
							throw new Error("Datenbankverbindung bereits freigegeben");
						const first = args[0];
						const text =
							typeof first === "string"
								? first
								: (first as { text?: string })?.text;
						if (text && /^begin\b/i.test(text.trim())) {
							if (active)
								throw new Error("Datenbanktransaktion bereits geöffnet");
							try {
								const result = await Reflect.apply(target.query, target, args);
								active = true;
								await configure(target, tenant.id);
								return result;
							} catch (error) {
								await target.query("rollback").catch(() => undefined);
								release(true);
								throw error;
							}
						}
						if (!active) throw new Error("Datenbanktransaktion fehlt");
						if (text && /^(commit|rollback)\s*;?\s*$/i.test(text.trim())) {
							try {
								const result = await Reflect.apply(target.query, target, args);
								active = false;
								return result;
							} catch (error) {
								broken = true;
								throw error;
							}
						}
						return Reflect.apply(target.query, target, args);
					};
				}
				const value = Reflect.get(target, property, target);
				return typeof value === "function" ? value.bind(target) : value;
			},
		});
	}) as Pool["connect"];
	return new Proxy(pool, {
		get(target, property) {
			if (property === "query") return query;
			if (property === "connect") return connect;
			const value = Reflect.get(target, property, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
}
