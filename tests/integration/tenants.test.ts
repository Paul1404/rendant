import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth } from "@/server/auth";
import { type DbOrTx, db, globalDb, pool } from "@/server/db";
import { account, user } from "@/server/db/auth-schema";
import {
	anlassAliase,
	anlassKatalog,
	appSettings,
	belegnummerSequences,
	cashRegisters,
	helperHourPersons,
	historicalSourceArchives,
	protokolle,
} from "@/server/db/schema";
import { memberships, tenants } from "@/server/db/tenant-schema";
import { ensureCredentialUser } from "@/server/services/auth-accounts";
import { nextBelegnummerInTx } from "@/server/services/belegnummer";
import {
	acceptInvite,
	createInvite,
	InviteAlreadyRegisteredError,
} from "@/server/services/invitations";
import { listOptedInUserEmails } from "@/server/services/notification-prefs";
import { inviteOperatorMember, setOperatorMemberRole } from "@/server/services/operators";
import { getProtokoll } from "@/server/services/protokoll";
import {
	listTenantUsers,
	resolveTenantSession,
	setTenantUserBanned,
	setTenantUserRole,
	TenantAccessError,
} from "@/server/services/tenants";
import {
	SVU_TENANT_ID,
	type TenantContext,
	withTenant,
} from "@/server/tenant-context";

const runId = randomUUID();
const clubA: TenantContext = {
	id: randomUUID(),
	slug: `isolation-a-${runId}`,
	name: "Synthetischer Verein A",
};
const clubB: TenantContext = {
	id: randomUUID(),
	slug: `isolation-b-${runId}`,
	name: "Synthetischer Verein B",
};
const clubs = [clubA, clubB];
const protocolIds = new Map<string, string>();
const catalogIds = new Map<string, string>();
const password = "tenant-isolation-synthetic-password";
let memberId: string;
let outsiderId: string;
let memberCookie: string;
let outsiderCookie: string;
const memberEmail = `member-${runId}@example.invalid`;
const outsiderEmail = `outsider-${runId}@example.invalid`;
const operators = ["a", "b"].map((label) => ({ id: randomUUID(), email: `isolation-operator-${label}-${runId}@example.invalid`, name: `Synthetischer Betreiber ${label}`, role: "user" }));

async function withEnvironment<T>(overrides: Record<string, string>, work: () => Promise<T>): Promise<T> {
	const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
	Object.assign(process.env, overrides);
	try { return await work(); }
	finally {
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

function withOperators<T>(work: () => Promise<T>): Promise<T> {
	return withEnvironment({ PLATFORM_ADMIN_EMAILS: operators.map((operator) => operator.email).join(",") }, work);
}

async function signInCookie(email: string): Promise<string> {
	const baseUrl = process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000";
	const response = await auth.handler(
		new Request(`${baseUrl}/api/auth/sign-in/email`, {
			method: "POST",
			headers: { "content-type": "application/json", origin: baseUrl },
			body: JSON.stringify({ email, password }),
		}),
	);
	expect(response.status).toBe(200);
	return response.headers
		.getSetCookie()
		.map((value) => value.split(";")[0])
		.join("; ");
}

beforeAll(async () => {
	if (process.env.RENDANT_INTEGRATION_TEST !== "1") {
		throw new Error("Tenant isolation tests require an isolated test database");
	}
	const result = await pool.query<{ name: string }>(
		"select current_database() as name",
	);
	if (!result.rows[0]?.name.endsWith("_test")) {
		throw new Error("Tenant tests refuse a database without _test suffix");
	}
	await globalDb.insert(tenants).values(clubs);
	await globalDb.insert(user).values(operators.map((operator) => ({ ...operator, emailVerified: true })));
	await globalDb.insert(memberships).values(operators.map((operator) => ({ tenant_id: SVU_TENANT_ID, user_id: operator.id, role: "admin" as const })));
	memberId = (
		await ensureCredentialUser({
			email: memberEmail,
			name: "Gemeinsames Mitglied",
			password,
			role: "admin",
		})
	).id;
	outsiderId = (
		await ensureCredentialUser({
			email: outsiderEmail,
			name: "Nur Verein A",
			password,
			role: "admin",
		})
	).id;
	await globalDb.insert(memberships).values([
		{ tenant_id: clubA.id, user_id: memberId, role: "admin" },
		{ tenant_id: clubB.id, user_id: memberId, role: "user" },
		{ tenant_id: clubA.id, user_id: outsiderId, role: "user" },
	]);
	memberCookie = await signInCookie(memberEmail);
	outsiderCookie = await signInCookie(outsiderEmail);
	for (const club of clubs) {
		await withTenant(club, async () => {
			await db.insert(appSettings).values({ id: 1, vereinsname: club.name });
			const [catalog] = await db
				.insert(anlassKatalog)
				.values({ name: "Gleicher Anlass" })
				.returning();
			catalogIds.set(club.id, catalog.id);
			await db.insert(cashRegisters).values({
				kassennummer: "1",
				kassenbezeichnung: club.name,
			});
			await db.insert(helperHourPersons).values({
				nachname: "Muster",
				vorname: "Alex",
			});
			await db.insert(historicalSourceArchives).values({
				sha256: "a".repeat(64),
				object_key: `tenants/${club.id}/historical-sources/synthetic.pdf`,
				original_filename: "Synthetisch.pdf",
				content_type: "application/pdf",
				size_bytes: 100,
				archived_by_user_id: memberId,
				archived_by_name: "Integration",
			});
			const [protocol] = await db
				.insert(protokolle)
				.values({
					belegnummer: "01",
					idempotency_key: runId,
					anlass_datum: "2026-11-01",
					anlass: club.name,
					anlass_katalog_id: catalog.id,
					gezaehlt_von: "Integration",
					geprueft_von: "Integration",
					wechselgeld_cent: 0,
					gezaehlt_cent: 1200,
					ausgaben_cent: 0,
					bestand_cent: 1200,
					tageseinnahmen_cent: 1200,
				})
				.returning();
			protocolIds.set(club.id, protocol.id);
		});
	}
}, 30_000);

afterAll(async () => {
	// Records live only in the disposable *_test database. Keep the audit trail
	// intact instead of disabling its append-only protection for fixture cleanup.
	await pool.end();
});

describe("PostgreSQL tenant isolation", () => {
	it("rejects business queries without an explicit tenant", async () => {
		await expect(async () =>
			db.select().from(appSettings),
		).rejects.toMatchObject({
			cause: expect.objectContaining({ message: "Vereinskontext fehlt" }),
		});
	});

	it("uses a restricted role even when the connection owner is a superuser", async () => {
		await withTenant(clubA, async () => {
			const result = await db.execute<{
				role: string;
				tenant: string;
				superuser: boolean;
				bypass: boolean;
			}>(sql`
				select current_user as role, current_setting('app.tenant_id') as tenant,
					rolsuper as superuser, rolbypassrls as bypass
				from pg_roles where rolname = current_user
			`);
			expect(result.rows).toEqual([
				{
					role: "rendant_tenant",
					tenant: clubA.id,
					superuser: false,
					bypass: false,
				},
			]);
			await expect(
				db.execute(sql`select * from public."user"`),
			).rejects.toThrow();
			await expect(
				db.execute(sql`select * from public.tenant_memberships`),
			).rejects.toThrow();
		});
	});

	it("forces RLS on every tenant-owned business table", async () => {
		const result = await globalDb.execute<{
			table_name: string;
			row_security: boolean;
			forced: boolean;
			policies: number;
		}>(sql`
			select c.relname as table_name, c.relrowsecurity as row_security,
				c.relforcerowsecurity as forced,
				(select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies
			from pg_class c join pg_namespace n on n.oid = c.relnamespace
			join information_schema.columns col
				on col.table_schema = n.nspname and col.table_name = c.relname
			where n.nspname = 'public' and col.column_name = 'tenant_id'
				and c.relname <> 'tenant_memberships'
		`);
		expect(result.rows.length).toBeGreaterThanOrEqual(26);
		for (const row of result.rows) {
			expect(row, row.table_name).toMatchObject({
				row_security: true,
				forced: true,
				policies: 1,
			});
		}
	});

	it("permits identical local names, receipt numbers, source hashes and counters", async () => {
		for (const club of clubs) {
			await withTenant(club, async () => {
				expect(await db.select().from(appSettings)).toMatchObject([
					{ tenant_id: club.id, id: 1, vereinsname: club.name },
				]);
				expect(await db.select().from(protokolle)).toMatchObject([
					{ tenant_id: club.id, belegnummer: "01", idempotency_key: runId },
				]);
				expect(await db.select().from(historicalSourceArchives)).toHaveLength(
					1,
				);
				expect(await db.select().from(helperHourPersons)).toHaveLength(1);
				const number = await db.transaction((tx) =>
					nextBelegnummerInTx(tx, 2026),
				);
				expect(number).toBe("02");
				expect(await db.select().from(belegnummerSequences)).toMatchObject([
					{ tenant_id: club.id, year: 2026, next_sequence: 3 },
				]);
			});
		}
	});

	it("hides foreign IDs from services and prevents update or delete by ID", async () => {
		await withTenant(clubA, async () => {
			const foreignId = protocolIds.get(clubB.id) as string;
			expect(await getProtokoll(foreignId)).toBeNull();
			expect(
				await db
					.update(protokolle)
					.set({ bemerkung: "Fremder Schreibversuch" })
					.where(eq(protokolle.id, foreignId))
					.returning(),
			).toEqual([]);
			expect(
				await db
					.delete(protokolle)
					.where(eq(protokolle.id, foreignId))
					.returning(),
			).toEqual([]);
		});
		await withTenant(clubB, async () => {
			expect(
				await getProtokoll(protocolIds.get(clubB.id) as string),
			).not.toBeNull();
		});
	});

	it("rejects forged ownership and cross-tenant foreign keys", async () => {
		await withTenant(clubA, async () => {
			await expect(
				db.insert(cashRegisters).values({
					tenant_id: clubB.id,
					kassennummer: "forged",
					kassenbezeichnung: "Fremd",
				}),
			).rejects.toThrow();
			await expect(
				db
					.update(appSettings)
					.set({ tenant_id: clubB.id })
					.where(eq(appSettings.id, 1)),
			).rejects.toThrow();
			await expect(
				db.insert(anlassAliase).values({
					alias_norm: "fremder anlass",
					anlass_katalog_id: catalogIds.get(clubB.id) as string,
				}),
			).rejects.toThrow();
		});
	});

	it("keeps concurrent queries and transactions isolated when pool connections are reused", async () => {
		await Promise.all(
			Array.from({ length: 32 }, (_, index) => {
				const club = clubs[index % 2];
				return withTenant(club, async () => {
					const verify = async (client: DbOrTx) => {
						await client.execute(sql`select pg_sleep(0.005)`);
						const rows = await client.select().from(appSettings);
						expect(rows).toHaveLength(1);
						expect(rows[0].tenant_id).toBe(club.id);
					};
					if (index % 3 === 0) {
						await db.transaction((tx) => verify(tx));
					} else {
						await verify(db);
					}
				});
			}),
		);
		const result = await pool.query<{ role: string; tenant: string | null }>(
			"select current_user as role, nullif(current_setting('app.tenant_id', true), '') as tenant",
		);
		expect(result.rows[0].role).not.toBe("rendant_tenant");
		expect(result.rows[0].tenant).toBeNull();
	});

	it("resets scope after transaction errors and preserves rollback semantics", async () => {
		await expect(
			withTenant(clubA, () =>
				db.transaction(async (tx) => {
					await tx.update(appSettings).set({ vereinsname: "Rollback" });
					throw new Error("synthetic rollback");
				}),
			),
		).rejects.toThrow("synthetic rollback");
		for (const club of clubs) {
			await withTenant(club, async () => {
				expect((await db.select().from(appSettings))[0].vereinsname).toBe(
					club.name,
				);
			});
		}
	});
});

describe("membership authorization", () => {
	it("uses membership roles instead of a user's global administrator role", async () => {
		for (const [club, role] of [
			[clubA, "admin"],
			[clubB, "user"],
		] as const) {
			const resolved = await resolveTenantSession(
				new Headers({ cookie: memberCookie, "x-rendant-tenant": club.id }),
			);
			expect(resolved?.user.role).toBe(role);
			expect(resolved?.tenant.id).toBe(club.id);
		}
	});

	it("rejects explicit foreign tenants instead of silently falling back", async () => {
		await expect(
			resolveTenantSession(
				new Headers({ cookie: outsiderCookie, "x-rendant-tenant": clubB.id }),
			),
		).rejects.toBeInstanceOf(TenantAccessError);
		await expect(
			resolveTenantSession(
				new Headers({
					cookie: `${outsiderCookie}; rendant-tenant=${clubB.slug}`,
				}),
			),
		).rejects.toBeInstanceOf(TenantAccessError);
	});

	it("scopes notification recipients and user listings to the active club", async () => {
		await withTenant(clubA, async () => {
			expect((await listOptedInUserEmails()).sort()).toEqual(
				[memberEmail, outsiderEmail].sort(),
			);
			expect((await listTenantUsers()).map((row) => row.id).sort()).toEqual(
				[memberId, outsiderId].sort(),
			);
		});
		await withTenant(clubB, async () => {
			expect(await listOptedInUserEmails()).toEqual([memberEmail]);
			expect((await listTenantUsers()).map((row) => row.id)).toEqual([
				memberId,
			]);
		});
	});

	it("revokes a tenant membership immediately without blocking the other club", async () => {
		await globalDb
			.update(memberships)
			.set({ banned: true })
			.where(eq(memberships.tenant_id, clubB.id));
		try {
			await expect(
				resolveTenantSession(
					new Headers({ cookie: memberCookie, "x-rendant-tenant": clubB.id }),
				),
			).rejects.toBeInstanceOf(TenantAccessError);
			expect(
				(
					await resolveTenantSession(
						new Headers({ cookie: memberCookie, "x-rendant-tenant": clubA.id }),
					)
				)?.user.id,
			).toBe(memberId);
			expect(
				(await globalDb.select().from(user).where(eq(user.id, memberId)))[0]
					.banned,
			).not.toBe(true);
		} finally {
			await globalDb
				.update(memberships)
				.set({ banned: false })
				.where(eq(memberships.tenant_id, clubB.id));
		}
	});

	it("changes membership permissions without changing the global account or another club", async () => {
		const actor = {
			id: memberId,
			email: memberEmail,
			name: "Gemeinsames Mitglied",
			role: "admin",
		};
		const target = await ensureCredentialUser({
			email: `role-target-${runId}@example.invalid`,
			name: "Rollenprüfung",
			password,
			role: "user",
		});
		await globalDb
			.insert(memberships)
			.values(
				clubs.map((club) => ({ tenant_id: club.id, user_id: target.id })),
			);
		await withTenant(clubA, async () => {
			await expect(setTenantUserRole(target.id, "admin", actor)).rejects.toMatchObject({ code: "FORBIDDEN" });
			await withOperators(() => setOperatorMemberRole({ tenantId: clubA.id, id: target.id, role: "admin" }, operators[0]));
			await setTenantUserBanned(target.id, true, actor);
			await expect(
				setTenantUserRole(memberId, "user", actor),
			).rejects.toMatchObject({
				code: "FORBIDDEN",
			});
		});
		const rows = await globalDb
			.select()
			.from(memberships)
			.where(eq(memberships.user_id, target.id));
		expect(rows.find((row) => row.tenant_id === clubA.id)).toMatchObject({
			role: "admin",
			banned: true,
		});
		expect(rows.find((row) => row.tenant_id === clubB.id)).toMatchObject({
			role: "user",
			banned: false,
		});
		expect(
			(await globalDb.select().from(user).where(eq(user.id, target.id)))[0],
		).toMatchObject({
			role: "user",
			banned: false,
		});
	});

	it("retains an active admin when authorized operators concurrently demote each other's club memberships", async () => {
		const club: TenantContext = {
			id: randomUUID(),
			slug: `admin-race-${runId}`,
			name: "Synthetische Adminprüfung",
		};
		await globalDb.insert(tenants).values(club);
		await globalDb.insert(memberships).values([
			{ tenant_id: club.id, user_id: operators[0].id, role: "admin" },
			{ tenant_id: club.id, user_id: operators[1].id, role: "admin" },
		]);
		const results = await withOperators(() =>
			Promise.allSettled([
				setOperatorMemberRole({ tenantId: club.id, id: operators[1].id, role: "user" }, operators[0]),
				setOperatorMemberRole({ tenantId: club.id, id: operators[0].id, role: "user" }, operators[1]),
			]),
		);
		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		const remaining = await globalDb
			.select()
			.from(memberships)
			.where(
				and(eq(memberships.tenant_id, club.id), eq(memberships.role, "admin")),
			);
		expect(remaining).toHaveLength(1);
		const rejected = results.find((result) => result.status === "rejected");
		expect(rejected?.status === "rejected" && rejected.reason.code).toBe("CONFLICT");
		for (const operator of operators) {
			const [svu] = await globalDb.select().from(memberships).where(and(eq(memberships.tenant_id, SVU_TENANT_ID), eq(memberships.user_id, operator.id)));
			expect(svu.role).toBe("admin");
		}
	});

	it("allows only SVU administrators to clear a historical global ban", async () => {
		const target = await ensureCredentialUser({
			email: `legacy-ban-${runId}@example.invalid`,
			name: "Historische Sperre",
			password,
			role: "user",
		});
		const expiry = new Date("2027-01-01T00:00:00.000Z");
		await globalDb
			.update(user)
			.set({
				banned: true,
				banReason: "Synthetische historische Begründung",
				banExpires: expiry,
			})
			.where(eq(user.id, target.id));
		await globalDb.insert(memberships).values([
			{ tenant_id: SVU_TENANT_ID, user_id: memberId, role: "admin" },
			{ tenant_id: SVU_TENANT_ID, user_id: target.id, banned: true },
			{ tenant_id: clubA.id, user_id: target.id, banned: true },
		]);
		const actor = {
			id: memberId,
			email: memberEmail,
			name: "Admin",
			role: "admin",
		};
		await expect(
			withTenant(clubA, () => setTenantUserBanned(target.id, false, actor)),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await withTenant({ id: SVU_TENANT_ID, slug: "svu", name: "SVU" }, () =>
			setTenantUserBanned(target.id, false, actor),
		);
		const [restored] = await globalDb
			.select()
			.from(user)
			.where(eq(user.id, target.id));
		expect(restored).toMatchObject({
			banned: false,
			banReason: "Synthetische historische Begründung",
			banExpires: expiry,
		});
		const [otherMembership] = await globalDb
			.select()
			.from(memberships)
			.where(
				and(
					eq(memberships.tenant_id, clubA.id),
					eq(memberships.user_id, target.id),
				),
			);
		expect(otherMembership.banned).toBe(true);
	});
});

describe("invitations across clubs", () => {
	it("requires the existing account identity and preserves its credential", async () => {
		const club: TenantContext = {
			id: randomUUID(),
			slug: `invite-${runId}`,
			name: "Synthetischer Einladungsverein",
		};
		await globalDb.insert(tenants).values(club);
		await globalDb.insert(memberships).values({
			tenant_id: club.id,
			user_id: memberId,
			role: "admin",
		});
		const actor = {
			id: memberId,
			email: memberEmail,
			name: "Admin",
			role: "admin",
		};
		const [credentialBefore] = await globalDb
			.select()
			.from(account)
			.where(eq(account.userId, outsiderId));
		const invite = await withTenant(club, () =>
			createInvite({
				email: outsiderEmail,
				role: "user",
				invitedBy: memberId,
				audit: { actor },
			}),
		);
		const acceptance = {
			token: invite.token,
			name: "Soll nicht überschreiben",
			password: "must-not-replace-existing-password",
			audit: {},
		};
		await expect(acceptInvite(acceptance)).rejects.toBeInstanceOf(
			InviteAlreadyRegisteredError,
		);
		await expect(
			acceptInvite({
				...acceptance,
				authenticatedUser: {
					id: memberId,
					email: memberEmail,
					name: "Falsches Konto",
				},
			}),
		).rejects.toBeInstanceOf(InviteAlreadyRegisteredError);
		const accepted = await acceptInvite({
			...acceptance,
			authenticatedUser: {
				id: outsiderId,
				email: outsiderEmail,
				name: "Nur Verein A",
			},
		});
		expect(accepted).toMatchObject({
			userId: outsiderId,
			tenantId: club.id,
			role: "user",
		});
		expect(
			await globalDb
				.select()
				.from(account)
				.where(eq(account.userId, outsiderId)),
		).toEqual([credentialBefore]);
		expect(await signInCookie(outsiderEmail)).toContain("svufo.session_token=");
		await expect(
			acceptInvite({
				...acceptance,
				authenticatedUser: {
					id: outsiderId,
					email: outsiderEmail,
					name: "Nur Verein A",
				},
			}),
		).rejects.toThrow("Einladung ungültig oder abgelaufen");
	});

	it("commits a new identity, credential and membership once for concurrent acceptance", async () => {
		const email = `new-invite-${runId}@example.invalid`;
		const actor = {
			id: memberId,
			email: memberEmail,
			name: "Admin",
			role: "admin",
		};
		await expect(withTenant(clubA, () => createInvite({ email, role: "admin", invitedBy: memberId, audit: { actor } }))).rejects.toMatchObject({ code: "FORBIDDEN" });
		const invite = await withOperators(() => withEnvironment({
			TENANT_BASE_DOMAIN: "rendant.app",
			TENANT_CANONICAL_BASE_DOMAIN: "rendant.app",
			TENANT_CANONICAL_HOSTS_JSON: "",
			TENANT_HOST_ALIASES_JSON: "",
			AUTH_TRUSTED_ORIGINS: `https://${clubA.slug}.rendant.app`,
		}, () => inviteOperatorMember({ tenantId: clubA.id, email, role: "admin" }, operators[0])));
		const acceptance = {
			token: invite.token,
			name: "Neues Mitglied",
			password,
			audit: {},
		};
		const results = await Promise.allSettled([
			acceptInvite(acceptance),
			acceptInvite(acceptance),
		]);
		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		const users = await globalDb
			.select()
			.from(user)
			.where(eq(user.email, email));
		expect(users).toHaveLength(1);
		expect(users[0].role).toBe("user");
		expect(
			await globalDb
				.select()
				.from(account)
				.where(eq(account.userId, users[0].id)),
		).toHaveLength(1);
		expect(
			await globalDb
				.select()
				.from(memberships)
				.where(eq(memberships.user_id, users[0].id)),
		).toMatchObject([{ tenant_id: clubA.id, role: "admin" }]);
		expect(await signInCookie(email)).toContain("svufo.session_token=");
	});
});
