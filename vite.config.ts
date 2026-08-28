import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const pkg = JSON.parse(
	readFileSync(
		fileURLToPath(new URL("./package.json", import.meta.url)),
		"utf8",
	),
) as { version: string };

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
	},
	plugins: [
		devtools(),
		nitro({
			// React PDF and PDFKit use package-level runtime mappings for standard
			// fonts. Bundling them rewrites those private imports and leaves the
			// production server unable to resolve Helvetica. The Docker runtime
			// already contains production node_modules, so keep this graph external.
			rollupConfig: { external: [/^@sentry\//, /^@react-pdf\//, "pdfkit"] },
		}),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});

export default config;
