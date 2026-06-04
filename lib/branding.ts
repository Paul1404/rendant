// Branding read at runtime from the environment so the public repository
// stays generic while a deployment can rebrand without touching code or
// rebuilding. Server-only: do not import this from client components, since
// these values are not exposed to the browser bundle. Pass them down as props.

export const VEREINSNAME = process.env.VEREINSNAME?.trim() || "Verein";

// URL or path to the logo. Defaults to the neutral logo bundled in /public.
// Set LOGO_URL to an external image URL (or another local path) to rebrand.
export const LOGO_URL = process.env.LOGO_URL?.trim() || "/logo.svg";
