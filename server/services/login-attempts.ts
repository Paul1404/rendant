import { sql } from "@/lib/db";
import { LOGIN_RATE_MAX, LOGIN_RATE_WINDOW_MS } from "@/lib/constants";

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
  const rows = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM login_attempts
    WHERE ip = ${ip}
      AND erfolgreich = false
      AND versucht_am > now() - (${minutes} || ' minutes')::interval
  `;
  return (rows[0]?.count ?? 0) >= LOGIN_RATE_MAX;
}
