import { and, eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import {
	account as accountTable,
	user as userTable,
} from "@/server/db/auth-schema";

export type CredentialUserRecoveryAction =
	| "create-user-and-link"
	| "link-existing-user"
	| "already-linked";

export function credentialUserRecoveryAction(
	userExists: boolean,
	credentialAccountExists: boolean,
): CredentialUserRecoveryAction {
	if (!userExists) return "create-user-and-link";
	return credentialAccountExists ? "already-linked" : "link-existing-user";
}

export async function ensureCredentialUser(opts: {
	email: string;
	name: string;
	password: string;
	role: string;
}): Promise<{ id: string; created: boolean; linked: boolean }> {
	const email = opts.email.trim().toLowerCase();
	const existing = await db
		.select({ id: userTable.id })
		.from(userTable)
		.where(eq(userTable.email, email))
		.limit(1);

	const ctx = await auth.$context;
	let userId = existing[0]?.id;
	let created = false;

	if (
		credentialUserRecoveryAction(Boolean(userId), false) ===
		"create-user-and-link"
	) {
		const user = await ctx.internalAdapter.createUser({
			email,
			name: opts.name.trim(),
			emailVerified: true,
			role: opts.role,
		});
		userId = user.id;
		created = true;
	}

	const credentialAccounts = await db
		.select({ id: accountTable.id })
		.from(accountTable)
		.where(
			and(
				eq(accountTable.userId, userId),
				eq(accountTable.providerId, "credential"),
			),
		)
		.limit(1);

	if (
		credentialUserRecoveryAction(true, credentialAccounts.length > 0) ===
		"already-linked"
	) {
		return { id: userId, created, linked: false };
	}

	const hash = await ctx.password.hash(opts.password);
	await ctx.internalAdapter.linkAccount({
		userId,
		providerId: "credential",
		accountId: userId,
		password: hash,
	});
	return { id: userId, created, linked: true };
}
