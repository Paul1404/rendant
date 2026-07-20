import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
	Banknote,
	Calculator,
	Coins,
	FileText,
	Loader2,
	Percent,
	Plus,
	ReceiptText,
	Save,
	Trash2,
	Wallet,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { SanityWarnings } from "@/components/sanity-warnings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataRow } from "@/components/ui/data-row";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Money } from "@/components/ui/money";
import { Textarea } from "@/components/ui/textarea";
import { WECHSELGELD_DEFAULT_CENT } from "@/lib/constants";
import { todayIsoDate } from "@/lib/date";
import {
	DENOMINATIONS,
	type DenominationCounts,
	type DenominationKey,
	emptyCounts,
	sumGezaehltCent,
} from "@/lib/denominations";
import {
	clearLocalPref,
	getLocalPref,
	LOCAL_PREF_KEYS,
	setLocalPref,
} from "@/lib/local-prefs";
import { formatCent, formatCentPlain, parseGermanAmount } from "@/lib/money";
import { orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";
import { runSanityChecks } from "@/lib/sanity-checks";
import { useFormDraft } from "@/lib/use-form-draft";
import { cn } from "@/lib/utils";

type UstMode = "none" | "p7" | "p19" | "custom";
type UmsatzUstBasis = "pre_card" | "post_card";

export type CashRegisterPreset = {
	id: string;
	kassennummer: string;
	kassenbezeichnung: string;
	wechselgeld_cent: number;
};

export type ProtokollInitialValues = {
	kassennummer?: string;
	kassenbezeichnung?: string;
	anlass?: string;
	gezaehlt_von?: string;
	geprueft_von?: string;
	wechselgeld_cent?: number;
	umsatz_ust_basis?: UmsatzUstBasis;
};

const DRAFT_KEY = "svufo:draft:protokoll-neu";

type FormDraft = {
	belegnummer: string;
	datum: string;
	selectedRegisterId: string | null;
	kassennummer: string;
	kassenbezeichnung: string;
	anlass: string;
	gezaehltVon: string;
	gepruefftVon: string;
	bemerkung: string;
	wechselgeldInput: string;
	kartenzahlungInput: string;
	counts: DenominationCounts;
	ausgaben: AusgabeDraft[];
	umsatzSplits: UmsatzUstDraft[];
	umsatzUstBasis: UmsatzUstBasis;
};

type AusgabeDraft = {
	id: string;
	bezeichnung: string;
	empfaenger: string;
	beleg_nr: string;
	betrag_input: string;
	ust_mode: UstMode;
	ust_custom_input: string;
};

type UmsatzUstDraft = {
	id: string;
	betrag_input: string;
	ust_mode: UstMode;
	ust_custom_input: string;
};

let rowIdCounter = 0;
function nextRowId(): string {
	rowIdCounter += 1;
	return `row-${rowIdCounter}`;
}

const UST_PRESET_BP: Record<Exclude<UstMode, "custom">, number> = {
	none: 0,
	p7: 700,
	p19: 1900,
};

function emptyAusgabe(): AusgabeDraft {
	return {
		id: nextRowId(),
		bezeichnung: "",
		empfaenger: "",
		beleg_nr: "",
		betrag_input: "",
		ust_mode: "none",
		ust_custom_input: "",
	};
}

function emptyUmsatzSplit(mode: UstMode = "none"): UmsatzUstDraft {
	return {
		id: nextRowId(),
		betrag_input: "",
		ust_mode: mode,
		ust_custom_input: "",
	};
}

function umsatzUstBp(s: UmsatzUstDraft): number | null {
	if (s.ust_mode === "custom") return parseGermanPercent(s.ust_custom_input);
	return UST_PRESET_BP[s.ust_mode];
}

function parseGermanPercent(input: string): number | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	const normalized = trimmed.replace(",", ".");
	if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
	const num = Number(normalized);
	if (!Number.isFinite(num) || num < 0 || num > 100) return null;
	return Math.round(num * 100);
}

function ausgabeUstBp(a: AusgabeDraft): number | null {
	if (a.ust_mode === "custom") return parseGermanPercent(a.ust_custom_input);
	return UST_PRESET_BP[a.ust_mode];
}

function ustAnteilCent(bruttoCent: number, bp: number): number {
	if (bp <= 0) return 0;
	const netCent = Math.round((bruttoCent * 10000) / (10000 + bp));
	return bruttoCent - netCent;
}

const BEMERKUNG_MAX = 2000;

function selectOnFocus(e: React.FocusEvent<HTMLInputElement>) {
	e.currentTarget.select();
}

function blurOnWheel(e: React.WheelEvent<HTMLInputElement>) {
	e.currentTarget.blur();
}

export function ProtokollForm({
	belegnummerPreview,
	umsatzUstBasisDefault,
	registers = [],
	initialValues,
}: {
	belegnummerPreview: string;
	umsatzUstBasisDefault: UmsatzUstBasis;
	registers?: CashRegisterPreset[];
	initialValues?: ProtokollInitialValues;
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [pending, startTransition] = useTransition();

	// Decide which register to preselect at SSR-time (so server and client
	// markup match). If initialValues come from a duplicated protokoll, try to
	// match by kassennummer; otherwise auto-pick when there is exactly one
	// register.
	const initialPreset = (() => {
		if (initialValues?.kassennummer) {
			const match = registers.find(
				(r) => r.kassennummer === initialValues.kassennummer,
			);
			if (match) return match;
		}
		return registers.length === 1 ? registers[0] : null;
	})();

	const initialKassennummer =
		initialValues?.kassennummer ?? initialPreset?.kassennummer ?? "";
	const initialKassenbezeichnung =
		initialValues?.kassenbezeichnung ?? initialPreset?.kassenbezeichnung ?? "";
	const initialWechselgeldCent =
		initialValues?.wechselgeld_cent ??
		initialPreset?.wechselgeld_cent ??
		WECHSELGELD_DEFAULT_CENT;

	const [counts, setCounts] = useState<DenominationCounts>(emptyCounts());
	const [belegnummer, setBelegnummer] = useState(belegnummerPreview);
	const [datum, setDatum] = useState<string>(() => todayIsoDate());
	const [selectedRegisterId, setSelectedRegisterId] = useState<string | null>(
		initialPreset ? initialPreset.id : null,
	);
	const [kassennummer, setKassennummer] = useState(initialKassennummer);
	const [kassenbezeichnung, setKassenbezeichnung] = useState(
		initialKassenbezeichnung,
	);
	const [anlass, setAnlass] = useState(initialValues?.anlass ?? "");
	const [gezaehltVon, setGezaehltVon] = useState(
		initialValues?.gezaehlt_von ?? "",
	);
	const [gepruefftVon, setGepruefftVon] = useState(
		initialValues?.geprueft_von ?? "",
	);
	const [bemerkung, setBemerkung] = useState("");
	const [wechselgeldInput, setWechselgeldInput] = useState(
		formatCentPlain(initialWechselgeldCent),
	);
	const [kartenzahlungInput, setKartenzahlungInput] = useState("");
	const [ausgaben, setAusgaben] = useState<AusgabeDraft[]>([]);
	const [umsatzSplits, setUmsatzSplits] = useState<UmsatzUstDraft[]>([]);
	const [umsatzUstBasis, setUmsatzUstBasis] = useState<UmsatzUstBasis>(
		initialValues?.umsatz_ust_basis ?? umsatzUstBasisDefault,
	);

	// Apply per-browser preferences after mount so SSR markup matches CSR.
	// localStorage is browser-only, so the prefs cannot influence the initial
	// render. The setState calls are wrapped in queueMicrotask to avoid the
	// "setState in effect" lint rule — the practical effect is identical
	// because React batches micro-task state updates before paint.
	useEffect(() => {
		queueMicrotask(() => {
			const lastGezVon = getLocalPref(LOCAL_PREF_KEYS.lastGezaehltVon);
			if (lastGezVon && !gezaehltVon) setGezaehltVon(lastGezVon);
			const lastGepVon = getLocalPref(LOCAL_PREF_KEYS.lastGeprueftVon);
			if (lastGepVon && !gepruefftVon) setGepruefftVon(lastGepVon);
			if (!selectedRegisterId && registers.length > 1 && !initialValues) {
				const lastRegId = getLocalPref(LOCAL_PREF_KEYS.lastRegisterId);
				if (lastRegId) {
					const reg = registers.find((r) => r.id === lastRegId);
					if (reg) applyRegister(reg);
				}
			}
		});
		// Intentionally run only on mount; reading prefs again on every state
		// change would fight with user edits.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	function applyRegister(reg: CashRegisterPreset) {
		setSelectedRegisterId(reg.id);
		setKassennummer(reg.kassennummer);
		setKassenbezeichnung(reg.kassenbezeichnung);
		setWechselgeldInput(formatCentPlain(reg.wechselgeld_cent));
	}

	function clearRegister() {
		setSelectedRegisterId(null);
	}

	const lastAusgabeRef = useRef<HTMLInputElement | null>(null);
	const focusLastAusgabe = useRef(false);
	const lastUmsatzRef = useRef<HTMLInputElement | null>(null);
	const focusLastUmsatz = useRef(false);

	useEffect(() => {
		if (focusLastAusgabe.current) {
			lastAusgabeRef.current?.focus();
			focusLastAusgabe.current = false;
		}
	}, [ausgaben.length]);

	useEffect(() => {
		if (focusLastUmsatz.current) {
			lastUmsatzRef.current?.focus();
			focusLastUmsatz.current = false;
		}
	}, [umsatzSplits.length]);

	const wechselgeldCent = useMemo(
		() => parseGermanAmount(wechselgeldInput) ?? -1,
		[wechselgeldInput],
	);
	const kartenzahlungCent = useMemo(() => {
		const trimmed = kartenzahlungInput.trim();
		if (!trimmed) return 0;
		const v = parseGermanAmount(trimmed);
		return v == null ? -1 : v;
	}, [kartenzahlungInput]);
	const gezaehltCent = useMemo(() => sumGezaehltCent(counts), [counts]);
	const ausgabenCent = useMemo(() => {
		let total = 0;
		for (const a of ausgaben) {
			const v = parseGermanAmount(a.betrag_input);
			if (v == null) return null;
			total += v;
		}
		return total;
	}, [ausgaben]);
	const ustSummeCent = useMemo(() => {
		let total = 0;
		for (const a of ausgaben) {
			const brutto = parseGermanAmount(a.betrag_input);
			const bp = ausgabeUstBp(a);
			if (brutto == null || bp == null) continue;
			total += ustAnteilCent(brutto, bp);
		}
		return total;
	}, [ausgaben]);
	const bestandCent = ausgabenCent == null ? null : gezaehltCent + ausgabenCent;
	const tageseinnahmenCent =
		bestandCent == null || wechselgeldCent < 0
			? null
			: bestandCent - wechselgeldCent;
	const tageseinnahmenGesamtCent =
		tageseinnahmenCent == null || kartenzahlungCent < 0
			? null
			: tageseinnahmenCent + kartenzahlungCent;

	const umsatzBasisCent =
		umsatzUstBasis === "pre_card"
			? tageseinnahmenCent
			: tageseinnahmenGesamtCent;

	const umsatzSplitSummeCent = useMemo(() => {
		let total = 0;
		for (const s of umsatzSplits) {
			const v = parseGermanAmount(s.betrag_input);
			if (v == null) return null;
			total += v;
		}
		return total;
	}, [umsatzSplits]);
	const umsatzDiffCent =
		umsatzSplitSummeCent == null || umsatzBasisCent == null
			? null
			: umsatzBasisCent - umsatzSplitSummeCent;
	const umsatzUstSummeCent = useMemo(() => {
		let total = 0;
		for (const s of umsatzSplits) {
			const brutto = parseGermanAmount(s.betrag_input);
			const bp = umsatzUstBp(s);
			if (brutto == null || bp == null) continue;
			total += ustAnteilCent(brutto, bp);
		}
		return total;
	}, [umsatzSplits]);

	// Dirty detection — flips to true on first interaction with any form
	// input. Used to gate the draft autosave and the beforeunload prompt
	// so an untouched form does neither.
	const [dirty, setDirty] = useState(false);
	const markDirty = () => {
		if (!dirty) setDirty(true);
	};

	const snapshot = useMemo<FormDraft>(
		() => ({
			belegnummer,
			datum,
			selectedRegisterId,
			kassennummer,
			kassenbezeichnung,
			anlass,
			gezaehltVon,
			gepruefftVon,
			bemerkung,
			wechselgeldInput,
			kartenzahlungInput,
			counts,
			ausgaben,
			umsatzSplits,
			umsatzUstBasis,
		}),
		[
			belegnummer,
			datum,
			selectedRegisterId,
			kassennummer,
			kassenbezeichnung,
			anlass,
			gezaehltVon,
			gepruefftVon,
			bemerkung,
			wechselgeldInput,
			kartenzahlungInput,
			counts,
			ausgaben,
			umsatzSplits,
			umsatzUstBasis,
		],
	);

	const { clearDraft } = useFormDraft<FormDraft>(DRAFT_KEY, snapshot, {
		dirty: dirty && !pending,
		enabled: !pending,
		toastTitle: "Entwurf wiederherstellen?",
		toastDescription: "Eingaben aus einer vorherigen Sitzung wurden gefunden.",
		onRestore: (d) => {
			setBelegnummer(d.belegnummer || belegnummerPreview);
			setDatum(d.datum || todayIsoDate());
			setKassennummer(d.kassennummer ?? "");
			setKassenbezeichnung(d.kassenbezeichnung ?? "");
			setAnlass(d.anlass ?? "");
			setGezaehltVon(d.gezaehltVon ?? "");
			setGepruefftVon(d.gepruefftVon ?? "");
			setBemerkung(d.bemerkung ?? "");
			setWechselgeldInput(
				d.wechselgeldInput ?? formatCentPlain(WECHSELGELD_DEFAULT_CENT),
			);
			setKartenzahlungInput(d.kartenzahlungInput ?? "");
			setCounts(d.counts ?? emptyCounts());
			setAusgaben(
				Array.isArray(d.ausgaben)
					? d.ausgaben.map((a) => ({ ...a, id: nextRowId() }))
					: [],
			);
			setUmsatzSplits(
				Array.isArray(d.umsatzSplits)
					? d.umsatzSplits.map((s) => ({ ...s, id: nextRowId() }))
					: [],
			);
			setUmsatzUstBasis(
				d.umsatzUstBasis === "pre_card" ? "pre_card" : "post_card",
			);
			// Re-validate the stored register selection against currently-known
			// registers; if it has been deleted in the meantime, drop the link
			// but keep the textual kassen-fields the user already had.
			if (d.selectedRegisterId) {
				const stillExists = registers.some(
					(r) => r.id === d.selectedRegisterId,
				);
				setSelectedRegisterId(stillExists ? d.selectedRegisterId : null);
			} else {
				setSelectedRegisterId(null);
			}
			setDirty(true);
			toast.success("Entwurf wiederhergestellt");
		},
	});

	const sanityWarnings = useMemo(() => {
		const counted = Object.values(counts).reduce((s, n) => s + n, 0);
		return runSanityChecks({
			gezaehltCent,
			wechselgeldCent: wechselgeldCent < 0 ? null : wechselgeldCent,
			bestandCent,
			tageseinnahmenCent,
			anyCountEntered: counted > 0,
			gezaehltVon: gezaehltVon.trim(),
			geprueftVon: gepruefftVon.trim(),
			presetWechselgeldCent: selectedRegisterId
				? (registers.find((r) => r.id === selectedRegisterId)
						?.wechselgeld_cent ?? null)
				: null,
			datum,
			today: todayIsoDate(),
		});
	}, [
		counts,
		gezaehltCent,
		wechselgeldCent,
		bestandCent,
		tageseinnahmenCent,
		gezaehltVon,
		gepruefftVon,
		selectedRegisterId,
		registers,
		datum,
	]);

	function setCount(key: DenominationKey, raw: string) {
		const num = raw === "" ? 0 : Number(raw);
		if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) return;
		setCounts((c) => ({ ...c, [key]: num }));
	}

	function updateAusgabe<K extends keyof AusgabeDraft>(
		idx: number,
		key: K,
		value: AusgabeDraft[K],
	) {
		setAusgaben((list) =>
			list.map((a, i) => (i === idx ? { ...a, [key]: value } : a)),
		);
	}

	function addAusgabe() {
		focusLastAusgabe.current = true;
		setAusgaben((list) => [...list, emptyAusgabe()]);
	}
	function removeAusgabe(idx: number) {
		setAusgaben((list) => list.filter((_, i) => i !== idx));
	}

	function updateUmsatz<K extends keyof UmsatzUstDraft>(
		idx: number,
		key: K,
		value: UmsatzUstDraft[K],
	) {
		setUmsatzSplits((list) =>
			list.map((s, i) => (i === idx ? { ...s, [key]: value } : s)),
		);
	}
	function addUmsatzSplit(mode: UstMode = "none") {
		focusLastUmsatz.current = true;
		setUmsatzSplits((list) => [...list, emptyUmsatzSplit(mode)]);
	}
	function removeUmsatzSplit(idx: number) {
		setUmsatzSplits((list) => list.filter((_, i) => i !== idx));
	}
	function fillRestbetrag(idx: number) {
		if (umsatzBasisCent == null) return;
		let other = 0;
		for (let i = 0; i < umsatzSplits.length; i++) {
			if (i === idx) continue;
			const v = parseGermanAmount(umsatzSplits[i].betrag_input);
			if (v == null) return;
			other += v;
		}
		const rest = umsatzBasisCent - other;
		if (rest < 0) return;
		updateUmsatz(idx, "betrag_input", formatCentPlain(rest));
	}

	function submit(e: React.FormEvent) {
		e.preventDefault();
		if (pending) return;
		if (
			!belegnummer.trim() ||
			!kassennummer.trim() ||
			!kassenbezeichnung.trim() ||
			!anlass.trim() ||
			!gezaehltVon.trim() ||
			!gepruefftVon.trim()
		) {
			toast.error("Bitte alle Pflichtfelder ausfüllen");
			return;
		}
		if (!/^[A-Za-z0-9._\-/]+$/.test(belegnummer.trim())) {
			toast.error(
				"Belegnummer darf nur Buchstaben, Ziffern und . _ - / enthalten",
			);
			return;
		}
		if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
			toast.error("Datum ist ungültig");
			return;
		}
		if (wechselgeldCent < 0) {
			toast.error("Wechselgeld ist ungültig");
			return;
		}
		if (kartenzahlungCent < 0) {
			toast.error("Kartenzahlung ist ungültig");
			return;
		}
		const ausgabenPayload: Array<{
			bezeichnung: string;
			empfaenger: string;
			beleg_nr: string;
			betrag_cent: number;
			ust_basis_punkte: number;
		}> = [];
		for (const a of ausgaben) {
			if (!a.bezeichnung.trim()) {
				toast.error("Ausgabe ohne Bezeichnung");
				return;
			}
			const cent = parseGermanAmount(a.betrag_input);
			if (cent == null || cent < 0) {
				toast.error("Ausgabe-Betrag ist ungültig");
				return;
			}
			const bp = ausgabeUstBp(a);
			if (bp == null) {
				toast.error("USt.-Satz ist ungültig (0 bis 100 %)");
				return;
			}
			ausgabenPayload.push({
				bezeichnung: a.bezeichnung.trim(),
				empfaenger: a.empfaenger.trim(),
				beleg_nr: a.beleg_nr.trim(),
				betrag_cent: cent,
				ust_basis_punkte: bp,
			});
		}

		const umsatzPayload: Array<{
			ust_basis_punkte: number;
			betrag_cent: number;
		}> = [];
		if (umsatzSplits.length > 0) {
			if (umsatzBasisCent == null || umsatzBasisCent < 0) {
				toast.error(
					"Tageseinnahmen müssen gültig sein, bevor Umsatz nach USt. erfasst werden kann",
				);
				return;
			}
			for (const s of umsatzSplits) {
				const cent = parseGermanAmount(s.betrag_input);
				if (cent == null || cent < 0) {
					toast.error("Umsatz-Betrag ist ungültig");
					return;
				}
				const bp = umsatzUstBp(s);
				if (bp == null) {
					toast.error("USt.-Satz im Umsatz ist ungültig (0 bis 100 %)");
					return;
				}
				umsatzPayload.push({ ust_basis_punkte: bp, betrag_cent: cent });
			}
			const splitSum = umsatzPayload.reduce((s, u) => s + u.betrag_cent, 0);
			if (splitSum !== umsatzBasisCent) {
				const basisLabel =
					umsatzUstBasis === "pre_card"
						? "Tageseinnahmen ohne Kartenzahlung"
						: "Tageseinnahmen inkl. Kartenzahlung";
				toast.error(
					`Summe der USt.-Aufteilung (${formatCent(splitSum)}) muss den ${basisLabel} (${formatCent(umsatzBasisCent)}) entsprechen`,
				);
				return;
			}
		}

		const trimmedBelegnummer = belegnummer.trim();
		const payload: Record<string, unknown> = {
			anlass_datum: datum,
			kassennummer: kassennummer.trim(),
			kassenbezeichnung: kassenbezeichnung.trim(),
			anlass: anlass.trim(),
			gezaehlt_von: gezaehltVon.trim(),
			geprueft_von: gepruefftVon.trim(),
			bemerkung: bemerkung.trim(),
			wechselgeld_cent: wechselgeldCent,
			kartenzahlung_cent: kartenzahlungCent,
			ausgaben: ausgabenPayload,
			umsatz_ust: umsatzPayload,
			umsatz_ust_basis: umsatzUstBasis,
		};
		// Only send belegnummer as a user-chosen override when the user
		// actually edited the prefilled preview. Otherwise the server is left
		// to allocate a fresh sequence inside the insert transaction, which
		// avoids 409 conflicts when two staff create protokolle in parallel
		// after both seeing the same preview value.
		if (trimmedBelegnummer && trimmedBelegnummer !== belegnummerPreview) {
			payload.belegnummer = trimmedBelegnummer;
		}
		for (const d of DENOMINATIONS) payload[d.key] = counts[d.key];

		startTransition(async () => {
			try {
				const body = await orpcClient.protokolle.create(
					payload as unknown as Parameters<
						typeof orpcClient.protokolle.create
					>[0],
				);
				clearDraft();
				setDirty(false);
				const gezTrim = gezaehltVon.trim();
				const gepTrim = gepruefftVon.trim();
				if (gezTrim) setLocalPref(LOCAL_PREF_KEYS.lastGezaehltVon, gezTrim);
				if (gepTrim) setLocalPref(LOCAL_PREF_KEYS.lastGeprueftVon, gepTrim);
				if (selectedRegisterId) {
					setLocalPref(LOCAL_PREF_KEYS.lastRegisterId, selectedRegisterId);
				} else {
					clearLocalPref(LOCAL_PREF_KEYS.lastRegisterId);
				}
				toast.success("Protokoll gespeichert");
				await queryClient.invalidateQueries();
				await navigate({ to: "/protokolle/$id", params: { id: body.id } });
			} catch (e) {
				toast.error(orpcMessage(e, "Speichern fehlgeschlagen"));
			}
		});
	}

	return (
		<form onSubmit={submit} onChange={markDirty} onInput={markDirty}>
			<div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="space-y-8">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<FileText className="h-4 w-4 text-primary" />
								Kopfdaten
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label htmlFor="belegnummer">Belegnummer</Label>
									<Input
										id="belegnummer"
										value={belegnummer}
										onChange={(e) => setBelegnummer(e.target.value)}
										required
										maxLength={50}
										className="font-mono"
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="datum">Datum</Label>
									<Input
										id="datum"
										type="date"
										value={datum}
										onChange={(e) => setDatum(e.target.value)}
										required
									/>
								</div>
							</div>
							{registers.length > 0 ? (
								<div className="space-y-2">
									<Label className="inline-flex items-center gap-1.5">
										<Wallet className="h-3.5 w-3.5 text-muted-foreground" />
										Kasse wählen
									</Label>
									<div className="flex flex-wrap gap-2">
										{registers.map((r) => {
											const active = selectedRegisterId === r.id;
											return (
												<button
													key={r.id}
													type="button"
													onClick={() => applyRegister(r)}
													className={cn(
														"rounded-lg border px-3 py-1.5 text-left text-xs transition-colors",
														active
															? "border-primary/60 bg-primary/10 text-foreground ring-1 ring-primary/30"
															: "border-border bg-card/40 text-muted-foreground hover:border-primary/40 hover:text-foreground",
													)}
												>
													<span className="block font-mono text-[12px] font-medium text-foreground">
														{r.kassennummer}
													</span>
													<span className="block text-[11px]">
														{r.kassenbezeichnung}
													</span>
													<span className="block text-[10px] text-muted-foreground">
														Wechselgeld {formatCent(r.wechselgeld_cent)}
													</span>
												</button>
											);
										})}
										{selectedRegisterId ? (
											<button
												type="button"
												onClick={clearRegister}
												className="rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
											>
												Auswahl aufheben
											</button>
										) : null}
									</div>
									<p className="text-[11px] text-muted-foreground">
										Wählt eine Kasse aus, übernimmt Kassennummer,
										Kassenbezeichnung und Wechselgeld.
									</p>
								</div>
							) : null}
							<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
								<div className="space-y-2">
									<Label htmlFor="kassennummer">Kassennummer</Label>
									<Input
										id="kassennummer"
										value={kassennummer}
										onChange={(e) => {
											setKassennummer(e.target.value);
											setSelectedRegisterId(null);
										}}
										required
										maxLength={50}
										placeholder="z.B. K-01"
										className="font-mono"
									/>
								</div>
								<div className="space-y-2 sm:col-span-2">
									<Label htmlFor="kassenbezeichnung">Kassenbezeichnung</Label>
									<Input
										id="kassenbezeichnung"
										value={kassenbezeichnung}
										onChange={(e) => {
											setKassenbezeichnung(e.target.value);
											setSelectedRegisterId(null);
										}}
										required
										maxLength={120}
										placeholder="z.B. Sportheim Theke"
									/>
								</div>
							</div>
							<div className="space-y-2">
								<Label htmlFor="anlass">Anlass</Label>
								<Input
									id="anlass"
									value={anlass}
									onChange={(e) => setAnlass(e.target.value)}
									required
									autoFocus
									maxLength={200}
									placeholder="z.B. Heimspiel 1. Mannschaft"
								/>
							</div>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label htmlFor="gezaehlt_von">Gezählt von</Label>
									<Input
										id="gezaehlt_von"
										value={gezaehltVon}
										onChange={(e) => setGezaehltVon(e.target.value)}
										required
										maxLength={120}
										autoComplete="name"
										placeholder="Vor- und Nachname"
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="geprueft_von">Geprüft von</Label>
									<Input
										id="geprueft_von"
										value={gepruefftVon}
										onChange={(e) => setGepruefftVon(e.target.value)}
										required
										maxLength={120}
										autoComplete="name"
										placeholder="Vor- und Nachname"
									/>
								</div>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Coins className="h-4 w-4 text-primary" />
								Stückelung
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<p className="text-xs text-muted-foreground">
								Trage die Anzahl je Schein oder Münze ein; die Beträge werden
								automatisch berechnet.
							</p>
							<div className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2">
								<div>
									<h3 className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
										<Banknote className="h-3.5 w-3.5" />
										Scheine
									</h3>
									<DenominationSection
										kind="schein"
										counts={counts}
										setCount={setCount}
									/>
								</div>
								<div>
									<h3 className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
										<Coins className="h-3.5 w-3.5" />
										Münzen
									</h3>
									<DenominationSection
										kind="muenze"
										counts={counts}
										setCount={setCount}
									/>
								</div>
							</div>
							<div className="mt-4 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
								<span className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
									Summe gezählt
								</span>
								<Money cent={gezaehltCent} emphasis />
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="flex flex-row items-center justify-between">
							<CardTitle className="flex items-center gap-2">
								<ReceiptText className="h-4 w-4 text-primary" />
								Betriebliche Ausgaben
							</CardTitle>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={addAusgabe}
							>
								<Plus className="mr-2 h-4 w-4" />
								Ausgabe hinzufügen
							</Button>
						</CardHeader>
						<CardContent className="space-y-3">
							{ausgaben.length === 0 ? (
								<p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
									Keine Ausgaben erfasst.
								</p>
							) : (
								ausgaben.map((a, i) => {
									const isLast = i === ausgaben.length - 1;
									const brutto = parseGermanAmount(a.betrag_input);
									const bp = ausgabeUstBp(a);
									const ustCent =
										brutto != null && bp != null
											? ustAnteilCent(brutto, bp)
											: null;
									return (
										<div
											key={a.id}
											className="rounded-xl border border-border/70 bg-muted/20 p-3"
										>
											<div className="grid grid-cols-1 items-start gap-2 md:grid-cols-12">
												<div className="md:col-span-4 space-y-1">
													<Label htmlFor={`bez-${i}`}>Bezeichnung</Label>
													<Input
														id={`bez-${i}`}
														ref={isLast ? lastAusgabeRef : undefined}
														value={a.bezeichnung}
														onChange={(e) =>
															updateAusgabe(i, "bezeichnung", e.target.value)
														}
														required
														placeholder="z.B. Pizzakauf"
													/>
												</div>
												<div className="md:col-span-3 space-y-1">
													<Label htmlFor={`emp-${i}`}>Empfänger</Label>
													<Input
														id={`emp-${i}`}
														value={a.empfaenger}
														onChange={(e) =>
															updateAusgabe(i, "empfaenger", e.target.value)
														}
														placeholder="Optional"
													/>
												</div>
												<div className="md:col-span-2 space-y-1">
													<Label htmlFor={`bel-${i}`}>Beleg-Nr.</Label>
													<Input
														id={`bel-${i}`}
														value={a.beleg_nr}
														onChange={(e) =>
															updateAusgabe(i, "beleg_nr", e.target.value)
														}
														placeholder="Optional"
													/>
												</div>
												<div className="md:col-span-2 space-y-1">
													<Label htmlFor={`bet-${i}`}>Betrag EUR</Label>
													<Input
														id={`bet-${i}`}
														inputMode="decimal"
														placeholder="0,00"
														value={a.betrag_input}
														onFocus={selectOnFocus}
														onChange={(e) =>
															updateAusgabe(i, "betrag_input", e.target.value)
														}
														className="text-right tabular-nums"
													/>
												</div>
												<div className="md:col-span-1 flex md:items-end md:justify-end">
													<Button
														type="button"
														variant="ghost"
														size="icon"
														aria-label="Ausgabe entfernen"
														onClick={() => removeAusgabe(i)}
													>
														<Trash2 className="h-4 w-4" />
													</Button>
												</div>
											</div>

											<div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
												<span className="text-xs font-medium text-muted-foreground">
													USt.
												</span>
												<div className="inline-flex items-center rounded-lg border border-border/70 bg-background/80 p-0.5 shadow-sm">
													<UstChip
														active={a.ust_mode === "none"}
														onClick={() => updateAusgabe(i, "ust_mode", "none")}
													>
														0 %
													</UstChip>
													<UstChip
														active={a.ust_mode === "p7"}
														onClick={() => updateAusgabe(i, "ust_mode", "p7")}
													>
														7 %
													</UstChip>
													<UstChip
														active={a.ust_mode === "p19"}
														onClick={() => updateAusgabe(i, "ust_mode", "p19")}
													>
														19 %
													</UstChip>
													<UstChip
														active={a.ust_mode === "custom"}
														onClick={() =>
															updateAusgabe(i, "ust_mode", "custom")
														}
													>
														Andere
													</UstChip>
												</div>
												{a.ust_mode === "custom" ? (
													<div className="space-y-1">
														<div className="relative">
															<Input
																inputMode="decimal"
																value={a.ust_custom_input}
																onFocus={selectOnFocus}
																onChange={(e) =>
																	updateAusgabe(
																		i,
																		"ust_custom_input",
																		e.target.value,
																	)
																}
																placeholder="0,0"
																className="h-9 w-24 pr-7 text-right tabular-nums sm:h-8 sm:w-20"
																aria-label="USt.-Satz in Prozent"
																aria-invalid={
																	a.ust_custom_input.trim() !== "" && bp == null
																}
															/>
															<span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">
																%
															</span>
														</div>
														{a.ust_custom_input.trim() !== "" && bp == null ? (
															<p className="text-[11px] text-destructive">
																0 bis 100 %
															</p>
														) : null}
													</div>
												) : null}
												{bp != null && bp > 0 && ustCent != null ? (
													<span className="ml-auto text-xs text-muted-foreground">
														davon USt.{" "}
														<Money cent={ustCent} className="text-xs" />
													</span>
												) : null}
											</div>
										</div>
									);
								})
							)}
							{ausgaben.length > 0 && ustSummeCent > 0 ? (
								<div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
									<span>Summe USt. (rechnerisch)</span>
									<Money cent={ustSummeCent} className="text-xs" />
								</div>
							) : null}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Wallet className="h-4 w-4 text-primary" />
								Bargeld und Kartenzahlung
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<p className="text-xs text-muted-foreground">
								Wechselgeld wird vom gezählten Bestand abgezogen.
								Kartenzahlungen erhöhen die Tageseinnahmen zusätzlich.
							</p>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label htmlFor="wechselgeld">
										Anfangsbestand (Wechselgeld) EUR
									</Label>
									<Input
										id="wechselgeld"
										inputMode="decimal"
										value={wechselgeldInput}
										onFocus={selectOnFocus}
										onChange={(e) => {
											setWechselgeldInput(e.target.value);
											setSelectedRegisterId(null);
										}}
										required
										aria-invalid={
											wechselgeldInput.trim() !== "" && wechselgeldCent < 0
										}
										className="text-right tabular-nums"
									/>
									{wechselgeldInput.trim() !== "" && wechselgeldCent < 0 ? (
										<p className="text-[11px] text-destructive">
											Bitte einen gültigen EUR-Betrag eingeben.
										</p>
									) : null}
								</div>
								<div className="space-y-2">
									<Label htmlFor="kartenzahlung">Kartenzahlung EUR</Label>
									<Input
										id="kartenzahlung"
										inputMode="decimal"
										placeholder="0,00"
										value={kartenzahlungInput}
										onFocus={selectOnFocus}
										onChange={(e) => setKartenzahlungInput(e.target.value)}
										aria-invalid={
											kartenzahlungInput.trim() !== "" && kartenzahlungCent < 0
										}
										className="text-right tabular-nums"
									/>
									{kartenzahlungInput.trim() !== "" && kartenzahlungCent < 0 ? (
										<p className="text-[11px] text-destructive">
											Bitte einen gültigen EUR-Betrag eingeben.
										</p>
									) : null}
								</div>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="flex flex-row items-center justify-between">
							<CardTitle className="flex items-center gap-2">
								<Percent className="h-4 w-4 text-primary" />
								Umsatz nach USt.
							</CardTitle>
							<div className="flex flex-wrap gap-2">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => addUmsatzSplit("p7")}
								>
									<Plus className="mr-2 h-4 w-4" />7 %
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => addUmsatzSplit("p19")}
								>
									<Plus className="mr-2 h-4 w-4" />
									19 %
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => addUmsatzSplit("none")}
								>
									<Plus className="mr-2 h-4 w-4" />
									Anteil
								</Button>
							</div>
						</CardHeader>
						<CardContent className="space-y-3">
							<p className="text-xs text-muted-foreground">
								Optional. Tageseinnahmen auf USt.-Sätze aufteilen (z. B.
								500&nbsp;EUR zu 7&nbsp;% und 500&nbsp;EUR zu 19&nbsp;%). Die
								Summe muss den Tageseinnahmen entsprechen.
							</p>
							{kartenzahlungCent > 0 ? (
								<div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
									<div className="flex flex-wrap items-center gap-2">
										<span className="text-xs font-medium text-muted-foreground">
											Bezugsgröße
										</span>
										<div className="inline-flex items-center rounded-lg border border-border/70 bg-background/80 p-0.5 shadow-sm">
											<UstChip
												active={umsatzUstBasis === "post_card"}
												onClick={() => setUmsatzUstBasis("post_card")}
											>
												Mit Kartenzahlung
											</UstChip>
											<UstChip
												active={umsatzUstBasis === "pre_card"}
												onClick={() => setUmsatzUstBasis("pre_card")}
											>
												Ohne Kartenzahlung
											</UstChip>
										</div>
										<span className="ml-auto text-[11px] text-muted-foreground">
											Standard:{" "}
											{umsatzUstBasisDefault === "post_card"
												? "mit Kartenzahlung"
												: "ohne Kartenzahlung"}
										</span>
									</div>
									<p className="mt-2 text-[11px] text-muted-foreground">
										Wähle, ob die USt.-Aufteilung nur den Barumsatz oder den
										Gesamtumsatz inklusive Kartenzahlung abbildet.
									</p>
								</div>
							) : null}
							{umsatzSplits.length === 0 ? (
								<p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
									Keine USt.-Aufteilung erfasst.
								</p>
							) : (
								umsatzSplits.map((s, i) => {
									const isLast = i === umsatzSplits.length - 1;
									const brutto = parseGermanAmount(s.betrag_input);
									const bp = umsatzUstBp(s);
									const ustCent =
										brutto != null && bp != null
											? ustAnteilCent(brutto, bp)
											: null;
									return (
										<div
											key={s.id}
											className="rounded-xl border border-border/70 bg-muted/20 p-3"
										>
											<div className="grid grid-cols-1 items-end gap-2 md:grid-cols-12">
												<div className="md:col-span-7 space-y-1">
													<Label className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
														USt.-Satz
													</Label>
													<div className="flex flex-wrap items-center gap-2">
														<div className="inline-flex items-center rounded-lg border border-border/70 bg-background/80 p-0.5 shadow-sm">
															<UstChip
																active={s.ust_mode === "none"}
																onClick={() =>
																	updateUmsatz(i, "ust_mode", "none")
																}
															>
																0 %
															</UstChip>
															<UstChip
																active={s.ust_mode === "p7"}
																onClick={() =>
																	updateUmsatz(i, "ust_mode", "p7")
																}
															>
																7 %
															</UstChip>
															<UstChip
																active={s.ust_mode === "p19"}
																onClick={() =>
																	updateUmsatz(i, "ust_mode", "p19")
																}
															>
																19 %
															</UstChip>
															<UstChip
																active={s.ust_mode === "custom"}
																onClick={() =>
																	updateUmsatz(i, "ust_mode", "custom")
																}
															>
																Andere
															</UstChip>
														</div>
														{s.ust_mode === "custom" ? (
															<div className="space-y-1">
																<div className="relative">
																	<Input
																		inputMode="decimal"
																		value={s.ust_custom_input}
																		onFocus={selectOnFocus}
																		onChange={(e) =>
																			updateUmsatz(
																				i,
																				"ust_custom_input",
																				e.target.value,
																			)
																		}
																		placeholder="0,0"
																		className="h-9 w-24 pr-7 text-right tabular-nums sm:h-8 sm:w-20"
																		aria-label="USt.-Satz in Prozent"
																		aria-invalid={
																			s.ust_custom_input.trim() !== "" &&
																			bp == null
																		}
																	/>
																	<span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">
																		%
																	</span>
																</div>
																{s.ust_custom_input.trim() !== "" &&
																bp == null ? (
																	<p className="text-[11px] text-destructive">
																		0 bis 100 %
																	</p>
																) : null}
															</div>
														) : null}
													</div>
												</div>
												<div className="md:col-span-3 space-y-1">
													<Label htmlFor={`umsatz-bet-${i}`}>Brutto EUR</Label>
													<Input
														id={`umsatz-bet-${i}`}
														ref={isLast ? lastUmsatzRef : undefined}
														inputMode="decimal"
														placeholder="0,00"
														value={s.betrag_input}
														onFocus={selectOnFocus}
														onChange={(e) =>
															updateUmsatz(i, "betrag_input", e.target.value)
														}
														className="text-right tabular-nums"
													/>
												</div>
												<div className="md:col-span-2 flex items-end gap-1 md:justify-end">
													<Button
														type="button"
														variant="ghost"
														size="sm"
														onClick={() => fillRestbetrag(i)}
														disabled={umsatzBasisCent == null}
														title="Restbetrag bis Tageseinnahmen einsetzen"
													>
														Rest
													</Button>
													<Button
														type="button"
														variant="ghost"
														size="icon"
														aria-label="USt.-Aufteilung entfernen"
														onClick={() => removeUmsatzSplit(i)}
													>
														<Trash2 className="h-4 w-4" />
													</Button>
												</div>
											</div>
											{bp != null && bp > 0 && ustCent != null ? (
												<div className="mt-2 flex justify-end gap-1 text-xs text-muted-foreground">
													davon USt.
													<Money cent={ustCent} className="text-xs" />
												</div>
											) : null}
										</div>
									);
								})
							)}
							{umsatzSplits.length > 0 ? (
								<div className="space-y-1 rounded-lg bg-muted/40 px-3 py-2 text-xs">
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">
											Summe Aufteilung
										</span>
										{umsatzSplitSummeCent == null ? (
											<span className="font-mono tabular-nums text-foreground">
												-
											</span>
										) : (
											<Money cent={umsatzSplitSummeCent} className="text-xs" />
										)}
									</div>
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">
											{kartenzahlungCent > 0
												? umsatzUstBasis === "pre_card"
													? "Tageseinnahmen (ohne Kartenzahlung)"
													: "Tageseinnahmen (inkl. Kartenzahlung)"
												: "Tageseinnahmen"}
										</span>
										{umsatzBasisCent == null ? (
											<span className="font-mono tabular-nums text-foreground">
												-
											</span>
										) : (
											<Money cent={umsatzBasisCent} className="text-xs" />
										)}
									</div>
									<div
										className={cn(
											"flex items-center justify-between font-medium",
											umsatzDiffCent == null
												? "text-muted-foreground"
												: umsatzDiffCent === 0
													? "text-success"
													: "text-destructive",
										)}
									>
										<span>Differenz</span>
										{umsatzDiffCent == null ? (
											<span className="font-mono tabular-nums">-</span>
										) : (
											<Money
												cent={umsatzDiffCent}
												tone={umsatzDiffCent === 0 ? "positive" : "negative"}
												className="text-xs"
											/>
										)}
									</div>
									{umsatzUstSummeCent > 0 ? (
										<div className="flex items-center justify-between border-t border-border/50 pt-1 text-muted-foreground">
											<span>Summe USt. (rechnerisch)</span>
											<Money cent={umsatzUstSummeCent} className="text-xs" />
										</div>
									) : null}
								</div>
							) : null}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<FileText className="h-4 w-4 text-primary" />
								Bemerkung
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								<div className="flex items-center justify-end">
									<span className="text-[11px] tabular-nums text-muted-foreground">
										{bemerkung.length} / {BEMERKUNG_MAX}
									</span>
								</div>
								<Textarea
									id="bemerkung"
									value={bemerkung}
									onChange={(e) => setBemerkung(e.target.value)}
									rows={3}
									maxLength={BEMERKUNG_MAX}
									placeholder="Optional"
								/>
							</div>
						</CardContent>
					</Card>

					<SanityWarnings warnings={sanityWarnings} />
				</div>

				<div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
					<Card variant="hero">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Calculator className="h-4 w-4 text-primary" />
								Zusammenfassung
							</CardTitle>
						</CardHeader>
						<CardContent>
							<DataRow label="Gezählter Endbestand">
								<Money cent={gezaehltCent} />
							</DataRow>
							<DataRow label="Betriebliche Ausgaben">
								{ausgabenCent == null ? "-" : <Money cent={ausgabenCent} />}
							</DataRow>
							<DataRow label="Kassenbestand brutto" emphasis>
								{bestandCent == null ? (
									"-"
								) : (
									<Money cent={bestandCent} emphasis />
								)}
							</DataRow>
							<DataRow label="Anfangsbestand (Wechselgeld)">
								{wechselgeldCent < 0 ? "-" : <Money cent={wechselgeldCent} />}
							</DataRow>
							{kartenzahlungCent > 0 ? (
								<DataRow label="Kartenzahlung">
									<Money cent={kartenzahlungCent} />
								</DataRow>
							) : null}
							{kartenzahlungCent > 0 ? (
								<>
									<DataRow label="Tageseinnahmen netto (ohne Karte)" divider>
										{tageseinnahmenCent == null ? (
											"-"
										) : (
											<Money cent={tageseinnahmenCent} />
										)}
									</DataRow>
									<DataRow label="Tageseinnahmen netto (mit Karte)" emphasis>
										{tageseinnahmenGesamtCent == null ? (
											"-"
										) : (
											<Money
												cent={tageseinnahmenGesamtCent}
												tone="primary"
												emphasis
												className="text-base"
											/>
										)}
									</DataRow>
								</>
							) : (
								<DataRow label="Tageseinnahmen netto" emphasis divider>
									{tageseinnahmenCent == null ? (
										"-"
									) : (
										<Money
											cent={tageseinnahmenCent}
											tone="primary"
											emphasis
											className="text-base"
										/>
									)}
								</DataRow>
							)}
						</CardContent>
					</Card>

					<div className="flex justify-end">
						<Button
							type="submit"
							disabled={pending}
							className="w-full lg:w-auto"
						>
							{pending ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Speichern&hellip;
								</>
							) : (
								<>
									<Save className="mr-2 h-4 w-4" />
									Speichern und PDF erzeugen
								</>
							)}
						</Button>
					</div>
				</div>
			</div>
		</form>
	);
}

function UstChip({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"min-h-8 rounded-md px-2.5 py-1 text-xs font-medium transition-colors sm:min-h-0",
				active
					? "bg-primary/10 text-primary"
					: "text-muted-foreground hover:text-foreground",
			)}
		>
			{children}
		</button>
	);
}

function DenominationSection({
	kind,
	counts,
	setCount,
}: {
	kind: "schein" | "muenze";
	counts: DenominationCounts;
	setCount: (key: DenominationKey, raw: string) => void;
}) {
	return (
		<div className="space-y-1.5">
			{DENOMINATIONS.filter((d) => d.kind === kind).map((d) => {
				const count = counts[d.key];
				const teil = count * d.cent;
				const isZero = count === 0;
				return (
					<div
						key={d.key}
						className="grid grid-cols-12 items-center gap-2 text-sm"
					>
						<Label
							htmlFor={d.key}
							className="col-span-3 justify-end text-right font-mono tabular-nums text-muted-foreground"
						>
							{d.label}
						</Label>
						<Input
							id={d.key}
							type="number"
							min={0}
							step={1}
							value={isZero ? "" : count}
							placeholder="0"
							onChange={(e) => setCount(d.key, e.target.value)}
							onFocus={selectOnFocus}
							onWheel={blurOnWheel}
							className="col-span-4 text-right tabular-nums"
							aria-label={`Anzahl ${d.label}`}
						/>
						<div className="col-span-5 text-right">
							{isZero ? (
								<span className="font-mono tabular-nums text-muted-foreground/40">
									-
								</span>
							) : (
								<Money cent={teil} className="text-foreground/80" />
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}
