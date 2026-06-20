/// <reference types="vite/client" />

import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
	useRouteContext,
} from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { ErrorView, NotFoundView } from "@/components/error-states";
import { Toaster } from "@/components/ui/sonner";
import type { Branding } from "@/lib/branding";
import { fetchBranding } from "@/lib/server-fns";
import type { RouterContext } from "@/router";
import appCss from "@/styles.css?url";

export const Route = createRootRouteWithContext<RouterContext>()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "SVUFO · Kassenzählprotokoll" },
			{
				name: "description",
				content: "Digitale Erfassung von Kassenzählprotokollen.",
			},
			{ name: "theme-color", content: "#b3331f" },
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
			{
				rel: "icon",
				href: "/favicon-32.png",
				sizes: "32x32",
				type: "image/png",
			},
			{
				rel: "icon",
				href: "/favicon-16.png",
				sizes: "16x16",
				type: "image/png",
			},
			{ rel: "shortcut icon", href: "/favicon.ico" },
			{
				rel: "apple-touch-icon",
				href: "/apple-touch-icon.png",
				sizes: "180x180",
			},
			{ rel: "manifest", href: "/manifest.webmanifest" },
		],
	}),
	loader: async (): Promise<{ branding: Branding }> => ({
		branding: await fetchBranding(),
	}),
	notFoundComponent: () => <NotFoundView />,
	errorComponent: ({ error, reset }) => (
		<ErrorView error={error} reset={reset} />
	),
	component: RootComponent,
});

export function useBranding(): Branding {
	return Route.useLoaderData().branding;
}

export function useRouterAppContext(): RouterContext {
	return useRouteContext({ from: Route.id });
}

function RootComponent() {
	return (
		<RootDocument>
			<Outlet />
		</RootDocument>
	);
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="de" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body>
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					enableSystem
					disableTransitionOnChange
				>
					<div className="flex min-h-dvh flex-col">{children}</div>
					<Toaster richColors position="top-center" />
				</ThemeProvider>
				<Scripts />
			</body>
		</html>
	);
}
