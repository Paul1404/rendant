import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import type { AppRouter } from "@/server/orpc/router";

// Isomorphic oRPC client. In the browser it calls the relative /api/rpc
// endpoint (cookies sent automatically). During SSR it calls the same handler
// over loopback (NOT the public origin -- that would round-trip through the
// platform proxy and fail) and forwards the session cookie from the incoming
// request. The server-only branches (and their imports) are stripped from the
// client bundle by the TanStack Start compiler.

const resolveUrl = createIsomorphicFn()
	.server(() => {
		const port = process.env.PORT ?? "3000";
		return `http://127.0.0.1:${port}/api/rpc`;
	})
	.client(() => "/api/rpc");

const resolveHeaders = createIsomorphicFn()
	.server((): Record<string, string> => {
		const headers = new Headers(getRequestHeaders() as HeadersInit);
		const cookie = headers.get("cookie");
		return cookie ? { cookie } : {};
	})
	.client((): Record<string, string> => ({}));

const link = new RPCLink({
	url: () => resolveUrl(),
	headers: () => resolveHeaders(),
});

export const orpcClient: RouterClient<AppRouter> = createORPCClient(link);
export const orpc = createTanstackQueryUtils(orpcClient);
