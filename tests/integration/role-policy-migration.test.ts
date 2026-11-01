import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool, type PoolClient } from "pg";
import { expect, it } from "vitest";

async function apply(client: PoolClient, tag: string) {
	const source = await readFile(resolve("drizzle", `${tag}.sql`), "utf8");
	for (const statement of source.split("--> statement-breakpoint")) {
		if (statement.trim()) await client.query(statement);
	}
}

async function originalRows(client: PoolClient) {
	const tables = await client.query<{ name: string }>(
		"select tablename as name from pg_tables where schemaname='public' order by tablename",
	);
	const rows: Record<string, unknown> = {};
	for (const { name } of tables.rows) {
		if (!/^[a-z_]+$/.test(name)) throw new Error("Unexpected fixture table");
		const excluded =
			name === "tenants"
				? " - 'role_permissions' - 'role_permissions_version'"
				: "";
		const data = await client.query<{ rows: unknown }>(
			`select coalesce(jsonb_agg(to_jsonb(t)${excluded} order by (to_jsonb(t)${excluded})::text), '[]'::jsonb) as rows from public."${name}" t`,
		);
		rows[name] = data.rows[0].rows;
	}
	return rows;
}

it("adds configurable roles to a populated 0038 database without changing old rows or financial evidence", async () => {
	if (process.env.RENDANT_INTEGRATION_TEST !== "1")
		throw new Error("Role migration requires an isolated test database");
	const input = new URL(process.env.DATABASE_URL ?? "");
	if (!input.pathname.endsWith("_test"))
		throw new Error("Role migration refuses a non-test database");
	const name = `rendant_roles_${randomUUID().replaceAll("-", "")}_test`;
	const admin = new Pool({ connectionString: input.toString(), max: 1 });
	const url = new URL(input);
	url.pathname = `/${name}`;
	let fixture: Pool | undefined;
	try {
		await admin.query(`create database "${name}"`);
		fixture = new Pool({ connectionString: url.toString(), max: 1 });
		const client = await fixture.connect();
		try {
			const journal = JSON.parse(
				await readFile(resolve("drizzle/meta/_journal.json"), "utf8"),
			) as { entries: { idx: number; tag: string }[] };
			for (const entry of journal.entries.filter((entry) => entry.idx <= 38)) {
				await client.query("begin");
				try {
					await apply(client, entry.tag);
					await client.query("commit");
				} catch (error) {
					await client.query("rollback");
					throw error;
				}
			}
			const migration = journal.entries.find((entry) => entry.idx === 39);
			if (!migration) throw new Error("Role migration 0039 is missing");
			const tenantId = randomUUID();
			const adminId = randomUUID();
			const userId = randomUUID();
			const protocolId = randomUUID();
			await client.query(
				"insert into tenants(id,slug,name) values($1,$2,'Synthetischer Bestandsverein')",
				[tenantId, `roles-${randomUUID()}`],
			);
			await client.query(
				`insert into "user"(id,name,email,role) values
				 ($1,'Bestandsadmin','roles-admin@example.invalid','admin'),
				 ($2,'Bestandsbenutzer','roles-user@example.invalid','user')`,
				[adminId, userId],
			);
			await client.query(
				`insert into tenant_memberships(tenant_id,user_id,role,notify_protokoll) values
				 ($1,$2,'admin',false),($1,$3,'user',true)`,
				[tenantId, adminId, userId],
			);
			await client.query(
				`insert into app_settings(id,tenant_id,vereinsname,smtp_password_enc,sumup_api_key_enc)
				 values(1,$1,'Synthetischer Bestandsverein','opaque-smtp-evidence','opaque-sumup-evidence')`,
				[tenantId],
			);
			await client.query(
				`insert into protokolle(id,tenant_id,belegnummer,anlass_datum,anlass,gezaehlt_von,
				 geprueft_von,wechselgeld_cent,gezaehlt_cent,ausgaben_cent,bestand_cent,
				 tageseinnahmen_cent,pdf_s3_key,pdf_sha256,storniert_am,storno_grund,
				 storno_pdf_s3_key,storno_pdf_sha256)
				 values($1,$2,'ORIGINAL-42','2026-10-31','Synthetischer Anlass','Test','Test',
				 1000,5000,500,5500,4500,'protokolle/original.pdf',$3,now(),
				 'Synthetischer Storno','protokolle/original-storno.pdf',$4)`,
				[protocolId, tenantId, "a".repeat(64), "b".repeat(64)],
			);
			await client.query(
				`insert into ausgaben(tenant_id,protokoll_id,bezeichnung,betrag_cent)
				 values($1,$2,'Synthetischer Beleg',500)`,
				[tenantId, protocolId],
			);
			await client.query(
				"insert into belegnummer_sequences(tenant_id,year,next_sequence) values($1,2026,43)",
				[tenantId],
			);
			await client.query(
				`insert into invitations(tenant_id,email,token,role,expires_at)
				 values($1,'roles-invite@example.invalid',$2,'user',now()+interval '7 days')`,
				[tenantId, randomUUID()],
			);
			// An invalid legacy invitation must fail the entire migration, including
			// the earlier column additions and membership-constraint replacement.
			const badInviteId = randomUUID();
			await client.query(
				`insert into invitations(id,tenant_id,email,token,role,expires_at)
				 values($1,$2,'invalid-legacy@example.invalid',$3,'owner',now()+interval '7 days')`,
				[badInviteId, tenantId, randomUUID()],
			);
			const invalidBefore = await originalRows(client);
			await client.query("begin");
			await expect(apply(client, migration.tag)).rejects.toMatchObject({
				code: "23514",
			});
			await client.query("rollback");
			expect(await originalRows(client)).toEqual(invalidBefore);
			const missingColumns = await client.query(
				"select count(*)::int as count from information_schema.columns where table_name='tenants' and column_name in ('role_permissions','role_permissions_version')",
			);
			expect(missingColumns.rows[0].count).toBe(0);
			await client.query("delete from invitations where id=$1", [badInviteId]);
			const before = await originalRows(client);
			await client.query("begin");
			try {
				await apply(client, migration.tag);
				await client.query("commit");
			} catch (error) {
				await client.query("rollback");
				throw error;
			}
			expect(await originalRows(client)).toEqual(before);
			const policy = await client.query(
				"select role_permissions,role_permissions_version from tenants where id=$1",
				[tenantId],
			);
			expect(policy.rows).toEqual([
				{ role_permissions: {}, role_permissions_version: 1 },
			]);
			// Old application inserts remain valid until the new app starts.
			await client.query(
				"insert into tenants(id,slug,name) values($1,$2,'Synthetischer neuer Verein')",
				[randomUUID(), `new-roles-${randomUUID()}`],
			);
			await client.query(
				"update tenant_memberships set role='board' where tenant_id=$1 and user_id=$2",
				[tenantId, userId],
			);
			await client.query(
				"update invitations set role='board' where tenant_id=$1",
				[tenantId],
			);
			await expect(
				client.query(
					"update tenant_memberships set role='owner' where tenant_id=$1",
					[tenantId],
				),
			).rejects.toMatchObject({ code: "23514" });
			await expect(
				client.query("update invitations set role='owner' where tenant_id=$1", [
					tenantId,
				]),
			).rejects.toMatchObject({ code: "23514" });
			await expect(
				client.query(
					"update tenants set role_permissions_version=0 where id=$1",
					[tenantId],
				),
			).rejects.toMatchObject({ code: "23514" });
			await expect(
				client.query(
					"update tenants set role_permissions='[]'::jsonb where id=$1",
					[tenantId],
				),
			).rejects.toMatchObject({ code: "23514" });
			await expect(
				client.query("update tenants set role_permissions=null where id=$1", [
					tenantId,
				]),
			).rejects.toMatchObject({ code: "23502" });
			await client.query("begin");
			await client.query("set local role rendant_tenant");
			await expect(
				client.query("select role_permissions from tenants"),
			).rejects.toMatchObject({ code: "42501" });
			await client.query("rollback");
		} finally {
			client.release();
		}
	} finally {
		await fixture?.end();
		await admin.query(`drop database if exists "${name}" with (force)`);
		await admin.end();
	}
});
