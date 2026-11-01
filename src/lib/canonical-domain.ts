import {
	configuredTenantHostBindings,
	tenantCanonicalHost,
} from "@/lib/tenant-host-aliases";

const LEGACY_COMPATIBILITY_PREFIXES = ["/api", "/assets", "/_serverFn"];
const LEGACY_COMPATIBILITY_FILES = new Set([
	"/apple-touch-icon.png",
	"/favicon.ico",
	"/favicon.svg",
	"/favicon-16.png",
	"/favicon-32.png",
	"/icon-192.png",
	"/icon-512.png",
	"/logo.svg",
	"/logo-maskable.svg",
	"/logo-square.svg",
	"/manifest.webmanifest",
]);

function requestHostname(request: Request): string | null {
	const url = new URL(request.url);
	const actual = url.hostname.toLowerCase().replace(/\.$/, "");
	const authority = request.headers.get("host");
	if (authority !== null) {
		if (/[\s,@/\\?#]/.test(authority)) return null;
		try {
			const supplied = new URL(`${url.protocol}//${authority}`);
			if (
				supplied.hostname.toLowerCase().replace(/\.$/, "") !== actual ||
				supplied.port !== url.port
			)
				return null;
		} catch {
			return null;
		}
	}
	return actual;
}

function isCompatibilityRequest(request: Request, pathname: string): boolean {
	if (request.method !== "GET" && request.method !== "HEAD") return true;
	if (LEGACY_COMPATIBILITY_FILES.has(pathname)) return true;
	return LEGACY_COMPATIBILITY_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
	);
}

export function legacyDomainRedirect(request: Request): Response | null {
	const hostname = requestHostname(request);
	if (!hostname) return null;
	const target = new URL(request.url);
	if (isCompatibilityRequest(request, target.pathname)) return null;
	// Redirects activate separately from binding so DNS and TLS can be verified
	// before normal browser navigation leaves the old, still-pinned hosts.
	const baseDomain = process.env.TENANT_CANONICAL_BASE_DOMAIN?.trim()
		.toLowerCase()
		.replace(/\.$/, "");
	if (!baseDomain) return null;
	if (
		!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
			baseDomain,
		)
	)
		throw new Error("TENANT_CANONICAL_BASE_DOMAIN ist keine gültige Domain");
	const boundBase = process.env.TENANT_BASE_DOMAIN?.trim()
		.toLowerCase()
		.replace(/\.$/, "");
	if (boundBase !== baseDomain)
		throw new Error(
			"Die Weiterleitungsdomain muss der gemeinsamen Rendant-Domain entsprechen",
		);
	const canonicalJson = process.env.TENANT_CANONICAL_HOSTS_JSON;
	const slug = configuredTenantHostBindings(
		process.env.TENANT_HOST_ALIASES_JSON,
		canonicalJson,
		baseDomain,
	).get(hostname);
	if (!slug) return null;
	const destination = tenantCanonicalHost(slug, baseDomain, canonicalJson);
	if (!destination) return null;
	if (hostname === destination) return null;
	target.protocol = "https:";
	target.hostname = destination;
	target.port = "";
	return new Response(null, {
		status: 308,
		headers: {
			"Cache-Control": "public, max-age=3600",
			Location: target.toString(),
			Vary: "Host",
		},
	});
}
