import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/server/auth";
import { clientIpFromHeaders } from "@/server/orpc/context";
import {
	isLoginRateLimited,
	recordLoginAttempt,
} from "@/server/services/login-attempts";

function isEmailSignIn(request: Request): boolean {
	const url = new URL(request.url);
	return request.method === "POST" && url.pathname.endsWith("/sign-in/email");
}

async function handle({ request }: { request: Request }) {
	if (!isEmailSignIn(request)) {
		return auth.handler(request);
	}

	const clientIp = clientIpFromHeaders(request.headers);
	if (await isLoginRateLimited(clientIp)) {
		return Response.json(
			{ error: "Zu viele Anmeldeversuche. Bitte später erneut versuchen." },
			{ status: 429 },
		);
	}

	try {
		const response = await auth.handler(request);
		await recordLoginAttempt(clientIp, response.ok);
		return response;
	} catch (err) {
		await recordLoginAttempt(clientIp, false);
		throw err;
	}
}

export const Route = createFileRoute("/api/auth/$")({
	server: {
		handlers: {
			GET: handle,
			POST: handle,
		},
	},
});
