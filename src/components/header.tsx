import { Link, useRouteContext, useRouterState } from "@tanstack/react-router";
import {
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
	{ href: "/protokolle/export", label: "Export", icon: Download },
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
		<header className="sticky top-0 z-30 border-b border-border/70 bg-background/75 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
			<div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
				<Link
					to="/protokolle"
					aria-label="SVUFO Startseite"
					className="group rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
				>
					<BrandLockup variant="bar" />
				</Link>

				<nav className="flex items-center gap-1">
					<div className="hidden items-center gap-0.5 rounded-xl border border-border/70 bg-background/60 p-1 shadow-sm md:flex">
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
											? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
											: "text-muted-foreground hover:text-foreground",
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
						<div className="flex items-center gap-0.5 md:hidden">
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
														? "border-primary/25 bg-primary/12 text-primary hover:bg-primary/15 hover:text-primary"
														: "border-transparent text-muted-foreground hover:text-foreground",
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

					<ThemeToggle />

					<span
						className="mx-1 hidden h-5 w-px bg-border sm:block"
						aria-hidden
					/>
					<Button
						variant="ghost"
						size="sm"
						onClick={logout}
						disabled={pending}
						className="text-muted-foreground hover:text-foreground"
					>
						<LogOut className="h-4 w-4 sm:mr-1.5" />
						<span className="hidden sm:inline">Abmelden</span>
					</Button>
				</nav>
			</div>
		</header>
	);
}
