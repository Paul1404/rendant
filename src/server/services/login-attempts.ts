import { and, eq, gt, lt, sql } from "drizzle-orm";
import {
	LOGIN_RATE_GLOBAL_MAX,
	LOGIN_RATE_MAX,
	LOGIN_RATE_WINDOW_MS,
} from "@/lib/constants";
import { db } from "@/server/db";
import { loginAttempts } from "@/server/db/schema";

export async function recordLoginAttempt(
	ip: string,
	erfolgreich: boolean,
): Promise<void> {
	await db.insert(loginAttempts).values({ ip, erfolgreich });
	await db
		.delete(loginAttempts)
		.where(lt(loginAttempts.versucht_am, sql`now() - interval '24 hours'`))
		.catch(() => {});
}

export async function isLoginRateLimited(ip: string): Promise<boolean> {
	const minutes = Math.ceil(LOGIN_RATE_WINDOW_MS / 60000);
	const since = sql`now() - (${minutes} || ' minutes')::interval`;
	const rows = await db
		.select({
			ipCount: sql<number>`count(*) filter (where ${eq(loginAttempts.ip, ip)})::int`,
			globalCount: sql<number>`count(*)::int`,
		})
		.from(loginAttempts)
		.where(
			and(
				eq(loginAttempts.erfolgreich, false),
				gt(loginAttempts.versucht_am, since),
			),
		);
	const ipCount = rows[0]?.ipCount ?? 0;
	const globalCount = rows[0]?.globalCount ?? 0;
	// Per-IP-Limit plus globaler Backstop. Der Backstop kann nicht durch
	// gefaelschte X-Forwarded-For-Header umgangen werden.
	return ipCount >= LOGIN_RATE_MAX || globalCount >= LOGIN_RATE_GLOBAL_MAX;
}
