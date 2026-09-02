import {
	createCsrfMiddleware,
	createMiddleware,
	createStart,
} from "@tanstack/react-start";
import { legacyDomainRedirect } from "@/lib/canonical-domain";

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
	async ({ next }) => {
		const result = await next();
		const headers = result.response.headers;
		headers.set("X-Frame-Options", "DENY");
		headers.set("X-Content-Type-Options", "nosniff");
		headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
		return result;
	},
);

export const startInstance = createStart(() => ({
	requestMiddleware: [canonicalDomain, securityHeaders, csrf],
}));
