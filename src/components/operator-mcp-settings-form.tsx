import { useForm } from "@tanstack/react-form";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";

type Settings = Awaited<
	ReturnType<typeof orpcClient.operators.integrationSettings>
>["mcp"];

export function OperatorMcpSettingsForm({
	initial,
	tenantId,
	tenantUrl = null,
	onSaved,
}: {
	initial: Settings;
	tenantId: string;
	tenantUrl?: string | null;
	onSaved: () => Promise<unknown>;
}) {
	const [saved, setSaved] = useState(initial);
	const endpoint = tenantUrl ? new URL(initial.endpoint, tenantUrl).href : null;
	async function copyEndpoint() {
		if (!endpoint) return;
		try {
			await navigator.clipboard.writeText(endpoint);
			toast.success("MCP-Adresse kopiert.");
		} catch {
			toast.error("Die MCP-Adresse konnte nicht kopiert werden.");
		}
	}
	function defaults(settings: Settings) {
		return {
			enabled: settings.enabled,
			accessMode: settings.accessMode,
			actor_name: settings.actor.name,
			actor_email: settings.actor.email,
			token: "",
			clear_token: false,
			expected_updated_at: settings.updated_at,
		};
	}
	const baseline = useRef(defaults(initial));
	const form = useForm({
		defaultValues: baseline.current,
		onSubmit: async ({ value }) => {
			try {
				const next = await orpcClient.operators.updateMcp({
					...value,
					token: value.clear_token ? "" : value.token.trim(),
					tenantId,
				});
				setSaved(next);
				baseline.current = defaults(next);
				form.reset(baseline.current);
				await onSaved();
				toast.success("MCP-Einstellungen gespeichert.");
			} catch (error) {
				toast.error(
					orpcMessage(
						error,
						"MCP-Einstellungen konnten nicht gespeichert werden.",
					),
				);
			}
		},
	});
	return (
		<form
			className="space-y-4"
			onSubmit={(event) => {
				event.preventDefault();
				void form.handleSubmit();
			}}
		>
			<p className="text-sm text-muted-foreground">
				MCP erlaubt einem Assistenten Zugriff auf diesen Verein. Der Token
				bleibt verborgen und wird nicht automatisch erzeugt.
			</p>
			<div className="space-y-2 text-xs text-muted-foreground">
				{endpoint ? (
					<>
						<p>
							MCP-Adresse: <code className="break-all">{endpoint}</code>
						</p>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => void copyEndpoint()}
						>
							MCP-Adresse kopieren
						</Button>
					</>
				) : (
					<p>
						Für diesen Verein ist noch keine Webadresse konfiguriert. Der
						Endpunktpfad lautet <code>{saved.endpoint}</code>. Eine vollständige
						MCP-Adresse ist noch nicht verfügbar.
					</p>
				)}
			</div>
			<p className="text-xs text-muted-foreground">
				{saved.source === "legacy"
					? "Aktuell wird der bestehende Serverzugang verwendet. Speichern übernimmt ihn als eigene Vereinskonfiguration."
					: saved.has_token
						? "Ein Token ist gespeichert."
						: "Kein Token gespeichert."}
			</p>
			<form.Subscribe selector={(state) => state.isSubmitting}>
				{(pending) => (
					<fieldset disabled={pending} className="min-w-0 space-y-4">
						<form.Subscribe selector={(state) => state.values.clear_token}>
							{(clearToken) => (
								<form.Field name="enabled">
									{(field) => (
										<label className="flex items-center gap-2 text-sm">
											<input
												type="checkbox"
												className="h-4 w-4 accent-primary"
												checked={field.state.value}
												disabled={clearToken}
												onChange={(event) =>
													field.handleChange(event.target.checked)
												}
											/>
											MCP-Zugang aktivieren
										</label>
									)}
								</form.Field>
							)}
						</form.Subscribe>
						<form.Field name="accessMode">
							{(field) => (
								<div className="space-y-1.5">
									<Label htmlFor="operator-mcp-mode">Zugriffsmodus</Label>
									<select
										id="operator-mcp-mode"
										className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
										value={field.state.value}
										onChange={(event) =>
											field.handleChange(
												event.target.value as Settings["accessMode"],
											)
										}
									>
										<option value="readonly">Nur Lesen</option>
										<option value="admin">Verwaltungsrechte</option>
										<option value="identity">Benutzerrechte</option>
									</select>
								</div>
							)}
						</form.Field>
						<p className="text-xs text-muted-foreground">
							Benutzerrechte begrenzen den Tokenzugriff auf die freigegebenen
							Benutzerrechte. Audit-Name und E-Mail dienen nur der
							Protokollierung und melden keine Person an.
						</p>
						<div className="grid gap-4 sm:grid-cols-2">
							<form.Field name="actor_name">
								{(field) => (
									<div className="space-y-1.5">
										<Label htmlFor="operator-mcp-actor-name">Audit-Name</Label>
										<Input
											id="operator-mcp-actor-name"
											value={field.state.value}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
										/>
									</div>
								)}
							</form.Field>
							<form.Field name="actor_email">
								{(field) => (
									<div className="space-y-1.5">
										<Label htmlFor="operator-mcp-actor-email">
											Audit-E-Mail
										</Label>
										<Input
											id="operator-mcp-actor-email"
											type="email"
											value={field.state.value}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
										/>
									</div>
								)}
							</form.Field>
						</div>
						<form.Subscribe selector={(state) => state.values.clear_token}>
							{(clearToken) => (
								<form.Field name="token">
									{(field) => (
										<div className="space-y-1.5">
											<Label htmlFor="operator-mcp-token">
												{saved.has_token ? "Neuer Token (optional)" : "Token"}
											</Label>
											<Input
												id="operator-mcp-token"
												type="password"
												autoComplete="off"
												disabled={clearToken}
												value={field.state.value}
												onChange={(event) =>
													field.handleChange(event.target.value)
												}
												placeholder={
													saved.has_token
														? "Leer lassen, um den gespeicherten Token zu behalten"
														: "Token eingeben"
												}
											/>
										</div>
									)}
								</form.Field>
							)}
						</form.Subscribe>
						{saved.has_token ? (
							<form.Field name="clear_token">
								{(field) => (
									<label className="flex items-center gap-2 text-sm">
										<input
											type="checkbox"
											className="h-4 w-4 accent-primary"
											checked={field.state.value}
											onChange={(event) => {
												field.handleChange(event.target.checked);
												if (event.target.checked)
													form.setFieldValue("enabled", false);
											}}
										/>
										Gespeicherten Token entfernen und Zugang deaktivieren
									</label>
								)}
							</form.Field>
						) : null}
						<form.Subscribe selector={(state) => state.isDirty}>
							{(dirty) => (
								<div className="flex flex-wrap gap-2">
									<Button type="submit" disabled={pending || !dirty}>
										{pending ? "Speichern…" : "MCP speichern"}
									</Button>
									{dirty ? (
										<Button
											type="button"
											variant="ghost"
											onClick={() => form.reset(baseline.current)}
										>
											Verwerfen
										</Button>
									) : null}
								</div>
							)}
						</form.Subscribe>
					</fieldset>
				)}
			</form.Subscribe>
		</form>
	);
}
