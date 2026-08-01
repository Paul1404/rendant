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

export const startInstance = createStart(() => ({
	requestMiddleware: [canonicalDomain, csrf],
}));
