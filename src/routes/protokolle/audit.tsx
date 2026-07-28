import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Search, ShieldCheck } from "lucide-react";
import type { FormEvent } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	AUDIT_CATEGORIES,
	type AuditCategory,
	auditActionLabel,
	auditCategoryLabel,
} from "@/lib/audit";
import { BERLIN_TZ } from "@/lib/date";
import { orpc } from "@/lib/orpc";

type AuditSearch = {
	page?: number;
	category?: AuditCategory;
	q?: string;
};

function parseCategory(value: unknown): AuditCategory | undefined {
	return typeof value === "string" &&
		(AUDIT_CATEGORIES as readonly string[]).includes(value)
		? (value as AuditCategory)
		: undefined;
}

function queryOptions(search: AuditSearch) {
	return orpc.audit.list.queryOptions({
		input: {
			page: search.page ?? 1,
			pageSize: 50,
			category: search.category,
			query: search.q,
		},
		refetchInterval: 15_000,
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: "always",
	});
}

export const Route = createFileRoute("/protokolle/audit")({
	beforeLoad: ({ context }) => {
		if (context.user.role !== "admin") throw redirect({ to: "/protokolle" });
	},
	validateSearch: (search: Record<string, unknown>): AuditSearch => {
		const rawPage = Number(search.page);
		const page = Number.isInteger(rawPage) && rawPage > 1 ? rawPage : undefined;
		const q = typeof search.q === "string" ? search.q.trim().slice(0, 100) : "";
		return {
			page,
			category: parseCategory(search.category),
			q: q || undefined,
		};
	},
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		context.queryClient.ensureQueryData(queryOptions(deps)),
	head: () => ({ meta: [{ title: "Audit-Log · Rendant" }] }),
	component: AuditPage,
});

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
	timeZone: BERLIN_TZ,
	dateStyle: "medium",
	timeStyle: "medium",
});

function AuditPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const { data } = useSuspenseQuery(queryOptions(search));
	const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

	function submitFilters(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		const q = String(form.get("q") ?? "").trim();
		const category = parseCategory(form.get("category"));
		void navigate({
			search: { q: q || undefined, category, page: undefined },
		});
	}

	return (
		<div className="space-y-8">
			<PageHeader
				eyebrow="Administration"
				title="Audit-Log"
				description="Nachvollziehbare Ereignisspur für Anmeldungen, Benutzer, Protokolle, Exporte, Kassen und Einstellungen. Nur für Admins sichtbar."
			/>

			<Card>
				<CardContent className="space-y-4">
					<form
						key={`${search.q ?? ""}:${search.category ?? ""}`}
						onSubmit={submitFilters}
						className="flex flex-col gap-3 sm:flex-row sm:items-center"
					>
						<div className="relative min-w-0 flex-1">
							<Label htmlFor="audit-search" className="sr-only">
								Audit-Log durchsuchen
							</Label>
							<Input
								id="audit-search"
								name="q"
								type="search"
								defaultValue={search.q}
								placeholder="Person, Ereignis oder Objekt suchen"
								className="peer pl-10 sm:pl-10"
							/>
							<Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity peer-placeholder-shown:opacity-100" />
						</div>
						<div>
							<Label htmlFor="audit-category" className="sr-only">
								Kategorie
							</Label>
							<select
								id="audit-category"
								name="category"
								defaultValue={search.category ?? ""}
								className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-auto"
							>
								<option value="">Alle Kategorien</option>
								{AUDIT_CATEGORIES.map((category) => (
									<option key={category} value={category}>
										{auditCategoryLabel(category)}
									</option>
								))}
							</select>
						</div>
						<Button type="submit" variant="outline">
							Filtern
						</Button>
					</form>

					{data.items.length ? (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Zeitpunkt</TableHead>
									<TableHead>Ereignis</TableHead>
									<TableHead>Person</TableHead>
									<TableHead>Objekt</TableHead>
									<TableHead>Quelle</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.items.map((event) => (
									<TableRow key={event.id}>
										<TableCell className="text-xs text-muted-foreground">
											{dateFormatter.format(new Date(event.event_at))}
										</TableCell>
										<TableCell className="min-w-52 whitespace-normal">
											<div className="flex flex-wrap items-center gap-2">
												<span className="font-medium">
													{auditActionLabel(event.action)}
												</span>
												{event.success ? null : (
													<Badge variant="destructive">Fehlgeschlagen</Badge>
												)}
											</div>
											<p className="mt-1 text-xs text-muted-foreground">
												{auditCategoryLabel(event.category as AuditCategory)}
											</p>
											{Object.keys(event.metadata ?? {}).length ? (
												<details className="mt-2 text-xs text-muted-foreground">
													<summary className="cursor-pointer">Details</summary>
													<pre className="mt-2 max-w-md overflow-auto whitespace-pre-wrap rounded-md bg-muted/60 p-2">
														{JSON.stringify(event.metadata, null, 2)}
													</pre>
												</details>
											) : null}
										</TableCell>
										<TableCell className="min-w-44 whitespace-normal">
											<p>{event.actor_name ?? event.actor_email ?? "System"}</p>
											{event.actor_name && event.actor_email ? (
												<p className="text-xs text-muted-foreground">
													{event.actor_email}
												</p>
											) : null}
										</TableCell>
										<TableCell className="max-w-52 whitespace-normal break-words">
											{event.subject_label ?? "Keine Angabe"}
										</TableCell>
										<TableCell className="text-xs text-muted-foreground">
											{event.ip_address ?? "Keine Angabe"}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					) : (
						<div className="flex flex-col items-center gap-2 py-12 text-center">
							<ShieldCheck className="h-8 w-8 text-muted-foreground" />
							<p className="font-medium">Keine Ereignisse gefunden</p>
							<p className="text-sm text-muted-foreground">
								Passe Suche oder Kategorie an.
							</p>
						</div>
					)}

					<div className="flex items-center justify-between border-t pt-4 text-sm text-muted-foreground">
						<span>{data.total} Ereignisse</span>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="icon-sm"
								disabled={data.page <= 1}
								onClick={() =>
									void navigate({
										search: { ...search, page: data.page - 1 || undefined },
									})
								}
								aria-label="Vorherige Seite"
							>
								<ChevronLeft />
							</Button>
							<span aria-live="polite">
								Seite {data.page} von {pages}
							</span>
							<Button
								variant="outline"
								size="icon-sm"
								disabled={data.page >= pages}
								onClick={() =>
									void navigate({
										search: { ...search, page: data.page + 1 },
									})
								}
								aria-label="Nächste Seite"
							>
								<ChevronRight />
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
