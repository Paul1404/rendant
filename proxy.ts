import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { COOKIE_NAME } from "@/lib/constants";

const PUBLIC_PATHS = new Set(["/login", "/logo-svu.png"]);
const PUBLIC_PREFIXES = ["/api/auth/", "/api/health", "/_next/", "/favicon"];

let cachedSecret: Uint8Array | null = null;
function secret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("JWT_SECRET fehlt");
  cachedSecret = new TextEncoder().encode(value);
  return cachedSecret;
}

async function isAuthed(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const authed = await isAuthed(token);

  if (pathname.startsWith("/api/")) {
    if (!authed) {
      return NextResponse.json(
        { error: "Nicht angemeldet" },
        { status: 401 },
      );
    }
    return NextResponse.next();
  }

  if (!authed) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
