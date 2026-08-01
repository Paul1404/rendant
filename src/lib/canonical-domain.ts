export const CANONICAL_HOST = "rendant.sv-untereuerheim.de";
export const LEGACY_HOST = "svufo.sv-untereuerheim.de";

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

function parseHostname(value: string | null): string | null {
	const first = value?.split(",", 1)[0]?.trim();
	if (!first) return null;
	try {
		return new URL(`http://${first}`).hostname.toLowerCase().replace(/\.$/, "");
	} catch {
		return null;
	}
}

function requestHostname(request: Request): string | null {
	return (
		parseHostname(request.headers.get("x-forwarded-host")) ??
		new URL(request.url).hostname.toLowerCase().replace(/\.$/, "")
	);
}

function isCompatibilityRequest(request: Request, pathname: string): boolean {
	if (request.method !== "GET" && request.method !== "HEAD") return true;
	if (LEGACY_COMPATIBILITY_FILES.has(pathname)) return true;
	return LEGACY_COMPATIBILITY_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
	);
}

export function legacyDomainRedirect(request: Request): Response | null {
	if (requestHostname(request) !== LEGACY_HOST) return null;

	const target = new URL(request.url);
	if (isCompatibilityRequest(request, target.pathname)) return null;

	target.protocol = "https:";
	target.hostname = CANONICAL_HOST;
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
