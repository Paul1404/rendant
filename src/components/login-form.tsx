import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [pending, startTransition] = useTransition();

	function submit(e: React.FormEvent) {
		e.preventDefault();
		if (!email || !password) return;
		startTransition(async () => {
			const { error } = await authClient.signIn.email({ email, password });
			if (error) {
				toast.error(
					error.code === "INVALID_EMAIL_OR_PASSWORD"
						? "E-Mail oder Passwort falsch"
						: (error.message ?? "Anmeldung fehlgeschlagen"),
				);
				return;
			}
			// Full-document navigation so the freshly set session cookie drives a
			// clean SSR load of the target route.
			window.location.assign(redirectTo);
		});
	}

	return (
		<div className="rounded-xl bg-background/60 p-6">
			<form className="space-y-4" onSubmit={submit}>
				<div className="space-y-2">
					<Label htmlFor="email">E-Mail</Label>
					<Input
						id="email"
						type="email"
						autoComplete="username"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
						className="h-10"
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="password">Passwort</Label>
					<div className="relative">
						<Input
							id="password"
							type={showPassword ? "text" : "password"}
							autoComplete="current-password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							className="h-10 pr-10"
						/>
						<button
							type="button"
							onClick={() => setShowPassword((v) => !v)}
							aria-label={
								showPassword ? "Passwort verbergen" : "Passwort anzeigen"
							}
							tabIndex={-1}
							className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
						>
							{showPassword ? (
								<EyeOff className="h-4 w-4" />
							) : (
								<Eye className="h-4 w-4" />
							)}
						</button>
					</div>
				</div>
				<Button
					type="submit"
					size="lg"
					className="h-10 w-full"
					disabled={pending || !email || !password}
				>
					{pending ? (
						<>
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							Anmelden&hellip;
						</>
					) : (
						<>
							<LogIn className="mr-2 h-4 w-4" />
							Anmelden
						</>
					)}
				</Button>
			</form>
		</div>
	);
}
