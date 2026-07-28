"use client";

import { useBlocker } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

function storage(): Storage | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

function readDraft<T>(key: string): T | null {
	const s = storage();
	if (!s) return null;
	try {
		const raw = s.getItem(key);
		if (!raw) return null;
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

function writeDraft<T>(key: string, value: T): void {
	const s = storage();
	if (!s) return;
	try {
		s.setItem(key, JSON.stringify(value));
	} catch {
		// ignore quota / serialization errors
	}
}

function removeDraft(key: string): void {
	const s = storage();
	if (!s) return;
	try {
		s.removeItem(key);
	} catch {
		// ignore
	}
}

export type UseFormDraftOptions<T> = {
	/** Called when the user picks "Wiederherstellen" on the restore toast. */
	onRestore: (snapshot: T) => void;
	/** Whether the form currently has unsaved user input. */
	dirty: boolean;
	/** Disable draft persistence (e.g. while submitting). */
	enabled?: boolean;
	/** Optional title for the restore toast. */
	toastTitle?: string;
	/** Optional description for the restore toast. */
	toastDescription?: string;
	/** Previous storage keys that should be migrated once when found. */
	legacyKeys?: string[];
};

export type UseFormDraftReturn = {
	/** Delete the persisted draft, e.g. after a successful save. */
	clearDraft: () => void;
};

const DEBOUNCE_MS = 500;

/**
 * Persists a form snapshot to localStorage, shows a restore toast on mount
 * if one exists, and wires up a beforeunload warning while the form is
 * dirty. Degrades silently when localStorage is unavailable.
 */
export function useFormDraft<T>(
	key: string,
	snapshot: T,
	opts: UseFormDraftOptions<T>,
): UseFormDraftReturn {
	const enabled = opts.enabled !== false;
	const restoredRef = useRef(false);
	const onRestoreRef = useRef(opts.onRestore);
	const latestRef = useRef({ key, snapshot, dirty: opts.dirty, enabled });
	latestRef.current = { key, snapshot, dirty: opts.dirty, enabled };

	const flushLatestDraft = useCallback(() => {
		const latest = latestRef.current;
		if (latest.enabled && latest.dirty) {
			writeDraft(latest.key, latest.snapshot);
		}
	}, []);

	const shouldBlockNavigation = useCallback(() => {
		const latest = latestRef.current;
		if (!latest.enabled || !latest.dirty) return false;
		flushLatestDraft();
		return !window.confirm(
			"Nicht gespeicherte Eingaben verlassen? Dein Entwurf bleibt gespeichert.",
		);
	}, [flushLatestDraft]);

	useBlocker({
		shouldBlockFn: shouldBlockNavigation,
		// Keep the existing beforeunload handler below. It also flushes the latest
		// snapshot before the browser shows its native confirmation prompt.
		enableBeforeUnload: false,
		disabled: !enabled || !opts.dirty,
	});

	useEffect(() => {
		onRestoreRef.current = opts.onRestore;
	});

	// A route transition can unmount the form before the debounced write fires.
	// Flush from a dedicated unmount-only effect so ordinary snapshot changes do
	// not defeat the debounce.
	useEffect(() => () => flushLatestDraft(), [flushLatestDraft]);

	// Show restore toast once on mount.
	useEffect(() => {
		if (restoredRef.current) return;
		restoredRef.current = true;
		if (!enabled) return;
		let existing = readDraft<T>(key);
		if (existing == null) {
			for (const legacyKey of opts.legacyKeys ?? []) {
				existing = readDraft<T>(legacyKey);
				if (existing != null) {
					writeDraft(key, existing);
					removeDraft(legacyKey);
					break;
				}
			}
		}
		if (existing == null) return;
		toast(opts.toastTitle ?? "Entwurf wiederherstellen?", {
			description:
				opts.toastDescription ??
				"Aus einer vorherigen Sitzung wurden Eingaben gefunden.",
			duration: 12_000,
			action: {
				label: "Wiederherstellen",
				onClick: () => {
					onRestoreRef.current(existing);
				},
			},
			cancel: {
				label: "Verwerfen",
				onClick: () => {
					removeDraft(key);
				},
			},
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key]);

	// Debounced write whenever the snapshot changes while dirty.
	useEffect(() => {
		if (!enabled) return;
		if (!opts.dirty) return;
		const handle = setTimeout(() => writeDraft(key, snapshot), DEBOUNCE_MS);
		return () => clearTimeout(handle);
	}, [key, snapshot, opts.dirty, enabled]);

	// beforeunload prompt while dirty.
	useEffect(() => {
		if (!enabled) return;
		if (!opts.dirty) return;
		const handler = (e: BeforeUnloadEvent) => {
			flushLatestDraft();
			e.preventDefault();
			// Legacy browsers (Chrome <51) need returnValue set.
			e.returnValue = "";
		};
		window.addEventListener("beforeunload", handler);
		return () => window.removeEventListener("beforeunload", handler);
	}, [opts.dirty, enabled, flushLatestDraft]);

	return {
		clearDraft: () => {
			// Successful saves clear the draft immediately before navigating. Mark the
			// latest snapshot clean too so the unmount flush cannot recreate it.
			latestRef.current.dirty = false;
			removeDraft(latestRef.current.key);
		},
	};
}
