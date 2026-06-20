import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { user as userTable } from "@/server/db/auth-schema";
import { invitations } from "@/server/db/schema";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type Invite = {
	id: string;
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
}): Promise<InviteWithLink> {
	const email = opts.email.trim().toLowerCase();
	const existingUser = await db
		.select({ id: userTable.id })
		.from(userTable)
		.where(eq(userTable.email, email))
		.limit(1);
	if (existingUser.length > 0) {
		throw new Error("Es existiert bereits ein Konto mit dieser E-Mail");
	}

	const token = randomBytes(32).toString("base64url");
	const rows = await db
		.insert(invitations)
		.values({
			email,
			token,
			role: opts.role,
			invited_by: opts.invitedBy,
			expires_at: new Date(Date.now() + INVITE_TTL_MS),
		})
		.returning();
	return { ...rowToInvite(rows[0]), token };
}

export async function revokeInvite(id: string): Promise<boolean> {
	const rows = await db
		.delete(invitations)
		.where(and(eq(invitations.id, id), isNull(invitations.accepted_at)))
		.returning({ id: invitations.id });
	return rows.length > 0;
}

export async function getValidInvite(token: string): Promise<Invite | null> {
	const rows = await db
		.select()
		.from(invitations)
		.where(
			and(
				eq(invitations.token, token),
				isNull(invitations.accepted_at),
				gt(invitations.expires_at, new Date()),
			),
		)
		.limit(1);
	return rows[0] ? rowToInvite(rows[0]) : null;
}

export async function acceptInvite(opts: {
	token: string;
	name: string;
	password: string;
}): Promise<void> {
	const invite = await getValidInvite(opts.token);
	if (!invite) {
		throw new Error("Einladung ungültig oder abgelaufen");
	}

	const existingUser = await db
		.select({ id: userTable.id })
		.from(userTable)
		.where(eq(userTable.email, invite.email))
		.limit(1);
	if (existingUser.length > 0) {
		throw new Error("Es existiert bereits ein Konto mit dieser E-Mail");
	}

	const ctx = await auth.$context;
	const hash = await ctx.password.hash(opts.password);
	const created = await ctx.internalAdapter.createUser({
		email: invite.email,
		name: opts.name.trim(),
		emailVerified: true,
		role: invite.role,
	});
	await ctx.internalAdapter.linkAccount({
		userId: created.id,
		providerId: "credential",
		accountId: created.id,
		password: hash,
	});

	await db
		.update(invitations)
		.set({ accepted_at: new Date() })
		.where(eq(invitations.id, invite.id));
}
