import { ORPCError } from "@orpc/server";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setCookie } from "@tanstack/react-start/server";
import * as v from "valibot";
import type { Branding } from "@/lib/branding";
import {
	clearTenantScope,
	pinTenantScope,
	tenantRequestHeaders,
} from "@/lib/tenant-client";
import { auth } from "@/server/auth";
import {
	isOperatorHost,
	resolveOperatorSession,
} from "@/server/services/operator-auth";
import { getVereinsname } from "@/server/services/settings";
import {
	createTenant,
	isPlatformAdmin,
	listUserTenants,
	resolveHostTenant,
	resolveTenantSession,
	TenantAccessError,
} from "@/server/services/tenants";
import {
	tenantRequestHeaders as headersForTenantRequest,
	pinResolvedRequestTenant,
	withTenant,
} from "@/server/tenant-context";

type TenantChoice = {
	id: string;
	slug: string;
	name: string;
	role: "admin" | "user";
};
export type SessionUser = {
	id: string;
	email: string;
	name: string;
	role: string;
	tenant: TenantChoice;
	tenants: TenantChoice[];
	canCreateTenant: boolean;
	tenantHostBound: boolean;
};

export type OperatorUser = {
	id: string;
	email: string;
	name: string;
	role: "admin";
};
export type OperatorEntry = {
	operatorHost: boolean;
	user: OperatorUser | null;
	forbidden: boolean;
};

export const fetchOperatorSession = createServerFn({ method: "GET" }).handler(
	async (): Promise<OperatorEntry> => {
		const headers = new Headers(getRequest().headers);
		if (!isOperatorHost(headers))
			return { operatorHost: false, user: null, forbidden: false };
		try {
			const resolved = await resolveOperatorSession(headers);
			return {
				operatorHost: true,
				user: resolved?.user ?? null,
				forbidden: false,
			};
		} catch (error) {
			if (error instanceof ORPCError && error.code === "FORBIDDEN") {
				return { operatorHost: true, user: null, forbidden: true };
			}
			throw error;
		}
	},
);

function requestHeaders(): Headers {
	// During SSR, server functions execute locally and their call-option headers
	// are not a new HTTP request. Resolve an explicit page URL here as well.
	return headersForTenantRequest(getRequest());
}

async function resolveBootstrapSession() {
	const headers = requestHeaders();
	try {
		return await resolveTenantSession(headers);
	} catch (error) {
		// Only a stale preference may recover. Explicit requests must be denied.
		if (
			!(error instanceof TenantAccessError) ||
			headers.has("x-rendant-tenant")
		)
			throw error;
		const cookies = (headers.get("cookie") ?? "")
			.split(";")
			.filter((part) => !part.trim().startsWith("rendant-tenant="));
		headers.set("cookie", cookies.join(";"));
		setCookie("rendant-tenant", "", {
			path: "/",
			httpOnly: true,
			sameSite: "lax",
			secure: process.env.NODE_ENV === "production",
			maxAge: 0,
		});
		return resolveTenantSession(headers);
	}
}

async function resolveSessionUser(): Promise<SessionUser | null> {
	const resolved = await resolveBootstrapSession();
	if (!resolved) return null;
	const { user, tenant } = resolved;
	pinResolvedRequestTenant(tenant.id);
	const tenantHostBound = Boolean(await resolveHostTenant(requestHeaders()));
	const [tenants, canCreateTenant] = tenantHostBound
		? ([[tenant], false] as const)
		: await Promise.all([listUserTenants(user.id), isPlatformAdmin(user.id)]);
	return {
		...user,
		tenant,
		tenants: [...tenants],
		canCreateTenant,
		tenantHostBound,
	};
}

const fetchSessionServer = createServerFn({ method: "GET" }).handler(
	resolveSessionUser,
);

export type ClubEntry = { user: SessionUser | null; forbidden: boolean };

const fetchClubEntryServer = createServerFn({ method: "GET" }).handler(
	async (): Promise<ClubEntry> => {
		try {
			return { user: await resolveSessionUser(), forbidden: false };
		} catch (error) {
			if (!(error instanceof TenantAccessError)) throw error;
			const headers = requestHeaders();
			// Only a known club host gets a recoverable account denial. Unknown
			// hosts and the operator realm retain their separate boundaries.
			if (!(await resolveHostTenant(headers))) throw error;
			const session = await auth.api.getSession({
				headers,
				query: { disableCookieCache: true },
			});
			return { user: null, forbidden: Boolean(session?.user) };
		}
	},
);

export async function fetchClubEntry(tenantId?: string): Promise<ClubEntry> {
	const entry = await fetchClubEntryServer({
		headers: tenantId
			? { "x-rendant-tenant": tenantId }
			: tenantRequestHeaders(),
	});
	if (entry.user)
		pinTenantScope({ tenantId: entry.user.tenant.id, userId: entry.user.id });
	else clearTenantScope();
	return entry;
}

export async function fetchSession(
	tenantId?: string,
): Promise<SessionUser | null> {
	const user = await fetchSessionServer({
		headers: tenantId
			? { "x-rendant-tenant": tenantId }
			: tenantRequestHeaders(),
	});
	if (user) pinTenantScope({ tenantId: user.tenant.id, userId: user.id });
	else clearTenantScope();
	return user;
}

const fetchBrandingServer = createServerFn({ method: "GET" }).handler(
	async (): Promise<Branding> => {
		if (isOperatorHost(new Headers(getRequest().headers))) {
			return { vereinsname: "Vereinsverwaltung", operatorHost: true };
		}
		try {
			const resolved = await resolveBootstrapSession();
			if (!resolved) {
				const boundTenant = await resolveHostTenant(requestHeaders());
				return { vereinsname: boundTenant?.name ?? "Verein" };
			}
			return withTenant(resolved.tenant, async () => ({
				vereinsname: await getVereinsname(),
			}));
		} catch (error) {
			// A revoked selection must not prevent public login or invitation pages.
			if (error instanceof TenantAccessError) {
				try {
					const boundTenant = await resolveHostTenant(requestHeaders());
					return { vereinsname: boundTenant?.name ?? "Verein" };
				} catch (hostError) {
					if (hostError instanceof TenantAccessError)
						return { vereinsname: "Verein" };
					throw hostError;
				}
			}
			throw error;
		}
	},
);

export async function fetchBranding(tenantId?: string): Promise<Branding> {
	return fetchBrandingServer({
		headers: tenantId
			? { "x-rendant-tenant": tenantId }
			: tenantRequestHeaders(),
	});
}

const selectTenantServer = createServerFn({ method: "POST" })
	.validator(v.object({ tenantId: v.pipe(v.string(), v.uuid()) }))
	.handler(async ({ data }) => {
		const headers = requestHeaders();
		headers.set("x-rendant-tenant", data.tenantId);
		const resolved = await resolveTenantSession(headers);
		if (!resolved) throw new Error("Bitte melde dich an.");
		setCookie("rendant-tenant", resolved.tenant.id, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
			path: "/",
			maxAge: 60 * 60 * 24 * 365,
		});
		return { id: resolved.tenant.id };
	});

export async function selectTenant(tenantId: string): Promise<void> {
	await selectTenantServer({
		data: { tenantId },
		headers: tenantRequestHeaders(),
	});
}

const createTenantServer = createServerFn({ method: "POST" })
	.validator(
		v.object({
			name: v.pipe(
				v.string(),
				v.trim(),
				v.minLength(2, "Bitte gib den Vereinsnamen an."),
				v.maxLength(120),
			),
			slug: v.pipe(
				v.string(),
				v.trim(),
				v.regex(
					/^[a-z0-9]+(?:-[a-z0-9]+)*$/,
					"Verwende Kleinbuchstaben, Zahlen und Bindestriche.",
				),
				v.minLength(3),
				v.maxLength(50),
			),
		}),
	)
	.handler(async ({ data }) => {
		const headers = requestHeaders();
		const resolved = await resolveTenantSession(headers);
		if (!resolved) throw new Error("Bitte melde dich an.");
		if (await resolveHostTenant(headers)) throw new TenantAccessError();
		return createTenant({ ...data, actor: resolved.user });
	});

export async function addTenant(data: { name: string; slug: string }) {
	return createTenantServer({ data, headers: tenantRequestHeaders() });
}
