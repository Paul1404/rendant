"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut, Plus, Download, List } from "lucide-react";
import { VEREINSNAME } from "@/lib/constants";

export function Header() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-5xl px-4 py-2.5 flex items-center justify-between gap-4">
        <Link href="/protokolle" className="flex items-center gap-2.5 group">
          <span
            aria-hidden
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm bg-[oklch(0.305_0.045_255)] text-[0.7rem] font-bold tracking-tight text-white"
          >
            SV
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-semibold leading-tight tracking-tight text-slate-900">
              SVUFO
            </span>
            <span className="text-[11px] uppercase tracking-wider text-slate-500 leading-tight">
              {VEREINSNAME}
            </span>
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link href="/protokolle">
            <Button variant="ghost" size="sm">
              <List className="mr-2 h-4 w-4" />
              Liste
            </Button>
          </Link>
          <Link href="/protokolle/neu">
            <Button variant="ghost" size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Neu
            </Button>
          </Link>
          <Link href="/protokolle/export">
            <Button variant="ghost" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </Link>
          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="mr-2 h-4 w-4" />
            Abmelden
          </Button>
        </nav>
      </div>
    </header>
  );
}
