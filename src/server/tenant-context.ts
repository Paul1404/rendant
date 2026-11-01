import { AsyncLocalStorage } from "node:async_hooks";

export const SVU_TENANT_ID = "00000000-0000-4000-8000-000000000001";

export type TenantContext = {
	id: string;
	slug: string;
	name: string;
	role?: "admin" | "user";
};

const storage = new AsyncLocalStorage<TenantContext>();
const requestSelection = new AsyncLocalStorage<{ tenantId?: string }>();

export function withTenantRequest<T>(work: () => T): T {
	return requestSelection.run({}, work);
}

export function pinResolvedRequestTenant(tenantId: string): void {
	const request = requestSelection.getStore();
	if (request) request.tenantId = tenantId;
}

export function resolvedRequestTenant(): string | undefined {
	return requestSelection.getStore()?.tenantId;
}

export class TenantSelectionError extends Error {
	constructor() {
		super("Widersprüchliche Vereinsauswahl");
		this.name = "TenantSelectionError";
	}
}

export function currentTenant(): TenantContext | undefined {
	return storage.getStore();
}

export function requireTenant(): TenantContext {
	const tenant = currentTenant();
	if (!tenant) throw new Error("Vereinskontext fehlt");
	return tenant;
}

export function withTenant<T>(
	tenant: TenantContext,
	work: () => PromiseLike<T>,
): Promise<T>;
export function withTenant<T>(tenant: TenantContext, work: () => T): T;
export function withTenant<T>(
	tenant: TenantContext,
	work: () => T | PromiseLike<T>,
): T | Promise<T> {
	if (
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
			tenant.id,
		)
	) {
		throw new Error("Ungültiger Vereinskontext");
	}
	return storage.run(Object.freeze({ ...tenant }), () => {
		const result = work();
		// Drizzle queries are lazy thenables. Assimilate them inside this scope,
		// even when the caller awaits the returned value after storage.run exits.
		if (result && typeof (result as { then?: unknown }).then === "function") {
			return Promise.resolve(result as PromiseLike<T>);
		}
		return result as T;
	});
}

export function tenantRequestHeaders(request: Request): Headers {
	const headers = new Headers(request.headers);
	const query = new URL(request.url).searchParams.get("tenant");
	const explicit = headers.get("x-rendant-tenant");
	if (query && explicit && query !== explicit) {
		throw new TenantSelectionError();
	}
	if (query) headers.set("x-rendant-tenant", query);
	return headers;
}

export async function withRequestTenant(
	request: Request,
	work: (
		context: NonNullable<
			Awaited<
				ReturnType<typeof import("./services/tenants").resolveTenantSession>
			>
		>,
	) => Promise<Response>,
): Promise<Response> {
	const { resolveTenantSession, TenantAccessError } = await import(
		"./services/tenants"
	);
	let context: Awaited<ReturnType<typeof resolveTenantSession>>;
	try {
		context = await resolveTenantSession(tenantRequestHeaders(request));
	} catch (error) {
		if (error instanceof TenantAccessError) {
			return Response.json({ error: error.message }, { status: error.status });
		}
		if (error instanceof TenantSelectionError) {
			return Response.json({ error: error.message }, { status: 400 });
		}
		throw error;
	}
	if (!context)
		return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
	return withTenant(context.tenant, () => work(context));
}
