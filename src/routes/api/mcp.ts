import { createFileRoute } from "@tanstack/react-router";
import { handleMcpRequest } from "@/server/mcp/server";

// GET and DELETE stay routed on purpose: the handler answers them with an
// explicit 405 so a client learns the endpoint speaks POST only, instead of
// meeting a router 404 it cannot interpret.
export const Route = createFileRoute("/api/mcp")({
	server: {
		handlers: {
			GET: ({ request }) => handleMcpRequest(request),
			POST: ({ request }) => handleMcpRequest(request),
			DELETE: ({ request }) => handleMcpRequest(request),
		},
	},
});
