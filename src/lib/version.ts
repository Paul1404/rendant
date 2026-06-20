// Single source of truth for the app version, injected from package.json at
// build time. Bump `version` in package.json on every release; the chip in the
// footer updates automatically.
export const APP_VERSION: string =
	typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";
