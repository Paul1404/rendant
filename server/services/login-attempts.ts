import { sql } from "@/lib/db";
import {
  LOGIN_RATE_GLOBAL_MAX,
  LOGIN_RATE_MAX,
  LOGIN_RATE_WINDOW_MS,
} from "@/lib/constants";

export async function recordLoginAttempt(
  ip: string,
  erfolgreich: boolean,
): Promise<void> {
  await sql`
    INSERT INTO login_attempts (ip, erfolgreich)
    VALUES (${ip}, ${erfolgreich})
  `;
  await sql`
    DELETE FROM login_attempts
    WHERE versucht_am < now() - interval '24 hours'
  `.catch(() => {});
}

export async function isLoginRateLimited(ip: string): Promise<boolean> {
  const minutes = Math.ceil(LOGIN_RATE_WINDOW_MS / 60000);
  const rows = await sql<{ ip_count: number; global_count: number }[]>`
    SELECT
      COUNT(*) FILTER (WHERE ip = ${ip})::int AS ip_count,
      COUNT(*)::int AS global_count
    FROM login_attempts
    WHERE erfolgreich = false
      AND versucht_am > now() - (${minutes} || ' minutes')::interval
  `;
  const ipCount = rows[0]?.ip_count ?? 0;
  const globalCount = rows[0]?.global_count ?? 0;
  // Per-IP-Limit plus globaler Backstop. Der Backstop kann nicht durch
  // gefaelschte X-Forwarded-For-Header umgangen werden.
  return ipCount >= LOGIN_RATE_MAX || globalCount >= LOGIN_RATE_GLOBAL_MAX;
}
