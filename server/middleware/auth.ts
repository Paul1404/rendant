import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { COOKIE_NAME } from "@/lib/constants";
import { verifySessionToken, type SessionPayload } from "@/lib/auth/jwt";

type AuthVars = { user: SessionPayload };

export const authMiddleware = createMiddleware<{ Variables: AuthVars }>(
  async (c, next) => {
    const token = getCookie(c, COOKIE_NAME);
    if (!token) {
      return c.json({ error: "Nicht angemeldet" }, 401);
    }
    const payload = await verifySessionToken(token);
    if (!payload) {
      return c.json({ error: "Sitzung abgelaufen" }, 401);
    }
    c.set("user", payload);
    await next();
  },
);
