import { and, eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import {
	account as accountTable,
	user as userTable,
} from "@/server/db/auth-schema";

// better-auth >= 1.7 namespaces accounts by issuer and sign-in only matches a
// credential account whose issuer is the synthetic `local:credential` value
// (`createLocalAccountIssuer("credential")`). Kept as a literal so production
// code does not import from the transitive `@better-auth/core`; a unit test
// asserts it still equals what better-auth derives, so an upstream change to
// the scheme fails CI instead of silently locking everyone out.
export const CREDENTIAL_ACCOUNT_ISSUER = "local:credential";

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
		const user = await ctx.internalAdapter.createUser(
			{
				email,
				name: opts.name.trim(),
				emailVerified: true,
				role: opts.role,
			},
			// better-auth >= 1.7 requires the provisioning source. It only gates the
			// optional `user.validateUserInfo` hook, which this app does not set, but
			// the method must still describe how the account is created.
			{ method: "email-password" },
		);
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
		issuer: CREDENTIAL_ACCOUNT_ISSUER,
		accountId: userId,
		password: hash,
	});
	return { id: userId, created, linked: true };
}
