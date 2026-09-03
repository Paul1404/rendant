import { auth } from "@/server/auth";
import { requestIdFromHeaders } from "@/server/request-id";
import type { ORPCContext } from "./base";

// Assumes exactly one trusted proxy hop (Railway's edge). If another proxy is
// ever put in front - Cloudflare, a custom domain proxy - the last entry becomes
// that proxy's address and every caller collapses into one bucket, which would
// silently turn the per-IP login limit into a global one. Revisit this together
// with the login limiter if the topology changes.
export function clientIpFromHeaders(headers: Headers): string {
	const xff = headers.get("x-forwarded-for");
	if (xff) {
		// The last address is appended by the trusted proxy (Railway). The first
		// entry is client-controlled and therefore spoofable, so we take the last.
		const parts = xff
			.split(",")
			.map((p) => p.trim())
			.filter(Boolean);
		const last = parts[parts.length - 1];
		if (last) return last;
	}
	return (
		headers.get("x-real-ip") ?? headers.get("cf-connecting-ip") ?? "unknown"
	);
}

export async function createORPCContext(
	request: Request,
): Promise<ORPCContext> {
	const requestId = requestIdFromHeaders(request.headers);
	const headers = new Headers(request.headers);
	headers.set("x-request-id", requestId);
	// Authorization must reflect role changes, bans, and session revocations
	// immediately. The general cookie cache is useful for page rendering, but an
	// oRPC mutation must never trust a cached role after the DB session was removed.
	const session = await auth.api.getSession({
		headers,
		query: { disableCookieCache: true },
	});
	const user = session?.user
		? {
				id: session.user.id,
				email: session.user.email,
				name: session.user.name,
				role: (session.user as { role?: string }).role ?? "user",
			}
		: null;
	return {
		user,
		headers,
		clientIp: clientIpFromHeaders(headers),
		requestId,
	};
}
