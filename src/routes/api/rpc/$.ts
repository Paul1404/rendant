import { RPCHandler } from "@orpc/server/fetch";
import { createFileRoute } from "@tanstack/react-router";
import { createORPCContext } from "@/server/orpc/context";
import { router } from "@/server/orpc/router";
import { TenantSelectionError } from "@/server/tenant-context";

const handler = new RPCHandler(router);

async function handle({ request }: { request: Request }) {
	let context: Awaited<ReturnType<typeof createORPCContext>>;
	try {
		context = await createORPCContext(request);
	} catch (error) {
		if (error instanceof TenantSelectionError)
			return Response.json({ error: error.message }, { status: 400 });
		throw error;
	}
	const { response } = await handler.handle(request, {
		prefix: "/api/rpc",
		context,
	});
	const result = response ?? new Response("Not Found", { status: 404 });
	result.headers.set("x-request-id", context.requestId);
	return result;
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
