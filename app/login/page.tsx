import Image from "next/image";
import { LoginForm } from "@/components/login-form";
import { VEREINSNAME } from "@/lib/constants";
import { ShieldCheck } from "lucide-react";

type SearchParams = Promise<{ from?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { from } = await searchParams;
  return (
    <div className="relative flex flex-1 items-center justify-center px-4 py-12 sm:py-16">
      <div
        aria-hidden
        className="bg-grid-faint pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_50%_40%_at_50%_30%,black,transparent_75%)]"
      />
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <div className="mb-5 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-white p-2 shadow-lg shadow-primary/10 ring-1 ring-foreground/10">
            <Image
              src="/logo-svu.png"
              alt="SV 1945 Untereuerheim e.V. Wappen"
              width={128}
              height={128}
              priority
              className="h-full w-auto object-contain"
            />
          </div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
            Kassenzählprotokoll
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            SVUFO
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{VEREINSNAME}</p>
        </div>

        <div className="mt-7 rounded-2xl border border-border/70 bg-card/80 p-1 shadow-xl shadow-foreground/5 backdrop-blur">
          <LoginForm
            redirectTo={from && from.startsWith("/") ? from : "/protokolle"}
          />
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Interner Zugang &middot; nur für berechtigte Personen
        </p>
      </div>
    </div>
  );
}
