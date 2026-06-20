// Branding read at runtime from the environment so the public repository stays
// generic while a deployment can rebrand without touching code or rebuilding.
// Server-only: do not import this from a client component. The values are
// surfaced to the browser through the root route loader (see __root.tsx).

export type Branding = {
	vereinsname: string;
	logoUrl: string;
};

export function getBranding(): Branding {
	return {
		vereinsname: process.env.VEREINSNAME?.trim() || "Verein",
		logoUrl: process.env.LOGO_URL?.trim() || "/logo.svg",
	};
}
