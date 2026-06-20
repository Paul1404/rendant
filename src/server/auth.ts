import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "./db";
import * as authSchema from "./db/auth-schema";

// Single-tenant internal tool. There are real user accounts (better-auth),
// but open sign-up is disabled: the seeded admin invites everyone else.
// `tanstackStartCookies()` MUST stay the last plugin so Set-Cookie headers are
// written correctly in TanStack Start.

function trustedOrigins(): string[] {
	const origins = new Set<string>(["http://localhost:3000"]);
	const base = process.env.BETTER_AUTH_URL?.trim();
	if (base) origins.add(base.replace(/\/$/, ""));
	const appUrl = process.env.APP_URL?.trim();
	if (appUrl) origins.add(appUrl.replace(/\/$/, ""));
	return Array.from(origins);
}

export const auth = betterAuth({
	appName: "SVUFO",
	baseURL: process.env.BETTER_AUTH_URL || process.env.APP_URL || undefined,
	secret: process.env.BETTER_AUTH_SECRET,
	trustedOrigins: trustedOrigins(),
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
	session: {
		expiresIn: 60 * 60 * 24 * 7, // 7 days
		updateAge: 60 * 60 * 24, // refresh once per day
		cookieCache: { enabled: true, maxAge: 5 * 60 },
	},
	advanced: {
		cookiePrefix: "svufo",
	},
	plugins: [admin(), tanstackStartCookies()],
});

export type Session = typeof auth.$Infer.Session;
