import { tenantStorageKey } from "@/lib/tenant-client";

export const LOCAL_PREF_KEYS = {
	lastRegisterId: "rendant:lastRegisterId",
	lastGezaehltVon: "rendant:lastGezaehltVon",
	lastGeprueftVon: "rendant:lastGeprueftVon",
} as const;

export type LocalPrefKey =
	(typeof LOCAL_PREF_KEYS)[keyof typeof LOCAL_PREF_KEYS];

function storage(): Storage | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

export function getLocalPref(key: LocalPrefKey): string | null {
	const s = storage();
	if (!s) return null;
	try {
		const scopedKey = tenantStorageKey(key);
		return scopedKey ? s.getItem(scopedKey) : null;
	} catch {
		return null;
	}
}

export function setLocalPref(key: LocalPrefKey, value: string): void {
	const s = storage();
	if (!s) return;
	try {
		const scopedKey = tenantStorageKey(key);
		if (scopedKey) s.setItem(scopedKey, value);
	} catch {
		// Quota / private mode — silently ignore.
	}
}

export function clearLocalPref(key: LocalPrefKey): void {
	const s = storage();
	if (!s) return;
	try {
		const scopedKey = tenantStorageKey(key);
		if (scopedKey) s.removeItem(scopedKey);
	} catch {
		// ignore
	}
}
