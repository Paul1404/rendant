import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

// better-auth answers in English. Everything the login can run into gets a
// German sentence that says what to do next.
const LOGIN_ERRORS: Record<string, string> = {
	INVALID_EMAIL_OR_PASSWORD: "E-Mail oder Passwort falsch",
	USER_BANNED:
		"Dieses Konto ist gesperrt. Bitte wende dich an einen Administrator.",
	TOO_MANY_REQUESTS:
		"Zu viele Versuche. Bitte in ein paar Minuten erneut anmelden.",
	USER_NOT_FOUND: "E-Mail oder Passwort falsch",
	EMAIL_NOT_VERIFIED:
		"Diese E-Mail-Adresse ist noch nicht bestätigt. Bitte zuerst den Link aus der Einladung öffnen.",
};

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
					(error.code ? LOGIN_ERRORS[error.code] : undefined) ??
						"Anmeldung fehlgeschlagen. Bitte später erneut versuchen.",
				);
				return;
			}
			// Full-document navigation so the freshly set session cookie drives a
			// clean SSR load of the target route.
			window.location.assign(redirectTo);
		});
	}

	return (
		<div className="p-6">
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
							aria-pressed={showPassword}
							className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-3 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
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
