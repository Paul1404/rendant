import { ORPCError } from "@orpc/server";
import { auth } from "@/server/auth";
import { isOperatorHost } from "@/server/operator-host";
import { isPlatformAdmin } from "./tenants";

export { isOperatorHost } from "@/server/operator-host";

export async function resolveOperatorSession(headers: Headers) {
	if (!isOperatorHost(headers))
		throw new ORPCError("FORBIDDEN", {
			message:
				"Die Vereinsverwaltung ist nur über die Betreiberadresse erreichbar",
		});
	const session = await auth.api.getSession({
		headers,
		query: { disableCookieCache: true },
	});
	if (!session?.user) return null;
	if (!(await isPlatformAdmin(session.user.id)))
		throw new ORPCError("FORBIDDEN", {
			message: "Für die Betreiberverwaltung besteht keine Berechtigung",
		});
	return {
		session,
		user: {
			id: session.user.id,
			email: session.user.email,
			name: session.user.name,
			role: "admin" as const,
		},
	};
}
