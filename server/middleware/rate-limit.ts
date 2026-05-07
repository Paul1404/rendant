import { createMiddleware } from "hono/factory";
import { isLoginRateLimited } from "@/server/services/login-attempts";

export function clientIp(c: {
  req: { header: (name: string) => string | undefined };
}): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
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
