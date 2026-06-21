import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import type { Branding } from "@/lib/branding";
import { auth } from "@/server/auth";
import { getVereinsname } from "@/server/services/settings";

export type SessionUser = {
	id: string;
	email: string;
	name: string;
	role: string;
};

export const fetchSession = createServerFn({ method: "GET" }).handler(
	async (): Promise<SessionUser | null> => {
		const headers = new Headers(getRequestHeaders() as HeadersInit);
		const session = await auth.api.getSession({ headers });
		if (!session?.user) return null;
		return {
			id: session.user.id,
			email: session.user.email,
			name: session.user.name,
			role: (session.user as { role?: string }).role ?? "user",
		};
	},
);

export const fetchBranding = createServerFn({ method: "GET" }).handler(
	async (): Promise<Branding> => ({ vereinsname: await getVereinsname() }),
);
