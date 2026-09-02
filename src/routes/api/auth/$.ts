import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/server/auth";
import { clientIpFromHeaders } from "@/server/orpc/context";
import { recordAuditEvent } from "@/server/services/audit";
import {
	isLoginRateLimited,
	recordLoginAttempt,
} from "@/server/services/login-attempts";

function isEmailSignIn(request: Request): boolean {
	const url = new URL(request.url);
	return request.method === "POST" && url.pathname.endsWith("/sign-in/email");
}

function isSignOut(request: Request): boolean {
	const url = new URL(request.url);
	return request.method === "POST" && url.pathname.endsWith("/sign-out");
}

// The better-auth admin plugin supplies the `role` and `banned` columns and the
// banned-session hook, but it also mounts a REST surface this app never calls:
// impersonate-user, set-role, create-user, remove-user, ban-user and friends.
// Those bypass every guard the app enforces itself, including the last-active-
// admin lock and the audit trail every account change is supposed to leave, and
// create-user would sidestep both `disableSignUp` and the invitation flow.
// Account administration belongs to the oRPC procedures, so the surface stays
// closed.
export function isBlockedAdminApi(pathname: string): boolean {
	return pathname.split("/").includes("admin");
}

async function signInEmail(request: Request): Promise<string | null> {
	try {
		const body = (await request.clone().json()) as { email?: unknown };
		return typeof body.email === "string"
			? body.email.trim().toLowerCase().slice(0, 320)
			: null;
	} catch {
		return null;
	}
}

function requestContext(request: Request, clientIp: string) {
	return {
		id: request.headers.get("x-request-id"),
		ip: clientIp,
		userAgent: request.headers.get("user-agent"),
	};
}

async function handle({ request }: { request: Request }) {
	if (isBlockedAdminApi(new URL(request.url).pathname)) {
		return Response.json({ error: "Not found" }, { status: 404 });
	}

	if (!isEmailSignIn(request)) {
		if (!isSignOut(request)) return auth.handler(request);

		const session = await auth.api.getSession({ headers: request.headers });
		const response = await auth.handler(request);
		if (response.ok && session?.user) {
			await recordAuditEvent({
				category: "auth",
				action: "auth.logout",
				actor: {
					id: session.user.id,
					email: session.user.email,
					name: session.user.name,
					role: session.user.role ?? "user",
				},
				request: requestContext(request, clientIpFromHeaders(request.headers)),
			});
		}
		return response;
	}

	const clientIp = clientIpFromHeaders(request.headers);
	const email = await signInEmail(request);
	if (await isLoginRateLimited(clientIp)) {
		await recordAuditEvent({
			category: "auth",
			action: "auth.login_rate_limited",
			success: false,
			actorEmail: email,
			request: requestContext(request, clientIp),
		});
		return Response.json(
			{ error: "Zu viele Anmeldeversuche. Bitte später erneut versuchen." },
			{ status: 429 },
		);
	}

	try {
		const response = await auth.handler(request);
		await recordLoginAttempt(clientIp, response.ok);
		let responseUser:
			| { id: string; email: string; name: string; role?: string | null }
			| undefined;
		if (response.ok) {
			try {
				const data = (await response.clone().json()) as {
					user?: typeof responseUser;
				};
				responseUser = data.user;
			} catch {
				// Better Auth may return a response body without JSON user data.
			}
		}
		await recordAuditEvent({
			category: "auth",
			action: response.ok ? "auth.login_succeeded" : "auth.login_failed",
			success: response.ok,
			actor: responseUser
				? {
						id: responseUser.id,
						email: responseUser.email,
						name: responseUser.name,
						role: responseUser.role ?? "user",
					}
				: undefined,
			actorEmail: email,
			request: requestContext(request, clientIp),
		});
		return response;
	} catch (err) {
		await recordLoginAttempt(clientIp, false);
		await recordAuditEvent({
			category: "auth",
			action: "auth.login_failed",
			success: false,
			actorEmail: email,
			request: requestContext(request, clientIp),
		});
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
