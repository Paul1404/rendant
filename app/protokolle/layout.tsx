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
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between text-[11px] text-slate-500">
          <span>&copy; {new Date().getFullYear()} {VEREINSNAME}</span>
          <span className="font-mono uppercase tracking-wider">
            SVUFO &middot; Interne Anwendung
          </span>
        </div>
      </footer>
    </>
  );
}
