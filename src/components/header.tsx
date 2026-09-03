import { Link, useRouteContext, useRouterState } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useTransition } from "react";
import { BrandLockup } from "@/components/brand-lockup";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { authClient } from "@/lib/auth-client";
import { APP_NAV_ITEMS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function Header() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const { user } = useRouteContext({ from: "/protokolle" });
	const navItems = APP_NAV_ITEMS.filter(
		(item) => !item.adminOnly || user.role === "admin",
	);
	const [pending, startTransition] = useTransition();

	function logout() {
		startTransition(async () => {
			await authClient.signOut();
			window.location.assign("/login");
		});
	}

	return (
		<header className="sticky top-0 z-30 border-b border-nav-accent/20 bg-nav text-nav-foreground shadow-sm">
			{/* Same max width and padding as the page container in route.tsx, so
			    the wordmark and the page title share one left edge. */}
			<div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6 2xl:flex 2xl:justify-between 2xl:gap-4">
				<Link
					to="/protokolle"
					aria-label="Rendant Startseite"
					className="group shrink-0 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-nav-accent/80"
				>
					<BrandLockup variant="bar" onDark className="text-nav-foreground" />
				</Link>

				<nav aria-label="Hauptnavigation" className="hidden shrink-0 2xl:block">
					<div className="flex w-max items-center gap-0.5 whitespace-nowrap rounded-lg border border-nav-accent/25 bg-white/5 p-1">
						{navItems.map(({ href, label, icon: Icon, exact }) => {
							const active = exact
								? pathname === href
								: pathname.startsWith(href);
							return (
								<Button
									key={href}
									asChild
									variant="ghost"
									size="sm"
									className={cn(
										"h-8 rounded-lg px-3 focus-visible:border-nav-accent focus-visible:ring-nav-accent/80",
										active
											? "bg-nav-accent/15 text-nav-accent hover:bg-nav-accent/20 hover:text-nav-accent"
											: "text-nav-foreground/70 hover:bg-white/8 hover:text-nav-foreground",
									)}
								>
									<Link to={href} aria-current={active ? "page" : undefined}>
										<Icon className="mr-1.5 h-4 w-4" />
										{label}
									</Link>
								</Button>
							);
						})}
					</div>
				</nav>

				<div className="flex shrink-0 items-center justify-end gap-1">
					<ThemeToggle variant="nav" />

					<span
						className="mx-1 hidden h-5 w-px bg-nav-accent/25 sm:block"
						aria-hidden
					/>
					<Button
						variant="ghost"
						size="sm"
						onClick={logout}
						disabled={pending}
						className="text-nav-foreground/70 hover:bg-white/8 hover:text-nav-foreground focus-visible:border-nav-accent focus-visible:ring-nav-accent/80"
					>
						<LogOut className="h-4 w-4 sm:mr-1.5" />
						<span className="hidden sm:inline">Abmelden</span>
					</Button>
				</div>

				<nav
					aria-label="Hauptnavigation"
					className="order-3 col-span-2 min-w-0 2xl:hidden"
				>
					<TooltipProvider>
						<div
							className="grid gap-0 rounded-lg border border-nav-accent/25 bg-white/5 p-1 sm:gap-1"
							style={{
								gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))`,
							}}
						>
							{navItems.map(({ href, label, icon: Icon, exact }) => {
								const active = exact
									? pathname === href
									: pathname.startsWith(href);
								return (
									<Tooltip key={href}>
										<TooltipTrigger asChild>
											<Button
												asChild
												variant="ghost"
												size="sm"
												className={cn(
													// Every override here needs its `sm:` twin. A responsive
													// utility from `size` sits in a different merge group and
													// would otherwise outrank the unprefixed value, which is
													// what previously pinned this link to the icon's width.
													"h-11 w-full min-w-0 border px-2 sm:h-11 sm:px-2 lg:px-3 focus-visible:border-nav-accent focus-visible:ring-nav-accent/80",
													active
														? "border-nav-accent/30 bg-nav-accent/15 text-nav-accent hover:bg-nav-accent/20 hover:text-nav-accent"
														: "border-transparent text-nav-foreground/70 hover:bg-white/8 hover:text-nav-foreground",
												)}
											>
												<Link
													to={href}
													aria-label={label}
													aria-current={active ? "page" : undefined}
												>
													<Icon className="h-4 w-4 shrink-0 lg:mr-1.5" />
													<span className="sr-only lg:not-sr-only lg:truncate">
														{label}
													</span>
												</Link>
											</Button>
										</TooltipTrigger>
										<TooltipContent side="bottom">{label}</TooltipContent>
									</Tooltip>
								);
							})}
						</div>
					</TooltipProvider>
				</nav>
			</div>
		</header>
	);
}
