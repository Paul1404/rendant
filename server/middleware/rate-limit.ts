import { createMiddleware } from "hono/factory";
import { isLoginRateLimited } from "@/server/services/login-attempts";

export function clientIp(c: {
  req: { header: (name: string) => string | undefined };
}): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    // Die letzte Adresse in der Kette wird vom vertrauenswuerdigen Proxy
    // (Railway) angehaengt. Der erste Eintrag ist client-kontrolliert und
    // damit faelschbar, deshalb nehmen wir den letzten.
    const parts = xff
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return (
    c.req.header("x-real-ip") ?? c.req.header("cf-connecting-ip") ?? "unknown"
  );
}

export const loginRateLimit = createMiddleware(async (c, next) => {
  const ip = clientIp(c);
  if (await isLoginRateLimited(ip)) {
    return c.json(
      {
        error: "Zu viele Fehlversuche. Bitte spaeter erneut versuchen.",
      },
      429,
    );
  }
  await next();
});
