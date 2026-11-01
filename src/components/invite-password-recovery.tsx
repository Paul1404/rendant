import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";

export function InvitePasswordRecovery({ token }: { token: string }) {
	const [pending, setPending] = useState(false);
	const [sent, setSent] = useState(false);
	return (
		<div className="space-y-2 border-t pt-3 text-sm">
			{sent ? (
				<p role="status" className="text-muted-foreground">
					Wenn diese Einladung für ein bestehendes Konto gültig ist, erhält
					dessen E-Mail-Adresse einen Link zum Festlegen eines neuen Passworts.
					Prüfe auch den Spamordner.
				</p>
			) : (
				<Button
					type="button"
					variant="link"
					className="h-auto px-0"
					disabled={pending}
					onClick={async () => {
						setPending(true);
						try {
							await orpcClient.invites.requestPasswordReset({ token });
							setSent(true);
						} catch (error) {
							toast.error(
								orpcMessage(
									error,
									"Link konnte nicht angefordert werden. Bitte erneut versuchen.",
								),
							);
						} finally {
							setPending(false);
						}
					}}
				>
					{pending ? "Wird angefordert…" : "Passwort vergessen?"}
				</Button>
			)}
		</div>
	);
}

export function ResetPasswordForm({
	resetToken,
	returnTo = "/login",
	email,
	recovery,
}: {
	resetToken: string;
	returnTo?: string;
	email?: string;
	recovery?: React.ReactNode;
}) {
	const [password, setPassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [saved, setSaved] = useState(false);
	const [pending, setPending] = useState(false);
	async function finish() {
		const { error } = await authClient.signOut();
		if (error) throw new Error("Abmelden fehlgeschlagen");
		window.location.assign(returnTo);
	}
	if (saved)
		return (
			<div className="space-y-4">
				<h2 className="text-lg font-semibold">Passwort gespeichert</h2>
				<p className="text-sm">
					Melde dein aktuelles Konto ab und anschließend mit dem neuen Passwort
					an.
				</p>
				<Button
					disabled={pending}
					onClick={async () => {
						setPending(true);
						try {
							await finish();
						} catch {
							toast.error("Abmelden fehlgeschlagen. Bitte erneut versuchen.");
							setPending(false);
						}
					}}
				>
					Abmelden und anmelden
				</Button>
			</div>
		);
	return (
		<div className="space-y-4">
			<h2 className="text-lg font-semibold">Neues Passwort festlegen</h2>
			<p className="text-sm text-muted-foreground">
				Das Passwort gilt für dein Rendant-Konto{email ? ` ${email}` : ""} und
				damit für alle deine Vereine. Du wirst auf allen Geräten abgemeldet und
				meldest dich anschließend mit dem neuen Passwort an.
			</p>
			<form
				className="space-y-4"
				onSubmit={async (event) => {
					event.preventDefault();
					if (password !== confirmation) {
						toast.error("Die Passwörter stimmen nicht überein.");
						return;
					}
					setPending(true);
					try {
						const { error } = await authClient.resetPassword({
							token: resetToken,
							newPassword: password,
						});
						if (error) {
							toast.error(
								"Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen Link an.",
							);
							return;
						}
						setSaved(true);
						toast.success(
							"Passwort gespeichert. Bitte melde dich mit dem neuen Passwort an.",
						);
						try {
							await finish();
						} catch {
							toast.info(
								"Passwort gespeichert. Bitte melde dein aktuelles Konto ab.",
							);
						}
					} catch {
						toast.error(
							"Passwort konnte nicht gespeichert werden. Bitte erneut versuchen.",
						);
					} finally {
						setPending(false);
					}
				}}
			>
				<div className="space-y-2">
					<Label htmlFor="reset-password">Neues Passwort</Label>
					<Input
						id="reset-password"
						type={showPassword ? "text" : "password"}
						autoComplete="new-password"
						minLength={8}
						maxLength={256}
						required
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						disabled={pending}
					/>
					<p className="text-xs text-muted-foreground">Mindestens 8 Zeichen.</p>
				</div>
				<div className="space-y-2">
					<Label htmlFor="reset-password-confirmation">
						Passwort wiederholen
					</Label>
					<Input
						id="reset-password-confirmation"
						type={showPassword ? "text" : "password"}
						autoComplete="new-password"
						minLength={8}
						maxLength={256}
						required
						value={confirmation}
						onChange={(event) => setConfirmation(event.target.value)}
						disabled={pending}
					/>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => setShowPassword(!showPassword)}
				>
					{showPassword ? "Passwörter verbergen" : "Passwörter anzeigen"}
				</Button>
				<Button
					type="submit"
					className="w-full"
					disabled={pending || password.length < 8 || !confirmation}
				>
					{pending ? "Wird gespeichert…" : "Passwort speichern"}
				</Button>
			</form>
			{recovery}
		</div>
	);
}

export function InviteResetPasswordForm({
	token,
	resetToken,
	email,
}: {
	token: string;
	resetToken: string;
	email: string;
}) {
	return (
		<ResetPasswordForm
			key={resetToken}
			resetToken={resetToken}
			email={email}
			returnTo={`/invite/${encodeURIComponent(token)}`}
			recovery={<InvitePasswordRecovery token={token} />}
		/>
	);
}

export function MemberPasswordRecovery({ email }: { email: string }) {
	const [pending, setPending] = useState(false);
	const [sent, setSent] = useState(false);
	return (
		<div className="space-y-2 text-sm">
			{sent ? (
				<p role="status" className="text-muted-foreground">
					Wenn dieses Konto aktiven Zugang zu diesem Verein hat, erhält seine
					E-Mail-Adresse einen Link für ein neues Passwort. Prüfe auch den
					Spamordner.
				</p>
			) : (
				<>
					<Button
						type="button"
						variant="link"
						className="h-auto px-0"
						disabled={pending || !email.trim()}
						onClick={async () => {
							setPending(true);
							try {
								await orpcClient.recovery.request({ email: email.trim() });
								setSent(true);
							} catch (error) {
								toast.error(
									orpcMessage(
										error,
										"Link konnte nicht angefordert werden. Bitte erneut versuchen.",
									),
								);
							} finally {
								setPending(false);
							}
						}}
					>
						{pending ? "Wird angefordert…" : "Passwort vergessen?"}
					</Button>
					{!email.trim() && (
						<p className="text-xs text-muted-foreground">
							Gib deine E-Mail-Adresse ein, um einen Link für ein neues Passwort
							anzufordern.
						</p>
					)}
				</>
			)}
		</div>
	);
}
