import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import { signSessionToken } from "@/lib/auth/jwt";
import { verifyAdminPassword } from "@/lib/auth/password";
import { COOKIE_NAME, JWT_TTL_SECONDS } from "@/lib/constants";
import { loginRateLimit, clientIp } from "@/server/middleware/rate-limit";
import { recordLoginAttempt } from "@/server/services/login-attempts";

const LoginSchema = z.object({
  password: z.string().min(1),
});

export const authRoutes = new Hono();

authRoutes.post("/login", loginRateLimit, async (c) => {
  const ip = clientIp(c);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    await recordLoginAttempt(ip, false);
    return c.json({ error: "Ungültiger Request" }, 400);
  }
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    await recordLoginAttempt(ip, false);
    return c.json({ error: "Passwort fehlt" }, 400);
  }
  const ok = await verifyAdminPassword(parsed.data.password);
  await recordLoginAttempt(ip, ok);
  if (!ok) {
    return c.json({ error: "Falsches Passwort" }, 401);
  }
  const token = await signSessionToken();
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "Strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: JWT_TTL_SECONDS,
  });
  return c.json({ ok: true });
});

authRoutes.post("/logout", async (c) => {
  deleteCookie(c, COOKIE_NAME, { path: "/" });
  return c.json({ ok: true });
});
