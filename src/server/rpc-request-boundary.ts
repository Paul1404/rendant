import { resolveTrustedOrigins } from "@/server/auth-origins";

/** Cookie-authenticated RPC writes need their own browser boundary: Start's
 * server-function CSRF middleware does not cover API routes. Native and SSR
 * callers may omit Origin, but must still send the non-simple JSON media type. */
export function validateRpcRequestBoundary(
	request: Request,
	trustedOrigins: readonly string[] = resolveTrustedOrigins(
		process.env.BETTER_AUTH_URL,
		process.env.AUTH_TRUSTED_ORIGINS,
	),
): Response | null {
	if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return null;
	const mediaType = request.headers
		.get("content-type")
		?.split(";", 1)[0]
		.trim()
		.toLowerCase();
	if (mediaType !== "application/json")
		return Response.json(
			{ error: "Diese Anfrage muss als JSON gesendet werden" },
			{ status: 415 },
		);
	const origin = request.headers.get("origin");
	if (origin === null) return null;
	const requested = new URL(request.url);
	// Railway may terminate HTTPS before an internal HTTP hop. Only an exact
	// configured origin for this authority can supply the public scheme. An
	// approved sibling origin and forwarded headers never authorize this host.
	const configured = trustedOrigins.filter(
		(allowed) => new URL(allowed).host === requested.host,
	);
	const allowed = configured.length ? configured : [requested.origin];
	if (!allowed.includes(origin))
		return Response.json(
			{ error: "Diese Anfrage stammt nicht von dieser Rendant-Adresse" },
			{ status: 403 },
		);
	return null;
}
