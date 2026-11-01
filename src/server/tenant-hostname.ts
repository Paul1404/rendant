/** Only the HTTP authority binds a tenant. Forwarded/custom host headers are not
 * trusted here: clients can supply them, and a tenant selector is not a host. */
export class TenantHostnameError extends Error {
	constructor() {
		super("Ungültige Vereinsadresse");
		this.name = "TenantHostnameError";
	}
}

function hostnameFromAuthority(authority: string): string {
	if (!authority || /[\s,@/\\?#]/.test(authority))
		throw new TenantHostnameError();
	try {
		const url = new URL(`http://${authority}`);
		if (url.username || url.password || url.pathname !== "/")
			throw new TenantHostnameError();
		return url.hostname.toLowerCase().replace(/\.$/, "");
	} catch {
		throw new TenantHostnameError();
	}
}

export function tenantSlugForHost(
	authority: string | null,
	baseDomain: string | undefined = process.env.TENANT_BASE_DOMAIN,
): string | null {
	if (!baseDomain?.trim()) return null;
	const base = baseDomain.trim().toLowerCase().replace(/\.$/, "");
	if (
		!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
			base,
		)
	) {
		throw new Error("TENANT_BASE_DOMAIN ist keine gültige Domain");
	}
	if (authority === null) return null;
	const hostname = hostnameFromAuthority(authority);
	if (hostname === base || !hostname.endsWith(`.${base}`)) return null;
	const slug = hostname.slice(0, -base.length - 1);
	if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug))
		throw new TenantHostnameError();
	return slug;
}
