import { Link, useRouteContext, useRouterState } from "@tanstack/react-router";
import {
	ChartNoAxesColumnIncreasing,
	Download,
	List,
	LogOut,
	Plus,
	Settings,
	ShieldCheck,
} from "lucide-react";
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
import { cn } from "@/lib/utils";

type NavItem = {
	href:
		| "/protokolle"
		| "/protokolle/neu"
		| "/protokolle/umsaetze"
		| "/protokolle/export"
		| "/protokolle/audit"
		| "/protokolle/einstellungen";
	label: string;
	icon: typeof List;
	exact?: boolean;
	adminOnly?: boolean;
};

const NAV: NavItem[] = [
	{ href: "/protokolle", label: "Protokolle", icon: List, exact: true },
	{ href: "/protokolle/neu", label: "Neu", icon: Plus },
	{
		href: "/protokolle/umsaetze",
		label: "Umsätze",
		icon: ChartNoAxesColumnIncreasing,
	},
	{ href: "/protokolle/export", label: "Import & Export", icon: Download },
	{
		href: "/protokolle/audit",
		label: "Audit-Log",
		icon: ShieldCheck,
		adminOnly: true,
	},
	{ href: "/protokolle/einstellungen", label: "Einstellungen", icon: Settings },
];

export function Header() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const { user } = useRouteContext({ from: "/protokolle" });
	const navItems = NAV.filter(
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
			<div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6 lg:flex lg:justify-between lg:gap-4">
				<Link
					to="/protokolle"
					aria-label="Rendant Startseite"
					className="group rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
				>
					<BrandLockup variant="bar" onDark className="text-nav-foreground" />
				</Link>

				<nav
					aria-label="Hauptnavigation"
					className="order-3 col-span-2 min-w-0 lg:order-none lg:col-span-1"
				>
					<div className="hidden items-center gap-0.5 rounded-lg border border-nav-accent/25 bg-white/5 p-1 lg:flex">
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
										"h-8 rounded-lg px-3",
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

					<TooltipProvider>
						<div className="flex items-center justify-between gap-1 rounded-lg border border-nav-accent/25 bg-white/5 p-1 lg:hidden">
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
												size="icon-sm"
												className={cn(
													"border",
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
													<Icon className="h-4 w-4" />
													<span className="sr-only">{label}</span>
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

				<div className="flex items-center justify-end gap-1">
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
						className="text-nav-foreground/70 hover:bg-white/8 hover:text-nav-foreground"
					>
						<LogOut className="h-4 w-4 sm:mr-1.5" />
						<span className="hidden sm:inline">Abmelden</span>
					</Button>
				</div>
			</div>
		</header>
	);
}
