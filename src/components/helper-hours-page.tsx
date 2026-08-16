import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCheck2, Loader2, Plus, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateDe, todayIsoDate } from "@/lib/date";
import {
	formatMinutes,
	HELPER_HOUR_CATEGORIES,
	type HelperHourCategory,
} from "@/lib/helper-hours";
import { orpc, orpcClient } from "@/lib/orpc";

type Preview = {
	valid: boolean;
	digest: string;
	rows: number;
	toImport: number;
	alreadyImported: number;
	hours: number;
	warnings: number;
	errors: Array<{ sheet: string; row: number; message: string }>;
	warningSample: Array<{ sheet: string; row: number; warnings: string[] }>;
	sample: Array<{
		sheet: string;
		row: number;
		date: string;
		event: string;
		name: string;
		minutes: number;
		warnings: string[];
	}>;
};

function parseHours(value: string): number | null {
	const hours = Number(value.trim().replace(",", "."));
	if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return null;
	const minutes = Math.round(hours * 60);
	return minutes % 15 === 0 ? minutes : null;
}

export function HelperHoursPage({ isAdmin }: { isAdmin: boolean }) {
	const queryClient = useQueryClient();
	const { data, isLoading } = useQuery(orpc.helperHours.list.queryOptions());
	const [saving, setSaving] = useState(false);
	const key = useRef<string | null>(null);
	const [form, setForm] = useState({
		datum: todayIsoDate(),
		veranstaltung: "",
		vorname: "",
		nachname: "",
		stunden: "",
		kategorie: "gesamtverein" as HelperHourCategory,
		bemerkung: "",
	});
	async function submit(event: React.FormEvent) {
		event.preventDefault();
		const minuten = parseHours(form.stunden);
		if (!minuten) {
			toast.error("Bitte Stunden in Viertelstunden angeben, zum Beispiel 2,5");
			return;
		}
		setSaving(true);
		try {
			key.current ??= crypto.randomUUID();
			await orpcClient.helperHours.create({
				idempotency_key: key.current,
				datum: form.datum,
				veranstaltung: form.veranstaltung,
				nachname: form.nachname,
				vorname: form.vorname,
				kategorie: form.kategorie,
				minuten,
				bemerkung: form.bemerkung,
			});
			key.current = null;
			setForm({
				...form,
				vorname: "",
				nachname: "",
				stunden: "",
				bemerkung: "",
			});
			await queryClient.invalidateQueries({
				queryKey: orpc.helperHours.list.queryKey(),
			});
			toast.success("Helferstunde gespeichert");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Speichern fehlgeschlagen",
			);
		} finally {
			setSaving(false);
		}
	}
	return (
		<div className="space-y-6">
			<div className="grid gap-3 sm:grid-cols-3">
				{[
					["Stunden", formatMinutes(data?.summary.minutes ?? 0)],
					["Helfer", String(data?.summary.helpers ?? 0)],
					["Einträge", String(data?.summary.entries ?? 0)],
				].map(([label, value]) => (
					<Card key={label} size="sm" variant="quiet">
						<CardContent>
							<p className="text-xs text-muted-foreground">{label}</p>
							<p className="mt-1 font-heading text-2xl tabular-nums">
								{isLoading ? "…" : value}
							</p>
						</CardContent>
					</Card>
				))}
			</div>
			<Card variant="hero">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Plus className="h-4 w-4 text-primary" />
						Helferstunde erfassen
					</CardTitle>
					<CardDescription>
						Person, Anlass und Stunden. Die Zuordnung ist mit einem Klick
						erledigt.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12"
						onSubmit={submit}
					>
						<div className="space-y-1.5 lg:col-span-3">
							<Label htmlFor="hh-date">Datum</Label>
							<Input
								id="hh-date"
								type="date"
								value={form.datum}
								onChange={(e) => setForm({ ...form, datum: e.target.value })}
								required
							/>
						</div>
						<div className="space-y-1.5 sm:col-span-2 lg:col-span-5">
							<Label htmlFor="hh-event">Veranstaltung</Label>
							<Input
								id="hh-event"
								value={form.veranstaltung}
								onChange={(e) =>
									setForm({ ...form, veranstaltung: e.target.value })
								}
								placeholder="z. B. Sommerfest"
								maxLength={160}
								required
							/>
						</div>
						<div className="space-y-1.5 lg:col-span-2">
							<Label htmlFor="hh-first">Vorname</Label>
							<Input
								id="hh-first"
								value={form.vorname}
								onChange={(e) => setForm({ ...form, vorname: e.target.value })}
								required
							/>
						</div>
						<div className="space-y-1.5 lg:col-span-2">
							<Label htmlFor="hh-last">Nachname</Label>
							<Input
								id="hh-last"
								value={form.nachname}
								onChange={(e) => setForm({ ...form, nachname: e.target.value })}
								required
							/>
						</div>
						<div className="space-y-1.5 lg:col-span-3">
							<Label htmlFor="hh-hours">Stunden</Label>
							<Input
								id="hh-hours"
								inputMode="decimal"
								value={form.stunden}
								onChange={(e) => setForm({ ...form, stunden: e.target.value })}
								placeholder="2,5"
								required
							/>
							<div className="flex gap-1">
								{[1, 2, 3, 4, 5].map((h) => (
									<Button
										key={h}
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => setForm({ ...form, stunden: String(h) })}
									>
										{h} h
									</Button>
								))}
							</div>
						</div>
						<div className="space-y-1.5 lg:col-span-4">
							<Label>Zuordnung</Label>
							<Select
								value={form.kategorie}
								onValueChange={(value) =>
									setForm({ ...form, kategorie: value as HelperHourCategory })
								}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{HELPER_HOUR_CATEGORIES.map((c) => (
										<SelectItem key={c.code} value={c.code}>
											{c.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5 sm:col-span-2 lg:col-span-5">
							<Label htmlFor="hh-note">Bemerkung</Label>
							<Textarea
								id="hh-note"
								value={form.bemerkung}
								onChange={(e) =>
									setForm({ ...form, bemerkung: e.target.value })
								}
								placeholder="Optional"
								rows={2}
							/>
						</div>
						<div className="flex items-end sm:col-span-2 lg:col-span-12">
							<Button className="w-full sm:w-auto" disabled={saving}>
								{saving ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<Plus className="mr-2 h-4 w-4" />
								)}
								Speichern
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
			{isAdmin ? (
				<HelperHoursImport
					onImported={() =>
						queryClient.invalidateQueries({
							queryKey: orpc.helperHours.list.queryKey(),
						})
					}
				/>
			) : null}
			<Card>
				<CardHeader>
					<CardTitle>Letzte Einträge</CardTitle>
					<CardDescription>
						Die neuesten Helferstunden aus Erfassung und Import.
					</CardDescription>
				</CardHeader>
				<CardContent className="overflow-x-auto">
					<table className="w-full min-w-[680px] text-sm">
						<thead>
							<tr className="border-b text-left text-xs text-muted-foreground">
								<th className="py-2 pr-3">Datum</th>
								<th className="px-3 py-2">Helfer</th>
								<th className="px-3 py-2">Veranstaltung</th>
								<th className="px-3 py-2">Quelle</th>
								<th className="py-2 pl-3 text-right">Stunden</th>
							</tr>
						</thead>
						<tbody>
							{data?.items.map((item) => (
								<tr
									key={item.id}
									className="border-b border-border/50 last:border-0"
								>
									<td className="py-2.5 pr-3 tabular-nums">
										{formatDateDe(item.datum)}
									</td>
									<td className="px-3 py-2.5 font-medium">
										{`${item.vorname} ${item.nachname}`.trim() || "Ohne Namen"}
									</td>
									<td className="px-3 py-2.5">{item.veranstaltung}</td>
									<td className="px-3 py-2.5 text-xs text-muted-foreground">
										{item.quelle === "excel" ? item.quelle_blatt : "Manuell"}
									</td>
									<td className="py-2.5 pl-3 text-right font-semibold tabular-nums">
										{formatMinutes(item.gemeldete_summe_minuten)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{!isLoading && !data?.items.length ? (
						<p className="py-8 text-center text-muted-foreground">
							Noch keine Helferstunden erfasst.
						</p>
					) : null}
				</CardContent>
			</Card>
		</div>
	);
}

function HelperHoursImport({
	onImported,
}: {
	onImported: () => Promise<unknown>;
}) {
	const input = useRef<HTMLInputElement | null>(null);
	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState<Preview | null>(null);
	const [loading, setLoading] = useState<"preview" | "apply" | null>(null);
	async function send(mode: "preview" | "apply") {
		if (!file) return;
		setLoading(mode);
		try {
			const body = new FormData();
			body.set("file", file);
			body.set("mode", mode);
			if (mode === "apply" && preview)
				body.set("confirm_digest", preview.digest);
			const response = await fetch("/api/import/helper-hours", {
				method: "POST",
				body,
			});
			const result = (await response.json()) as Preview & {
				error?: string;
				created?: number;
			};
			if (!response.ok)
				throw new Error(result.error ?? "Import fehlgeschlagen");
			if (mode === "preview") {
				setPreview(result);
				toast[result.valid ? "success" : "error"](
					result.valid
						? "Datei erfolgreich geprüft"
						: "Die Datei enthält Fehler",
				);
			} else {
				toast.success(`${result.created ?? 0} Helferstunden importiert`);
				setFile(null);
				setPreview(null);
				if (input.current) input.current.value = "";
				await onImported();
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Import fehlgeschlagen",
			);
		} finally {
			setLoading(null);
		}
	}
	function confirmImport() {
		if (!preview?.valid || preview.toImport <= 0) return;
		const hint =
			preview.warnings > 0
				? ` ${preview.warnings} Hinweise bleiben zur Herkunft gespeichert.`
				: "";
		if (
			window.confirm(
				`${preview.toImport} Helferstunden verbindlich importieren?${hint}`,
			)
		)
			void send("apply");
	}
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Upload className="h-4 w-4 text-primary" />
					Excel-Datei importieren
				</CardTitle>
				<CardDescription>
					Rendant erkennt die Monatsblätter der bisherigen SVU-Liste, zeigt
					Unstimmigkeiten an und importiert erst nach deiner Bestätigung.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex flex-col gap-2 sm:flex-row">
					<Input
						ref={input}
						type="file"
						accept=".xlsx"
						onChange={(e) => {
							setFile(e.target.files?.[0] ?? null);
							setPreview(null);
						}}
					/>
					<Button
						type="button"
						variant="secondary"
						disabled={!file || loading !== null}
						onClick={() => void send("preview")}
					>
						{loading === "preview" ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<FileCheck2 className="mr-2 h-4 w-4" />
						)}
						Datei prüfen
					</Button>
				</div>
				{preview ? (
					<div className="rounded-xl border bg-muted/20 p-4">
						<p className="font-semibold">
							{preview.rows} Einträge, {formatMinutes(preview.hours)} Stunden
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							{preview.toImport} neu, {preview.alreadyImported} bereits
							importiert, {preview.warnings} Hinweise
						</p>
						{preview.errors.length ? (
							<ul className="mt-3 text-sm text-destructive">
								{preview.errors.slice(0, 8).map((e, i) => (
									<li key={`${e.sheet}-${e.row}-${i}`}>
										{e.sheet} Zeile {e.row}: {e.message}
									</li>
								))}
							</ul>
						) : null}
						{preview.warningSample.length ? (
							<ul className="mt-3 space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100">
								{preview.warningSample.map((entry) => (
									<li key={`${entry.sheet}-${entry.row}`}>
										{entry.sheet} Zeile {entry.row}: {entry.warnings.join(" ")}
									</li>
								))}
							</ul>
						) : null}
						{preview.valid && preview.toImport > 0 ? (
							<Button
								className="mt-4 w-full"
								onClick={confirmImport}
								disabled={loading !== null}
							>
								{loading === "apply" ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<Upload className="mr-2 h-4 w-4" />
								)}
								{preview.toImport} Einträge importieren
							</Button>
						) : null}
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}
