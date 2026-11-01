import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool, type PoolClient } from "pg";
import { describe, expect, it } from "vitest";

const SVU = "00000000-0000-4000-8000-000000000001";

async function applySql(client: PoolClient, tag: string): Promise<void> {
	const source = await readFile(resolve("drizzle", `${tag}.sql`), "utf8");
	for (const statement of source.split("--> statement-breakpoint")) {
		if (statement.trim()) await client.query(statement);
	}
}

async function snapshot(client: PoolClient, tables: string[]) {
	const rows: Record<string, unknown> = {};
	for (const table of tables) {
		if (!/^[a-z_]+$/.test(table)) throw new Error("Unexpected fixture table");
		const result = await client.query<{ rows: unknown }>(
			`select coalesce(jsonb_agg(to_jsonb(t) - 'tenant_id' order by (to_jsonb(t) - 'tenant_id')::text), '[]'::jsonb) as rows from public."${table}" t`,
		);
		rows[table] = result.rows[0].rows;
	}
	return rows;
}

describe("populated SVU migration rehearsal", () => {
	it("preserves every existing row and value while adding tenant ownership", async () => {
		if (process.env.RENDANT_INTEGRATION_TEST !== "1") {
			throw new Error("Migration rehearsal requires an isolated test database");
		}
		const inputUrl = new URL(process.env.DATABASE_URL ?? "");
		if (!inputUrl.pathname.endsWith("_test")) {
			throw new Error("Migration rehearsal refuses a non-test database");
		}
		const fixtureName = `rendant_migration_${randomUUID().replaceAll("-", "")}_test`;
		const admin = new Pool({ connectionString: inputUrl.toString(), max: 1 });
		const fixtureUrl = new URL(inputUrl);
		fixtureUrl.pathname = `/${fixtureName}`;
		let fixture: Pool | undefined;
		try {
			await admin.query(`create database "${fixtureName}"`);
			fixture = new Pool({ connectionString: fixtureUrl.toString(), max: 1 });
			const client = await fixture.connect();
			try {
				const journal = JSON.parse(
					await readFile(resolve("drizzle/meta/_journal.json"), "utf8"),
				) as { entries: { idx: number; tag: string }[] };
				for (const entry of journal.entries.filter(
					(entry) => entry.idx <= 37,
				)) {
					await applySql(client, entry.tag);
				}
				const userId = randomUUID();
				const protocolId = randomUUID();
				const eventId = randomUUID();
				const personId = randomUUID();
				const helperId = randomUUID();
				await client.query(
					`insert into public."user" (id, name, email, email_verified, role, notify_protokoll)
					 values ($1, 'Synthetischer SVU Admin', 'svu-migration@example.invalid', true, 'admin', false)`,
					[userId],
				);
				await client.query(
					`insert into account (id, account_id, provider_id, user_id, password, issuer, updated_at)
					 values ($1, $2, 'credential', $2, 'opaque-original-password-hash', 'legacy:credential', now())`,
					[randomUUID(), userId],
				);
				await client.query(
					`insert into app_settings (id, vereinsname, smtp_password_enc, sumup_api_key_enc)
					 values (1, 'SVU Synthetische Bestandsdaten', 'opaque-original-smtp', 'opaque-original-sumup')
					 on conflict (id) do update set vereinsname = excluded.vereinsname,
					 smtp_password_enc = excluded.smtp_password_enc, sumup_api_key_enc = excluded.sumup_api_key_enc`,
				);
				await client.query(
					`insert into protokolle (id, belegnummer, anlass_datum, anlass, gezaehlt_von,
					 geprueft_von, wechselgeld_cent, gezaehlt_cent, ausgaben_cent, bestand_cent,
					 tageseinnahmen_cent, pdf_s3_key, pdf_sha256, storniert_am, storno_grund,
					 storno_pdf_s3_key, storno_pdf_sha256)
					 values ($1, 'SVU-ORIGINAL-42', '2026-10-31', 'Synthetischer Altbestand',
					 'Test', 'Test', 1000, 5000, 500, 5500, 4500,
					 'protokolle/legacy-original.pdf', $2, now(), 'Synthetischer Storno',
					 'protokolle/legacy-STORNO.pdf', $3)`,
					[protocolId, "a".repeat(64), "b".repeat(64)],
				);
				await client.query(
					`insert into ausgaben (protokoll_id, bezeichnung, betrag_cent)
					 values ($1, 'Synthetischer Beleg', 500)`,
					[protocolId],
				);
				await client.query(
					`insert into belegnummer_sequences (year, next_sequence) values (2026, 43)`,
				);
				await client.query(
					`insert into historical_source_archives (sha256, object_key, original_filename,
					 content_type, size_bytes, archived_by_user_id, archived_by_name)
					 values ($1, 'historical-sources/legacy.pdf', 'Altbestand.pdf', 'application/pdf', 100, $2, 'Test')`,
					["c".repeat(64), userId],
				);
				await client.query(
					`insert into historical_revenues (idempotency_key, anlass_datum, anlass, vergleichsgruppe,
					 umsatz_cent, ausgaben_cent, erstellt_von_user_id, erstellt_von_name, erstellt_von_email,
					 quelle_sha256, quelle_pfad, quelle_format)
					 values ($1, '2025-06-01', 'Synthetischer Vorjahresumsatz', 'Sonstiges', 12345, 345,
					 $2, 'Test', 'svu-migration@example.invalid', $3, 'Altbestand.xlsx', 'xlsx')`,
					[randomUUID(), userId, "c".repeat(64)],
				);
				await client.query(
					`insert into helper_hour_events (id, name) values ($1, 'Synthetischer Anlass')`,
					[eventId],
				);
				await client.query(
					`insert into helper_hour_persons (id, nachname, vorname) values ($1, 'Muster', 'Alex')`,
					[personId],
				);
				await client.query(
					`insert into helper_hours (id, idempotency_key, datum, veranstaltung, nachname, vorname,
					 person_id, veranstaltung_id, gemeldete_summe_minuten, erstellt_von_user_id, erstellt_von_name)
					 values ($1, $2, '2026-10-31', 'Synthetischer Anlass', 'Muster', 'Alex', $3, $4, 120, $5, 'Test')`,
					[helperId, randomUUID(), personId, eventId, userId],
				);
				await client.query(
					`insert into helper_hour_allocations (helper_hour_id, kategorie_id, minuten)
					 select $1, id, 120 from helper_hour_categories order by sortierung limit 1`,
					[helperId],
				);
				await client.query(
					`insert into invitations (email, token, role, expires_at)
					 values ('future@example.invalid', $1, 'user', now() + interval '7 days')`,
					[randomUUID()],
				);
				const tableRows = await client.query<{ table_name: string }>(
					"select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name",
				);
				const tableNames = tableRows.rows.map((row) => row.table_name);
				const before = await snapshot(client, tableNames);
				await client.query("begin");
				try {
					await applySql(client, "0038_shared_tenants");
					await client.query("commit");
				} catch (error) {
					await client.query("rollback");
					throw error;
				}
				expect(await snapshot(client, tableNames)).toEqual(before);
				const member = await client.query(
					"select tenant_id, role, notify_protokoll from tenant_memberships where user_id = $1",
					[userId],
				);
				expect(member.rows).toEqual([
					{ tenant_id: SVU, role: "admin", notify_protokoll: false },
				]);
				const ownership = await client.query<{ table_name: string }>(
					"select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenant_id' and table_name <> 'tenant_memberships' order by table_name",
				);
				for (const { table_name: table } of ownership.rows) {
					if (!/^[a-z_]+$/.test(table))
						throw new Error("Unexpected fixture table");
					const result = await client.query<{ foreign_rows: number }>(
						`select count(*)::int as foreign_rows from public."${table}" where tenant_id is distinct from $1::uuid`,
						[SVU],
					);
					expect(result.rows[0].foreign_rows, table).toBe(0);
				}
			} finally {
				client.release();
			}
		} finally {
			await fixture?.end();
			await admin.query(
				`drop database if exists "${fixtureName}" with (force)`,
			);
			await admin.end();
		}
	}, 90_000);
});
