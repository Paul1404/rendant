// Injected at build time by Vite (see vite.config.ts `define`).
declare const __APP_VERSION__: string;

// Raw text import of markdown files via Vite's `?raw` query.
declare module "*.md?raw" {
	const content: string;
	export default content;
}
