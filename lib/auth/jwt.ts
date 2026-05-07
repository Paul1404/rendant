import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { JWT_TTL_SECONDS } from "@/lib/constants";

let cachedSecret: Uint8Array | null = null;

function secret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 16) {
    throw new Error(
      "JWT_SECRET ist nicht gesetzt oder zu kurz (mind. 16 Zeichen)",
    );
  }
  cachedSecret = new TextEncoder().encode(value);
  return cachedSecret;
}

export type SessionPayload = JWTPayload & { sub: string };

export async function signSessionToken(): Promise<string> {
  return new SignJWT({})
    .setSubject("admin")
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${JWT_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ["HS256"],
    });
    if (!payload.sub) return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}
