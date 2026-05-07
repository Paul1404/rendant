import { LoginForm } from "@/components/login-form";
import { VEREINSNAME } from "@/lib/constants";

type SearchParams = Promise<{ from?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { from } = await searchParams;
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center text-center">
          <span
            aria-hidden
            className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-md bg-[oklch(0.305_0.045_255)] text-sm font-bold tracking-tight text-white"
          >
            SV
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Kassenzählprotokoll
          </h1>
          <p className="text-xs uppercase tracking-wider text-slate-500 mt-1">
            {VEREINSNAME}
          </p>
        </div>
        <LoginForm redirectTo={from && from.startsWith("/") ? from : "/protokolle"} />
        <p className="text-center text-[11px] text-slate-400">
          Interner Zugang &middot; nur für berechtigte Personen
        </p>
      </div>
    </div>
  );
}
