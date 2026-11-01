import { configuredTenantHostBindings } from "@/lib/tenant-host-aliases";

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
	aliasesJson: string | undefined = process.env.TENANT_HOST_ALIASES_JSON,
	canonicalJson: string | undefined = process.env.TENANT_CANONICAL_HOSTS_JSON,
): string | null {
	if (authority === null) return null;
	const hostname = hostnameFromAuthority(authority);
	const aliases = configuredTenantHostBindings(
		aliasesJson,
		canonicalJson,
		baseDomain,
	);
	const alias = aliases.get(hostname);
	if (!baseDomain?.trim()) return alias ?? null;
	const base = baseDomain.trim().toLowerCase().replace(/\.$/, "");
	if (
		!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
			base,
		)
	) {
		throw new Error("TENANT_BASE_DOMAIN ist keine gültige Domain");
	}
	if (hostname === base) {
		if (alias)
			throw new Error(
				"Die gemeinsame Rendant-Adresse darf keinem einzelnen Verein zugeordnet werden",
			);
		return null;
	}
	if (alias) return alias;
	if (!hostname.endsWith(`.${base}`)) return null;
	const slug = hostname.slice(0, -base.length - 1);
	if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug))
		throw new TenantHostnameError();
	return slug;
}
