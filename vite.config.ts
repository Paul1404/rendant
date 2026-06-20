import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const pkg = JSON.parse(
	readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8"),
) as { version: string };

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
	},
	plugins: [
		devtools(),
		nitro({ rollupConfig: { external: [/^@sentry\//] } }),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});

export default config;
