import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { DatevSettingsForm } from "@/components/datev-settings-form";
import { EmailSettingsForm } from "@/components/email-settings-form";
import { OperatorMcpSettingsForm } from "@/components/operator-mcp-settings-form";
import { SumupSettingsForm } from "@/components/sumup-settings-form";
import { Button } from "@/components/ui/button";
import { orpc, orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";

export function OperatorIntegrationsPanel({
	tenantId,
	tenantUrl = null,
}: {
	tenantId: string;
	tenantUrl?: string | null;
}) {
	const [resetKey, setResetKey] = useState(0);
	const [reloading, setReloading] = useState(false);
	const queryClient = useQueryClient();
	const options = orpc.operators.integrationSettings.queryOptions({
		input: { tenantId },
	});
	const settings = useQuery(options);
	async function refreshed<T>(operation: Promise<T>): Promise<T> {
		const result = await operation;
		await queryClient.invalidateQueries({ queryKey: options.queryKey });
		return result;
	}
	if (settings.isPending)
		return (
			<p role="status" className="text-sm text-muted-foreground">
				Technische Einstellungen werden geladen.
			</p>
		);
	if (settings.error && !settings.data)
		return (
			<div role="alert" className="space-y-2 text-sm">
				<p>
					{orpcMessage(
						settings.error,
						"Technische Einstellungen konnten nicht geladen werden.",
					)}
				</p>
				<Button
					variant="outline"
					size="sm"
					onClick={() => void settings.refetch()}
				>
					Erneut laden
				</Button>
			</div>
		);
	async function reloadDrafts() {
		setReloading(true);
		try {
			const result = await settings.refetch({ throwOnError: true });
			if (result.data) setResetKey((previous) => previous + 1);
		} catch (error) {
			toast.error(
				orpcMessage(
					error,
					"Die Einstellungen konnten nicht neu geladen werden. Deine Eingaben bleiben erhalten.",
				),
			);
		} finally {
			setReloading(false);
		}
	}
	const formKey = `${tenantId}:${resetKey}`;
	return (
		<div className="space-y-3">
			<p className="max-w-3xl text-sm text-muted-foreground">
				Diese Verbindungen gelten nur für den ausgewählten Verein. Zugangsdaten
				werden nie angezeigt. Speichern versendet keine Belege oder
				Testnachrichten.
			</p>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() => void reloadDrafts()}
				disabled={reloading}
			>
				{reloading
					? "Einstellungen werden geladen…"
					: "Entwürfe verwerfen und neu laden"}
			</Button>
			<IntegrationSection title="E-Mail">
				<EmailSettingsForm
					key={formKey}
					initial={settings.data.email}
					client={{
						update: (input) => {
							if (!input.expected_updated_at)
								return Promise.reject(
									new Error("Bitte die E-Mail-Einstellungen erneut laden."),
								);
							return refreshed(
								orpcClient.operators.updateEmail({
									...input,
									tenantId,
									expected_updated_at: input.expected_updated_at,
								}),
							);
						},
						test: (input) =>
							orpcClient.operators.testEmail({ ...input, tenantId }),
					}}
				/>
			</IntegrationSection>
			<IntegrationSection title="MCP">
				<OperatorMcpSettingsForm
					key={formKey}
					initial={settings.data.mcp}
					tenantId={tenantId}
					tenantUrl={tenantUrl}
					onSaved={() =>
						queryClient.invalidateQueries({ queryKey: options.queryKey })
					}
				/>
			</IntegrationSection>
			<IntegrationSection title="SumUp">
				<SumupSettingsForm
					key={formKey}
					initial={settings.data.sumup}
					canTest
					client={{
						update: (input) => {
							if (!input.expected_updated_at)
								return Promise.reject(
									new Error("Bitte die SumUp-Einstellungen erneut laden."),
								);
							return refreshed(
								orpcClient.operators.updateSumup({
									...input,
									tenantId,
									expected_updated_at: input.expected_updated_at,
								}),
							);
						},
						test: async () => {
							await orpcClient.operators.testSumup({ tenantId });
							return "Verbindung zu SumUp bestätigt.";
						},
					}}
				/>
			</IntegrationSection>
			<IntegrationSection title="DATEV">
				<DatevSettingsForm
					key={formKey}
					initial={settings.data.datev}
					client={{
						update: (input) =>
							refreshed(
								orpcClient.operators.updateDatev({ ...input, tenantId }),
							),
					}}
				/>
			</IntegrationSection>
		</div>
	);
}

function IntegrationSection({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<details className="rounded-lg border">
			<summary className="cursor-pointer px-4 py-3 text-sm font-medium">
				{title}
			</summary>
			<div className="border-t p-3 sm:p-4">{children}</div>
		</details>
	);
}
