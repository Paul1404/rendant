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
        <div className="text-center">
          <h1 className="text-2xl font-semibold">SVUFO</h1>
          <p className="text-sm text-neutral-600 mt-1">{VEREINSNAME}</p>
        </div>
        <LoginForm redirectTo={from && from.startsWith("/") ? from : "/protokolle"} />
      </div>
    </div>
  );
}
