import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EMPTY_VEREIN_STAMMDATEN } from "@/lib/verein";
import { db, globalDb, pool } from "@/server/db";
import { user } from "@/server/db/auth-schema";
import { appSettings, auditEvents, helperHourCategories, protokolle } from "@/server/db/schema";
import { memberships, tenants } from "@/server/db/tenant-schema";
import { getSettingsStamp, getVereinsname, getVereinStammdaten, SettingsConcurrencyError, updateVereinStammdaten } from "@/server/services/settings";
import { createTenant, listUserTenants, resolveHostTenant } from "@/server/services/tenants";
import { SVU_TENANT_ID, withTenant, type TenantContext } from "@/server/tenant-context";

const runId = randomUUID();
const clubA: TenantContext = { id: randomUUID(), slug: `audit-a-${runId}`, name: "Synthetischer Prüfverein A", role: "admin" };
const clubB: TenantContext = { id: randomUUID(), slug: `audit-b-${runId}`, name: "Synthetischer Prüfverein B", role: "admin" };
const actor = { id: randomUUID(), email: `audit-${runId}@example.invalid`, name: "Synthetische Administration", role: "admin" };
const audit = { category: "settings" as const, action: "settings.verein_changed", actor };
const data = (name: string) => ({ ...EMPTY_VEREIN_STAMMDATEN, name, strasse: "Synthetische Straße 1", ort: "Testort" });

async function snapshot(club: TenantContext) {
	const [registry] = await globalDb.select().from(tenants).where(eq(tenants.id, club.id));
	return withTenant(club, async () => ({ registry, settings: await db.select().from(appSettings), protocols: await db.select().from(protokolle), audit: await db.select().from(auditEvents) }));
}

beforeAll(async () => {
	if (process.env.RENDANT_INTEGRATION_TEST !== "1") throw new Error("Audit regressions require an isolated test database");
	const database = await pool.query<{ name: string }>("select current_database() as name");
	if (database.rows[0]?.name !== "rendant_test") throw new Error("Audit regressions refuse any database other than rendant_test");
	vi.stubEnv("TENANT_BASE_DOMAIN", "rendant.app");
	vi.stubEnv("TENANT_HOST_ALIASES_JSON", "");
	vi.stubEnv("TENANT_CANONICAL_HOSTS_JSON", JSON.stringify({ svu: "sv-untereuerheim.rendant.app" }));
	vi.stubEnv("PLATFORM_ADMIN_EMAILS", actor.email);
	await globalDb.insert(user).values({ ...actor, emailVerified: true });
	await globalDb.insert(tenants).values([clubA, clubB]);
	await globalDb.insert(memberships).values([clubA, clubB].map((club) => ({ tenant_id: club.id, user_id: actor.id, role: "admin" as const })));
	await globalDb.insert(memberships).values({ tenant_id: SVU_TENANT_ID, user_id: actor.id, role: "admin" });
	for (const club of [clubA, clubB]) await withTenant(club, async () => {
		await db.insert(appSettings).values({ id: 1, vereinsname: club.name });
		await db.insert(protokolle).values({ belegnummer: "01", anlass_datum: "2026-11-01", anlass: "Synthetischer Anlass", gezaehlt_von: "Test", geprueft_von: "Test", wechselgeld_cent: 0, gezaehlt_cent: 100, ausgaben_cent: 0, bestand_cent: 100, tageseinnahmen_cent: 100, pdf_s3_key: `tenants/${club.id}/protokolle/synthetic.pdf`, pdf_sha256: "a".repeat(64) });
	});
});

afterAll(async () => {
	vi.unstubAllEnvs();
	// Retain synthetic fixtures and their immutable audit records in the disposable database.
	await pool.end();
});

describe("tenant audit fixes on PostgreSQL", () => {
	it("synchronizes ordinary club settings with registry, public branding and memberships without touching booked documents or another club", async () => {
		const otherBefore = await snapshot(clubB);
		const before = await snapshot(clubA);
		await withTenant(clubA, () => updateVereinStammdaten(data("Geänderter synthetischer Prüfverein"), audit, before.settings[0].verein_updated_at.toISOString()));
		const after = await snapshot(clubA);
		expect(after.registry.name).toBe("Geänderter synthetischer Prüfverein");
		expect(await withTenant(clubA, getVereinsname)).toBe(after.registry.name);
		expect(await withTenant(clubA, getVereinStammdaten)).toEqual(data(after.registry.name));
		expect(await resolveHostTenant(new Headers({ host: `${clubA.slug}.rendant.app` }))).toMatchObject({ id: clubA.id, name: after.registry.name });
		expect((await listUserTenants(actor.id)).find((club) => club.id === clubA.id)?.name).toBe(after.registry.name);
		expect(after.protocols).toEqual(before.protocols);
		expect(after.audit).toHaveLength(before.audit.length + 1);
		expect(await snapshot(clubB)).toEqual(otherBefore);
	});

	it("rejects stale stamps without changing registry, settings or audit", async () => {
		const before = await snapshot(clubA);
		await expect(withTenant(clubA, () => updateVereinStammdaten(data("Veralteter Schreibversuch"), audit, "2000-01-01T00:00:00.000Z"))).rejects.toBeInstanceOf(SettingsConcurrencyError);
		expect(await snapshot(clubA)).toEqual(before);
	});

	it("rechecks revoked roles, club bans and global bans despite an admin audit actor", async () => {
		for (const change of [{ role: "user" as const }, { banned: true }, { globalBan: true }]) {
			const before = await snapshot(clubA);
			try {
				if ("globalBan" in change) await globalDb.update(user).set({ banned: true }).where(eq(user.id, actor.id));
				else await globalDb.update(memberships).set(change).where(and(eq(memberships.tenant_id, clubA.id), eq(memberships.user_id, actor.id)));
				await expect(withTenant(clubA, () => updateVereinStammdaten(data("Unzulässiger Schreibversuch"), audit))).rejects.toMatchObject({ code: "FORBIDDEN" });
			} finally {
				await globalDb.update(user).set({ banned: false }).where(eq(user.id, actor.id));
				await globalDb.update(memberships).set({ role: "admin", banned: false }).where(and(eq(memberships.tenant_id, clubA.id), eq(memberships.user_id, actor.id)));
			}
			expect(await snapshot(clubA)).toEqual(before);
		}
	});

	it("rolls back the earlier settings update when the later registry constraint fails", async () => {
		const before = await snapshot(clubA);
		// app_settings accepts this text. The later tenants_name_check rejects it,
		// exercising a real PostgreSQL failure after the first representation changed.
		await expect(withTenant(clubA, () => updateVereinStammdaten(data("x".repeat(121)), audit))).rejects.toMatchObject({ cause: expect.objectContaining({ constraint: "tenants_name_check", code: "23514" }) });
		expect(await snapshot(clubA)).toEqual(before);
	});

	it("preserves the SVU admin MCP settings path and denies a synthetic MCP actor in another club", async () => {
		const mcpAudit = { ...audit, actor: { ...actor, id: "mcp:codex" } };
		const svu = { id: SVU_TENANT_ID, slug: "svu", name: "SVU", role: "admin" as const };
		const [original] = await globalDb.select().from(appSettings).where(and(eq(appSettings.tenant_id, SVU_TENANT_ID), eq(appSettings.id, 1)));
		const [registry] = await globalDb.select().from(tenants).where(eq(tenants.id, SVU_TENANT_ID));
		const originalData = await withTenant(svu, getVereinStammdaten);
		try {
			expect(await withTenant(svu, () => updateVereinStammdaten(originalData, mcpAudit))).toEqual(originalData);
			expect(await withTenant(svu, () => getSettingsStamp("verein_updated_at"))).toBeDefined();
		} finally {
			await globalDb.transaction(async (tx) => {
				await tx.update(tenants).set({ name: registry.name }).where(eq(tenants.id, SVU_TENANT_ID));
				await tx.update(appSettings).set(original).where(and(eq(appSettings.tenant_id, SVU_TENANT_ID), eq(appSettings.id, 1)));
			});
		}
		const before = await snapshot(clubA);
		await expect(withTenant(clubA, () => updateVereinStammdaten(data("MCP vereinsfremd"), mcpAudit))).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(await snapshot(clubA)).toEqual(before);
	});

	it("rejects a reserved vanity label before creating tenant or dependent rows", async () => {
		const before = await globalDb.select({ id: tenants.id }).from(tenants);
		await expect(createTenant({ name: "Kollidierender synthetischer Verein", slug: "sv-untereuerheim", actor })).rejects.toMatchObject({ code: "CONFLICT" });
		expect(await globalDb.select({ id: tenants.id }).from(tenants)).toEqual(before);
		expect(await globalDb.select().from(tenants).where(eq(tenants.slug, "sv-untereuerheim"))).toEqual([]);
	});

	it("still provisions an ordinary fresh slug with complete tenant defaults and an approved operator", async () => {
		const created = await createTenant({ name: "Synthetischer neuer Prüfverein", slug: `fresh-${runId}`, actor, grantCreatorMembership: false });
		expect(await resolveHostTenant(new Headers({ host: `${created.slug}.rendant.app` }))).toMatchObject({ id: created.id, name: created.name });
		await withTenant(created, async () => {
			expect(await db.select().from(appSettings)).toHaveLength(1);
			expect(await db.select().from(helperHourCategories)).toHaveLength(1);
			expect(await db.select().from(auditEvents)).toHaveLength(1);
		});
		expect(await globalDb.select().from(memberships).where(eq(memberships.tenant_id, created.id))).toEqual([]);
	});
});
