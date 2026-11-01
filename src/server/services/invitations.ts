import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db, globalDb } from "@/server/db";
import {
	account as accountTable,
	user as userTable,
} from "@/server/db/auth-schema";
import { invitations } from "@/server/db/schema";
import { memberships, tenants } from "@/server/db/tenant-schema";
import {
	type RecordAuditInput,
	recordAuditEventStrict,
} from "@/server/services/audit";
import { requireTenant, withTenant } from "@/server/tenant-context";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type Invite = {
	id: string;
	tenant_id: string;
	email: string;
	role: string;
	invited_by: string | null;
	expires_at: Date;
	accepted_at: Date | null;
	created_at: Date;
};

export type InviteWithLink = Invite & { token: string };

type Row = typeof invitations.$inferSelect;

function rowToInvite(row: Row): Invite {
	return {
		id: row.id,
		tenant_id: row.tenant_id,
		email: row.email,
		role: row.role,
		invited_by: row.invited_by ?? null,
		expires_at: row.expires_at,
		accepted_at: row.accepted_at ?? null,
		created_at: row.created_at,
	};
}

export async function listInvites(): Promise<Invite[]> {
	const rows = await db
		.select()
		.from(invitations)
		.orderBy(desc(invitations.created_at));
	return rows.map(rowToInvite);
}

export async function createInvite(opts: {
	email: string;
	role: "user" | "admin";
	invitedBy: string | null;
	audit: Omit<RecordAuditInput, "category" | "action" | "subject">;
}): Promise<InviteWithLink> {
	const email = opts.email.trim().toLowerCase();
	const tenant = requireTenant();
	return globalDb.transaction(async (tx) => {
		await tx.execute(
			sql`select set_config('app.tenant_id', ${tenant.id}, true)`,
		);
		// Serialize invitation creation per normalized email across all app
		// instances. A read-before-write check alone permits two admins to create
		// simultaneously valid invitations for the same future account.
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtextextended(${email}, 0))`,
		);

		const existingMember = await tx
			.select({ id: userTable.id })
			.from(userTable)
			.innerJoin(memberships, eq(memberships.user_id, userTable.id))
			.where(
				and(eq(userTable.email, email), eq(memberships.tenant_id, tenant.id)),
			)
			.limit(1);
		if (existingMember.length > 0) {
			throw new Error("Dieses Konto gehört bereits zum Verein");
		}

		const activeInvite = await tx
			.select({ id: invitations.id })
			.from(invitations)
			.where(
				and(
					eq(invitations.email, email),
					eq(invitations.tenant_id, tenant.id),
					isNull(invitations.accepted_at),
					gt(invitations.expires_at, new Date()),
				),
			)
			.limit(1);
		if (activeInvite.length > 0) {
			throw new Error(
				"Für diese E-Mail besteht bereits eine gültige Einladung",
			);
		}

		const token = randomBytes(32).toString("base64url");
		const rows = await tx
			.insert(invitations)
			.values({
				tenant_id: tenant.id,
				email,
				token,
				role: opts.role,
				invited_by: opts.invitedBy,
				expires_at: new Date(Date.now() + INVITE_TTL_MS),
			})
			.returning();
		const invite = { ...rowToInvite(rows[0]), token };
		await recordAuditEventStrict(tx, {
			...opts.audit,
			category: "users",
			action: "users.invite_created",
			subject: { type: "invite", id: invite.id, label: invite.email },
			metadata: { ...opts.audit.metadata, role: invite.role },
		});
		return invite;
	});
}

export async function revokeInvite(
	id: string,
	audit: Omit<RecordAuditInput, "category" | "action" | "subject">,
): Promise<Invite | null> {
	return db.transaction(async (tx) => {
		const rows = await tx
			.delete(invitations)
			.where(and(eq(invitations.id, id), isNull(invitations.accepted_at)))
			.returning();
		if (!rows[0]) return null;
		const invite = rowToInvite(rows[0]);
		await recordAuditEventStrict(tx, {
			...audit,
			category: "users",
			action: "users.invite_revoked",
			subject: { type: "invite", id: invite.id, label: invite.email },
		});
		return invite;
	});
}

// A random invitation token is the capability to inspect this one invitation.
// Global lookup is deliberately restricted to the token and valid lifetime.
export async function getValidInvite(
	token: string,
): Promise<(Invite & { existingAccount: boolean; tenantName: string }) | null> {
	const [row] = await globalDb
		.select({
			invite: invitations,
			tenantName: tenants.name,
			existingUserId: userTable.id,
		})
		.from(invitations)
		.innerJoin(tenants, eq(tenants.id, invitations.tenant_id))
		.leftJoin(userTable, eq(userTable.email, invitations.email))
		.where(
			and(
				eq(invitations.token, token),
				isNull(invitations.accepted_at),
				gt(invitations.expires_at, new Date()),
			),
		)
		.limit(1);
	return row
		? {
				...rowToInvite(row.invite),
				tenantName: row.tenantName,
				existingAccount: row.existingUserId !== null,
			}
		: null;
}

export class InviteAlreadyRegisteredError extends Error {
	constructor() {
		super(
			"Für diese E-Mail besteht bereits ein Konto. Bitte melde dich mit deinem vorhandenen Passwort an.",
		);
		this.name = "InviteAlreadyRegisteredError";
	}
}

export async function acceptInvite(opts: {
	token: string;
	name?: string;
	password?: string;
	authenticatedUser?: { id: string; email: string; name: string } | null;
	audit: Omit<RecordAuditInput, "category" | "action" | "actor" | "subject">;
}): Promise<{
	userId: string;
	email: string;
	name: string;
	role: string;
	inviteId: string;
	tenantId: string;
}> {
	const validInvite = await getValidInvite(opts.token);
	if (!validInvite) throw new Error("Einladung ungültig oder abgelaufen");
	const [tenant] = await globalDb
		.select()
		.from(tenants)
		.where(eq(tenants.id, validInvite.tenant_id))
		.limit(1);
	if (!tenant) throw new Error("Verein nicht gefunden");
	return withTenant(
		{ id: tenant.id, slug: tenant.slug, name: tenant.name },
		() =>
			globalDb.transaction(async (tx) => {
				await tx.execute(
					sql`select set_config('app.tenant_id', ${tenant.id}, true)`,
				);
				// The row lock makes invite consumption single-winner. A concurrent caller
				// waits here, then re-evaluates the active predicate after the first commit.
				const inviteRows = await tx
					.select()
					.from(invitations)
					.where(
						and(
							eq(invitations.token, opts.token),
							eq(invitations.tenant_id, tenant.id),
							isNull(invitations.accepted_at),
							gt(invitations.expires_at, new Date()),
						),
					)
					.limit(1)
					.for("update");
				const inviteRow = inviteRows[0];
				if (!inviteRow) {
					throw new Error("Einladung ungültig oder abgelaufen");
				}

				// Existing identities can join only while authenticated as that account.
				// An invitation must never set or repair another account's password.
				const [existingUser] = await tx
					.select({
						id: userTable.id,
						email: userTable.email,
						name: userTable.name,
					})
					.from(userTable)
					.where(eq(userTable.email, inviteRow.email))
					.limit(1);
				let userId: string;
				let userName: string;
				if (existingUser) {
					if (
						opts.authenticatedUser?.id !== existingUser.id ||
						opts.authenticatedUser?.email.toLowerCase() !==
							inviteRow.email.toLowerCase()
					) {
						throw new InviteAlreadyRegisteredError();
					}
					userId = existingUser.id;
					userName = existingUser.name;
				} else {
					const name = opts.name?.trim();
					if (
						!name ||
						name.length > 120 ||
						!opts.password ||
						opts.password.length < 8 ||
						opts.password.length > 256
					) {
						throw new Error(
							"Bitte Namen und ein Passwort mit 8 bis 256 Zeichen angeben",
						);
					}
					const authContext = await auth.$context;
					const passwordHash = await authContext.password.hash(opts.password);
					userId = randomUUID();
					// Identity, credential, membership and invite consumption commit
					// together. A retry cannot leave an orphaned or passwordless account.
					await tx.insert(userTable).values({
						id: userId,
						email: inviteRow.email,
						name,
						emailVerified: true,
						role: "user",
					});
					await tx.insert(accountTable).values({
						id: randomUUID(),
						userId,
						providerId: "credential",
						accountId: userId,
						password: passwordHash,
					});
					userName = name;
				}
				await tx
					.insert(memberships)
					.values({
						tenant_id: tenant.id,
						user_id: userId,
						role: inviteRow.role === "admin" ? "admin" : "user",
					})
					.onConflictDoNothing({
						target: [memberships.tenant_id, memberships.user_id],
					});

				const rows = await tx
					.update(invitations)
					.set({ accepted_at: new Date() })
					.where(
						and(
							eq(invitations.id, inviteRow.id),
							eq(invitations.tenant_id, tenant.id),
							isNull(invitations.accepted_at),
						),
					)
					.returning({ id: invitations.id });
				if (rows.length === 0) {
					throw new Error("Einladung konnte nicht angenommen werden");
				}
				await recordAuditEventStrict(tx, {
					...opts.audit,
					category: "users",
					action: "users.invite_accepted",
					actor: {
						id: userId,
						email: inviteRow.email,
						name: userName,
						role: inviteRow.role,
					},
					subject: {
						type: "user",
						id: userId,
						label: inviteRow.email,
					},
					metadata: {
						...opts.audit.metadata,
						invite_id: inviteRow.id,
						role: inviteRow.role,
					},
				});
				return {
					userId,
					email: inviteRow.email,
					name: userName,
					role: inviteRow.role,
					inviteId: inviteRow.id,
					tenantId: tenant.id,
				};
			}),
	);
}
