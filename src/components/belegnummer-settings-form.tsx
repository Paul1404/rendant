import { useRouter } from "@tanstack/react-router";
import { Loader2, Save, Sparkles } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";
import { cn } from "@/lib/utils";

type YearFormat = "long" | "short";
type Separator = "-" | "/" | "." | "_";

export type BelegnummerSettings = {
	min_digits: number;
	prefix: string;
	include_year: boolean;
	year_format: YearFormat;
	separator: Separator;
};

type Preset = {
	id: string;
	label: string;
	hint: string;
	settings: BelegnummerSettings;
};

const PRESETS: ReadonlyArray<Preset> = [
	{
		id: "simple",
		label: "Einfach",
		hint: "Nur fortlaufende Nummer.",
		settings: {
			min_digits: 2,
			prefix: "",
			include_year: false,
			year_format: "long",
			separator: "-",
		},
	},
	{
		id: "year_long",
		label: "Mit Jahr (lang)",
		hint: "Vollständiges Jahr + Nummer.",
		settings: {
			min_digits: 3,
			prefix: "",
			include_year: true,
			year_format: "long",
			separator: "-",
		},
	},
	{
		id: "year_short",
		label: "Mit Jahr (kurz)",
		hint: "Zwei­stelliges Jahr + Nummer.",
		settings: {
			min_digits: 2,
			prefix: "",
			include_year: true,
			year_format: "short",
			separator: "-",
		},
	},
	{
		id: "prefix",
		label: "Mit Präfix",
		hint: "Prefix-Text + Jahr + Nummer.",
		settings: {
			min_digits: 4,
			prefix: "SVUFO",
			include_year: true,
			year_format: "long",
			separator: "-",
		},
	},
];

function previewBelegnummer(s: BelegnummerSettings, year: number, seq: number) {
	const parts: string[] = [];
	if (s.prefix) parts.push(s.prefix);
	if (s.include_year) {
		parts.push(
			s.year_format === "short"
				? String(year % 100).padStart(2, "0")
				: String(year),
		);
	}
	parts.push(String(seq).padStart(s.min_digits, "0"));
	return parts.join(s.separator);
}

function settingsEqual(a: BelegnummerSettings, b: BelegnummerSettings) {
	return (
		a.min_digits === b.min_digits &&
		a.prefix === b.prefix &&
		a.include_year === b.include_year &&
		a.year_format === b.year_format &&
		a.separator === b.separator
	);
}

export function BelegnummerSettingsForm({
	initial,
	serverPreview,
}: {
	initial: BelegnummerSettings;
	serverPreview: string;
}) {
	const router = useRouter();
	const [pending, start] = useTransition();
	const [s, setS] = useState<BelegnummerSettings>(initial);
	const [savedPreview, setSavedPreview] = useState(serverPreview);
	const [savedSettings, setSavedSettings] =
		useState<BelegnummerSettings>(initial);

	const year = new Date().getFullYear();
	const dirty = !settingsEqual(s, savedSettings);

	const nextSeqGuess = useMemo(() => {
		const m = savedPreview.match(/(\d+)\D*$/);
		return m ? Number.parseInt(m[1], 10) : 1;
	}, [savedPreview]);

	const previewNext = previewBelegnummer(s, year, nextSeqGuess);
	const previewExamples = useMemo(
		() => [
			previewBelegnummer(s, year, nextSeqGuess),
			previewBelegnummer(s, year, nextSeqGuess + 1),
			previewBelegnummer(s, year, nextSeqGuess + 9),
		],
		[s, year, nextSeqGuess],
	);

	const matchingPresetId = useMemo(() => {
		const found = PRESETS.find((p) => settingsEqual(p.settings, s));
		return found?.id ?? null;
	}, [s]);

	const prefixError = !/^[A-Za-z0-9_-]*$/.test(s.prefix);

	function applyPreset(p: Preset) {
		setS(p.settings);
	}

	async function save() {
		if (prefixError) {
			toast.error("Präfix enthält ungültige Zeichen");
			return;
		}
		start(async () => {
			try {
				const data = await orpcClient.settings.updateBelegnummer(s);
				setSavedSettings(data.settings);
				setSavedPreview(data.preview);
				setS(data.settings);
				toast.success("Einstellungen gespeichert");
				await router.invalidate();
			} catch (e) {
				toast.error(orpcMessage(e, "Speichern fehlgeschlagen"));
			}
		});
	}

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="flex items-center gap-2 text-base">
						<Sparkles className="h-4 w-4 text-primary" />
						Vorlagen
					</CardTitle>
				</CardHeader>
				<CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
					{PRESETS.map((p) => {
						const example = previewBelegnummer(p.settings, year, nextSeqGuess);
						const active = matchingPresetId === p.id;
						return (
							<button
								key={p.id}
								type="button"
								onClick={() => applyPreset(p)}
								className={cn(
									"group flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors",
									active
										? "border-primary/60 bg-primary/5 ring-1 ring-primary/30"
										: "border-border bg-card/40 hover:border-primary/40 hover:bg-card",
								)}
							>
								<div className="flex w-full items-center justify-between">
									<span className="text-sm font-medium text-foreground">
										{p.label}
									</span>
									<span className="font-mono text-xs text-muted-foreground">
										{example}
									</span>
								</div>
								<span className="text-[11px] text-muted-foreground">
									{p.hint}
								</span>
							</button>
						);
					})}
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-base">Bausteine</CardTitle>
				</CardHeader>
				<CardContent className="space-y-5">
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="prefix">Präfix</Label>
							<Input
								id="prefix"
								value={s.prefix}
								onChange={(e) =>
									setS({ ...s, prefix: e.target.value.toUpperCase() })
								}
								placeholder="z. B. SVUFO oder leer"
								maxLength={20}
								aria-invalid={prefixError}
							/>
							<p className="text-[11px] text-muted-foreground">
								Optional. Buchstaben, Ziffern, Bindestrich, Unterstrich.
							</p>
						</div>

						<div className="space-y-2">
							<Label htmlFor="separator">Trennzeichen</Label>
							<Select
								value={s.separator}
								onValueChange={(v) => setS({ ...s, separator: v as Separator })}
							>
								<SelectTrigger id="separator" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="-">Bindestrich (&minus;)</SelectItem>
									<SelectItem value="/">Schrägstrich (/)</SelectItem>
									<SelectItem value=".">Punkt (.)</SelectItem>
									<SelectItem value="_">Unterstrich (_)</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label htmlFor="min_digits">Mindestziffern</Label>
							<Select
								value={String(s.min_digits)}
								onValueChange={(v) =>
									setS({ ...s, min_digits: Number.parseInt(v, 10) })
								}
							>
								<SelectTrigger id="min_digits" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{[1, 2, 3, 4, 5, 6].map((n) => (
										<SelectItem key={n} value={String(n)}>
											{n} {n === 1 ? "Ziffer" : "Ziffern"} ({"0".repeat(n - 1)}
											{n})
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="text-[11px] text-muted-foreground">
								Padding mit führenden Nullen.
							</p>
						</div>

						<div className="space-y-2">
							<Label>Jahr</Label>
							<div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5">
								<input
									id="include_year"
									type="checkbox"
									checked={s.include_year}
									onChange={(e) =>
										setS({ ...s, include_year: e.target.checked })
									}
									className="h-4 w-4 rounded border-input accent-primary"
								/>
								<Label
									htmlFor="include_year"
									className="cursor-pointer text-sm font-normal"
								>
									Jahr in Belegnummer einschließen
								</Label>
							</div>
							{s.include_year ? (
								<Select
									value={s.year_format}
									onValueChange={(v) =>
										setS({ ...s, year_format: v as YearFormat })
									}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="long">Vierstellig ({year})</SelectItem>
										<SelectItem value="short">
											Zweistellig ({String(year % 100).padStart(2, "0")})
										</SelectItem>
									</SelectContent>
								</Select>
							) : null}
						</div>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-base">Vorschau</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
						<p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
							Nächste Belegnummer
						</p>
						<p className="mt-0.5 font-mono text-2xl font-semibold tracking-tight text-foreground">
							{previewNext}
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							Aktuell gespeichert:{" "}
							<span className="font-mono">{savedPreview}</span>
						</p>
					</div>
					<div>
						<p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
							Beispiele
						</p>
						<div className="flex flex-wrap gap-2 font-mono text-sm">
							{previewExamples.map((ex, i) => (
								<span
									key={i}
									className="rounded-md bg-muted/50 px-2 py-1 text-foreground/80"
								>
									{ex}
								</span>
							))}
						</div>
					</div>
				</CardContent>
			</Card>

			<div className="flex items-center justify-end gap-2">
				{dirty ? (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => setS(savedSettings)}
						disabled={pending}
					>
						Verwerfen
					</Button>
				) : null}
				<Button
					type="button"
					onClick={save}
					disabled={pending || !dirty || prefixError}
				>
					{pending ? (
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					) : (
						<Save className="mr-2 h-4 w-4" />
					)}
					Speichern
				</Button>
			</div>
		</div>
	);
}
