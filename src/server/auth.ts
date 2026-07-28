import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { resolveTrustedOrigins } from "./auth-origins";
import { db } from "./db";
import * as authSchema from "./db/auth-schema";

// Single-tenant internal tool. There are real user accounts (better-auth),
// but open sign-up is disabled: the seeded admin invites everyone else.
// `tanstackStartCookies()` MUST stay the last plugin so Set-Cookie headers are
// written correctly in TanStack Start.

export const auth = betterAuth({
	appName: "Rendant",
	baseURL: process.env.BETTER_AUTH_URL || undefined,
	secret: process.env.BETTER_AUTH_SECRET,
	trustedOrigins: resolveTrustedOrigins(
		process.env.BETTER_AUTH_URL,
		process.env.AUTH_TRUSTED_ORIGINS,
	),
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: authSchema,
	}),
	emailAndPassword: {
		enabled: true,
		disableSignUp: true,
		minPasswordLength: 8,
		maxPasswordLength: 256,
	},
	user: {
		// Extra column on the user table. Declared here too so the better-auth CLI
		// keeps it when regenerating the schema. Not user-settable at sign-up; the
		// DB default (true) applies on account creation.
		additionalFields: {
			notifyProtokoll: {
				type: "boolean",
				required: false,
				defaultValue: true,
				input: false,
			},
		},
	},
	session: {
		expiresIn: 60 * 60 * 24 * 7, // 7 days
		updateAge: 60 * 60 * 24, // refresh once per day
		// Authorization is checked against the database on every request so role
		// changes, bans, and session revocations take effect immediately.
		cookieCache: { enabled: false },
	},
	advanced: {
		// Persistence contract: retaining the original prefix keeps existing
		// sessions valid through the product rename.
		cookiePrefix: "svufo",
	},
	plugins: [admin(), tanstackStartCookies()],
});

export type Session = typeof auth.$Infer.Session;
