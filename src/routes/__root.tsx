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
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Branding } from "@/lib/branding";
import { fetchBranding } from "@/lib/server-fns";
import { APP_VERSION } from "@/lib/version";
import type { RouterContext } from "@/router";
import appCss from "@/styles.css?url";

// Version-stamp icon URLs so a logo change propagates past the long edge/browser
// cache on these static assets the moment the version bumps.
const v = `?v=${APP_VERSION}`;

export const Route = createRootRouteWithContext<RouterContext>()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Rendant · Finanzverwaltung für Vereine" },
			{
				name: "description",
				content: "Finanzverwaltung für Vereine.",
			},
			{ name: "theme-color", content: "#0F2A22" },
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", href: `/favicon.svg${v}`, type: "image/svg+xml" },
			{
				rel: "icon",
				href: `/favicon-32.png${v}`,
				sizes: "32x32",
				type: "image/png",
			},
			{
				rel: "icon",
				href: `/favicon-16.png${v}`,
				sizes: "16x16",
				type: "image/png",
			},
			{ rel: "shortcut icon", href: `/favicon.ico${v}` },
			{
				rel: "apple-touch-icon",
				href: `/apple-touch-icon.png${v}`,
				sizes: "180x180",
			},
			{ rel: "manifest", href: `/manifest.webmanifest${v}` },
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
				<a
					href="#main-content"
					className="sr-only z-50 rounded-md bg-popover px-4 py-2 text-sm font-medium text-popover-foreground ring-1 ring-foreground/10 focus:not-sr-only focus:absolute focus:top-4 focus:left-4"
				>
					Zum Inhalt springen
				</a>
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					enableSystem
					disableTransitionOnChange
				>
					<TooltipProvider delayDuration={300}>
						<div className="flex min-h-dvh flex-col">{children}</div>
						<Toaster richColors position="top-center" />
					</TooltipProvider>
				</ThemeProvider>
				<Scripts />
			</body>
		</html>
	);
}
