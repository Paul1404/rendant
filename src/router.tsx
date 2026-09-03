import { QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";

export interface RouterContext {
	queryClient: QueryClient;
}

export function getRouter() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 30_000,
				retry: 1,
			},
		},
	});

	const router = createTanStackRouter({
		routeTree,
		context: { queryClient } satisfies RouterContext,
		defaultPreload: "intent",
		// Preloading on hover with a stale time of 0 re-ran every loader each time
		// the pointer crossed a nav link. Routes whose loaders go through
		// ensureQueryData were shielded by the 30s query stale time, but the
		// Einstellungen and Neu loaders call the oRPC client directly, so sweeping
		// the mouse across the nav bar re-fired nine and three uncached requests -
		// each its own HTTP round trip and its own uncached session lookup. This
		// only governs preloads: router.invalidate() after a mutation still forces
		// a real reload, so nothing renders stale.
		defaultPreloadStaleTime: 30_000,
		scrollRestoration: true,
		defaultStructuralSharing: true,
	});

	setupRouterSsrQueryIntegration({ router, queryClient });

	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
