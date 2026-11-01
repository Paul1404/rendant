import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders, getRequestUrl } from "@tanstack/react-start/server";
import { tenantRequestHeaders } from "@/lib/tenant-client";
import type { AppRouter } from "@/server/orpc/router";
import { resolvedRequestTenant } from "@/server/tenant-context";

// Isomorphic oRPC client. RPCLink builds requests with `new URL(url)`, so the
// url must always be ABSOLUTE (a relative "/api/rpc" throws "cannot be parsed
// as a URL"). In the browser we use the page origin; during SSR we hit the
// container loopback (NOT the public origin -- that would round-trip through the
// platform proxy and fail) and forward the session cookie from the incoming
// request. The server-only branches (and their imports) are stripped from the
// client bundle by the TanStack Start compiler.

const resolveUrl = createIsomorphicFn()
	.server(() => {
		const port = process.env.PORT ?? "3000";
		return `http://127.0.0.1:${port}/api/rpc`;
	})
	.client(() => `${window.location.origin}/api/rpc`);

const resolveHeaders = createIsomorphicFn()
	.server((): Record<string, string> => {
		const headers = new Headers(getRequestHeaders() as HeadersInit);
		const cookie = headers.get("cookie");
		const tenant =
			resolvedRequestTenant() ??
			headers.get("x-rendant-tenant") ??
			getRequestUrl().searchParams.get("tenant");
		return {
			...(cookie ? { cookie } : {}),
			host: headers.get("host") ?? getRequestUrl().host,
			...(tenant ? { "x-rendant-tenant": tenant } : {}),
		};
	})
	.client((): Record<string, string> => tenantRequestHeaders());

const link = new RPCLink({
	url: () => resolveUrl(),
	headers: () => resolveHeaders(),
});

export const orpcClient: RouterClient<AppRouter> = createORPCClient(link);
export const orpc = createTanstackQueryUtils(orpcClient);
