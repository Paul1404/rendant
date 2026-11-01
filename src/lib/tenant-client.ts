/** The open tab keeps its club even when another tab changes the selection cookie. */
export type TenantClientScope = { tenantId: string; userId: string };
let activeScope: TenantClientScope | null = null;

export function pinTenantScope(scope: TenantClientScope): void {
	if (typeof window !== "undefined") activeScope = scope;
}

export function clearTenantScope(): void {
	if (typeof window !== "undefined") activeScope = null;
}

export function tenantRequestHeaders(): Record<string, string> {
	return activeScope ? { "x-rendant-tenant": activeScope.tenantId } : {};
}

export function tenantApiUrl(
	path: string,
	tenantId = activeScope?.tenantId,
): string {
	if (!tenantId) return path;
	const url = new URL(path, "http://rendant.local");
	url.searchParams.set("tenant", tenantId);
	return `${url.pathname}${url.search}${url.hash}`;
}

export function tenantFetch(
	input: string,
	init?: RequestInit,
): Promise<Response> {
	const headers = new Headers(init?.headers);
	for (const [name, value] of Object.entries(tenantRequestHeaders())) {
		headers.set(name, value);
	}
	return fetch(input, { ...init, headers });
}

export function tenantStorageKey(
	key: string,
	scope: TenantClientScope | null = activeScope,
): string | null {
	return scope ? `${key}:${scope.tenantId}:${scope.userId}` : null;
}
