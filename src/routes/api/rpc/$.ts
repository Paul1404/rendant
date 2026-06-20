import { RPCHandler } from "@orpc/server/fetch";
import { createFileRoute } from "@tanstack/react-router";
import { createORPCContext } from "@/server/orpc/context";
import { router } from "@/server/orpc/router";

const handler = new RPCHandler(router);

async function handle({ request }: { request: Request }) {
	const context = await createORPCContext(request);
	const { response } = await handler.handle(request, {
		prefix: "/api/rpc",
		context,
	});
	return response ?? new Response("Not Found", { status: 404 });
}

export const Route = createFileRoute("/api/rpc/$")({
	server: {
		handlers: {
			GET: handle,
			POST: handle,
			PUT: handle,
			PATCH: handle,
			DELETE: handle,
		},
	},
});
