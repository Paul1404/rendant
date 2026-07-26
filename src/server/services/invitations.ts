import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { user as userTable } from "@/server/db/auth-schema";
import { invitations } from "@/server/db/schema";
import {
	type RecordAuditInput,
	recordAuditEventStrict,
} from "@/server/services/audit";
import { ensureCredentialUser } from "@/server/services/auth-accounts";

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
	audit: Omit<RecordAuditInput, "category" | "action" | "subject">;
}): Promise<InviteWithLink> {
	const email = opts.email.trim().toLowerCase();
	return db.transaction(async (tx) => {
		// Serialize invitation creation per normalized email across all app
		// instances. A read-before-write check alone permits two admins to create
		// simultaneously valid invitations for the same future account.
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtextextended(${email}, 0))`,
		);

		const existingUser = await tx
			.select({ id: userTable.id })
			.from(userTable)
			.where(eq(userTable.email, email))
			.limit(1);
		if (existingUser.length > 0) {
			throw new Error("Es existiert bereits ein Konto mit dieser E-Mail");
		}

		const activeInvite = await tx
			.select({ id: invitations.id })
			.from(invitations)
			.where(
				and(
					eq(invitations.email, email),
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
	audit: Omit<RecordAuditInput, "category" | "action" | "actor" | "subject">;
}): Promise<{
	userId: string;
	email: string;
	name: string;
	role: string;
	inviteId: string;
}> {
	return db.transaction(async (tx) => {
		// The row lock makes invite consumption single-winner. A concurrent caller
		// waits here, then re-evaluates the active predicate after the first commit.
		const inviteRows = await tx
			.select()
			.from(invitations)
			.where(
				and(
					eq(invitations.token, opts.token),
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

		const credentialUser = await ensureCredentialUser({
			email: inviteRow.email,
			name: opts.name.trim(),
			role: inviteRow.role,
			password: opts.password,
		});

		const rows = await tx
			.update(invitations)
			.set({ accepted_at: new Date() })
			.where(
				and(eq(invitations.id, inviteRow.id), isNull(invitations.accepted_at)),
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
				id: credentialUser.id,
				email: inviteRow.email,
				name: opts.name.trim(),
				role: inviteRow.role,
			},
			subject: {
				type: "user",
				id: credentialUser.id,
				label: inviteRow.email,
			},
			metadata: {
				...opts.audit.metadata,
				invite_id: inviteRow.id,
				role: inviteRow.role,
			},
		});
		return {
			userId: credentialUser.id,
			email: inviteRow.email,
			name: opts.name.trim(),
			role: inviteRow.role,
			inviteId: inviteRow.id,
		};
	});
}
