import {
	LEGACY_TENANT_HOST_ALIASES,
	tenantCanonicalHost,
} from "@/lib/tenant-host-aliases";
import { resolveTrustedOrigins } from "@/server/auth-origins";
import { tenantSlugForHost } from "@/server/tenant-hostname";

function configuredOrigins(): string[] {
	return resolveTrustedOrigins(
		process.env.BETTER_AUTH_URL,
		process.env.AUTH_TRUSTED_ORIGINS,
	);
}

function primaryOrigin(): string | null {
	const configured = process.env.BETTER_AUTH_URL?.trim();
	return configured ? new URL(configured).origin : null;
}

function trustedRequestOrigin(
	headers: Headers,
	origins: string[],
): string | null {
	const host = headers.get("host")?.toLowerCase();
	if (!host || /[\s,@/\\?#]/.test(host)) return null;
	for (const origin of origins) {
		try {
			const candidate = new URL(`${new URL(origin).protocol}//${host}`);
			if (candidate.origin === origin) return origin;
		} catch {
			// Malformed authorities never supply a public link destination.
		}
	}
	return null;
}

// An exact configured origin supplies both the hostname and protocol. Forwarded
// headers and Origin never choose where an invitation token is sent.
export function publicBaseUrl(headers: Headers): string | null {
	const trusted = trustedRequestOrigin(headers, configuredOrigins());
	if (trusted) return trusted;
	const primary = primaryOrigin();
	if (primary || process.env.NODE_ENV === "production") return primary;

	// Preserve local previews on other ports without trusting arbitrary hosts.
	const host = headers.get("host");
	if (!host || /[\s,@/\\?#]/.test(host)) return null;
	try {
		const url = new URL(`http://${host}`);
		return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
			? url.origin
			: null;
	} catch {
		return null;
	}
}

export function tenantPublicBaseUrl(
	tenant: { id: string; slug: string },
	headers?: Headers,
): string | null {
	const origins = configuredOrigins();
	const baseDomain = process.env.TENANT_BASE_DOMAIN;
	const hostname = tenantCanonicalHost(
		tenant.slug,
		baseDomain,
		process.env.TENANT_CANONICAL_HOSTS_JSON,
	);
	const normalizeDomain = (domain: string | undefined) =>
		domain?.trim().toLowerCase().replace(/\.$/, "");
	const canonicalActive =
		Boolean(baseDomain?.trim()) &&
		normalizeDomain(process.env.TENANT_CANONICAL_BASE_DOMAIN) ===
			normalizeDomain(baseDomain);
	if (hostname && canonicalActive) {
		const candidate = `https://${hostname}`;
		// Origin approval and the cutover gate are separate: DNS and TLS must be
		// ready before new links leave the working legacy addresses.
		if (
			origins.includes(candidate) &&
			tenantSlugForHost(hostname) === tenant.slug
		)
			return candidate;
	}
	if (headers) {
		const actual = trustedRequestOrigin(headers, origins);
		if (actual && tenantSlugForHost(new URL(actual).host) === tenant.slug)
			return actual;
	}
	const legacy = origins.find(
		(origin) =>
			LEGACY_TENANT_HOST_ALIASES[new URL(origin).hostname] === tenant.slug,
	);
	if (legacy) return legacy;
	const primary = primaryOrigin();
	if (primary) {
		const boundSlug = tenantSlugForHost(new URL(primary).host);
		return boundSlug === null || boundSlug === tenant.slug ? primary : null;
	}
	if (headers && process.env.NODE_ENV !== "production") {
		const local = publicBaseUrl(headers);
		if (local && tenantSlugForHost(new URL(local).host) === null) return local;
	}
	return null;
}
