import { Header } from "@/components/header";
import { VEREINSNAME } from "@/lib/constants";

export default function ProtokolleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
      <footer className="mt-auto border-t border-border/70 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-[11px] text-muted-foreground sm:px-6">
          <span>
            &copy; {new Date().getFullYear()} {VEREINSNAME}
          </span>
          <span className="font-mono uppercase tracking-[0.14em]">
            SVUFO &middot; Interne Anwendung
          </span>
        </div>
      </footer>
    </>
  );
}
