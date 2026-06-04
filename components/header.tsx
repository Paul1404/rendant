"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut, Plus, Download, List, Settings } from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

type HeaderProps = {
  vereinsname: string;
  logoUrl: string;
};

const NAV = [
  { href: "/protokolle", label: "Protokolle", icon: List, exact: true },
  { href: "/protokolle/neu", label: "Neu", icon: Plus },
  { href: "/protokolle/export", label: "Export", icon: Download },
  { href: "/protokolle/einstellungen", label: "Einstellungen", icon: Settings },
];

export function Header({ vereinsname, logoUrl }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/75 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/protokolle"
          className="flex items-center gap-3 group rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Logo size={40} priority src={logoUrl} />
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="text-sm font-semibold tracking-tight text-foreground">
              SVUFO
            </span>
            <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {vereinsname}
            </span>
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          <div className="hidden items-center gap-0.5 rounded-xl border border-border/70 bg-background/60 p-1 shadow-sm md:flex">
            {NAV.map(({ href, label, icon: Icon, exact }) => {
              const active = exact
                ? pathname === href
                : pathname.startsWith(href);
              return (
                <Link key={href} href={href}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-8 rounded-lg px-3",
                      active
                        ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="mr-1.5 h-4 w-4" />
                    {label}
                  </Button>
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-1 md:hidden">
            {NAV.map(({ href, label, icon: Icon, exact }) => {
              const active = exact
                ? pathname === href
                : pathname.startsWith(href);
              return (
                <Link key={href} href={href} aria-label={label}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className={cn(
                      active
                        ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                </Link>
              );
            })}
          </div>

          <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
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
