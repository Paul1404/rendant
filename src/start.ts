import {
	createCsrfMiddleware,
	createMiddleware,
	createStart,
} from "@tanstack/react-start";
import { legacyDomainRedirect } from "@/lib/canonical-domain";
import { isOperatorHost } from "@/server/operator-host";
import {
	resolveHostTenant,
	TenantAccessError,
} from "@/server/services/tenants";
import {
	TenantSelectionError,
	tenantRequestHeaders,
	withTenantRequest,
} from "@/server/tenant-context";

const tenantHostnameGuard = createMiddleware({ type: "request" }).server(
	async ({ request, next }) => {
		try {
			const headers = tenantRequestHeaders(request);
			if (isOperatorHost(headers)) {
				const path = new URL(request.url).pathname;
				if (path === "/protokolle" || path.startsWith("/protokolle/")) {
					return Response.json(
						{
							error:
								"Auf der Betreiberadresse stehen keine Buchhaltungsdaten zur Verfügung",
						},
						{ status: 403 },
					);
				}
			} else {
				await resolveHostTenant(headers);
			}
		} catch (error) {
			if (error instanceof TenantAccessError)
				return Response.json(
					{ error: "Für diese Vereinsadresse besteht kein Zugriff" },
					{ status: 403 },
				);
			if (error instanceof TenantSelectionError)
				return Response.json({ error: error.message }, { status: 400 });
			throw error;
		}
		return next();
	},
);

const tenantRequestScope = createMiddleware({ type: "request" }).server(
	({ next }) => withTenantRequest(next),
);

const canonicalDomain = createMiddleware({ type: "request" }).server(
	async ({ next, request }) => legacyDomainRedirect(request) ?? next(),
);

// Creating src/start.ts replaces TanStack Start's implicit default. Keep the
// same server-function CSRF protection explicitly after the domain redirect.
const csrf = createCsrfMiddleware({
	filter: (context) => context.handlerType === "serverFn",
});

// The app has irreversible controls behind a session (Storno, Kasse löschen,
// Einladung zurückziehen), so framing protection is the one that earns its keep
// here. The rest is cheap defence in depth. No CSP yet: it needs to be measured
// against the Nitro asset graph first, and report-only would be the way in.
const securityHeaders = createMiddleware({ type: "request" }).server(
	async ({ next, request }) => {
		const result = await next();
		const headers = result.response.headers;
		headers.set("X-Frame-Options", "DENY");
		headers.set("X-Content-Type-Options", "nosniff");
		headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
		const path = new URL(request.url).pathname;
		if (
			path === "/login" ||
			path.startsWith("/invite/") ||
			path.startsWith("/api/auth/")
		) {
			// Invitation and recovery URLs carry capabilities. Keep their pages
			// out of shared caches, referrer headers and search indexes.
			headers.set("Cache-Control", "private, no-store");
			headers.set("Referrer-Policy", "no-referrer");
			headers.set("X-Robots-Tag", "noindex, nofollow");
		}
		return result;
	},
);

export const startInstance = createStart(() => ({
	requestMiddleware: [
		canonicalDomain,
		securityHeaders,
		tenantHostnameGuard,
		csrf,
		tenantRequestScope,
	],
}));
