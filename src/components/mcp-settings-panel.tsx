import { Link } from "@tanstack/react-router";
import { ExternalLink, LockKeyhole, ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import type { McpStatus } from "@/server/mcp/auth";

type McpSettingsPanelProps = {
	status: McpStatus;
};

export function McpSettingsPanel({ status }: McpSettingsPanelProps) {
	return (
		<Card variant="hero">
			<CardHeader className="border-b">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<CardTitle>Codex-Zugang</CardTitle>
						<p className="mt-1 text-sm text-muted-foreground">
							Kontrollierter Assistentenzugriff auf dieselben Rendant-Daten.
						</p>
					</div>
					<Badge variant={status.configured ? "default" : "outline"}>
						{status.configured ? "Aktiv" : "Nicht eingerichtet"}
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="space-y-5">
				<dl className="grid gap-4 sm:grid-cols-3">
					<StatusValue label="Zugriffsmodus">
						{status.accessMode === "admin" ? "Admin" : "Nur Lesen"}
					</StatusValue>
					<StatusValue label="Audit-Identität">
						{status.actor.name}
						<span className="block truncate text-xs font-normal text-muted-foreground">
							{status.actor.email}
						</span>
					</StatusValue>
					<StatusValue label="Endpunkt">
						<code className="font-mono text-xs">{status.endpoint}</code>
					</StatusValue>
				</dl>

				<div className="grid gap-3 sm:grid-cols-2">
					<div className="flex gap-3 rounded-lg border border-border/60 bg-background/60 p-3">
						<ScrollText className="mt-0.5 size-4 shrink-0 text-primary" />
						<p className="text-sm leading-relaxed text-muted-foreground">
							Änderungen laufen durch dieselben Prüfungen und erscheinen im
							gemeinsamen Auditlog mit dieser Identität.
						</p>
					</div>
					<div className="flex gap-3 rounded-lg border border-border/60 bg-background/60 p-3">
						<LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" />
						<p className="text-sm leading-relaxed text-muted-foreground">
							Der Bearer-Token bleibt ausschließlich in der Serverkonfiguration
							und wird hier nie angezeigt.
						</p>
					</div>
				</div>
			</CardContent>
			<CardFooter className="justify-between gap-3">
				<p className="text-xs text-muted-foreground">
					Reine Lesezugriffe erzeugen keinen eigenen Audit-Eintrag.
				</p>
				<Button asChild variant="outline" size="sm">
					<Link to="/protokolle/audit">
						Auditlog öffnen
						<ExternalLink />
					</Link>
				</Button>
			</CardFooter>
		</Card>
	);
}

function StatusValue({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				{label}
			</dt>
			<dd className="mt-1 font-medium text-foreground">{children}</dd>
		</div>
	);
}
