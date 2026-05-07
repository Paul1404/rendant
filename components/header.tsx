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
    <header className="border-b bg-white">
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between gap-4">
        <Link href="/protokolle" className="flex flex-col">
          <span className="font-semibold leading-tight">SVUFO</span>
          <span className="text-xs text-neutral-600 leading-tight">
            {VEREINSNAME}
          </span>
        </Link>
        <nav className="flex items-center gap-2">
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
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="mr-2 h-4 w-4" />
            Abmelden
          </Button>
        </nav>
      </div>
    </header>
  );
}
