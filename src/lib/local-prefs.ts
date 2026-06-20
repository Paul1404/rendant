export const LOCAL_PREF_KEYS = {
	lastRegisterId: "svufo:lastRegisterId",
	lastGezaehltVon: "svufo:lastGezaehltVon",
	lastGeprueftVon: "svufo:lastGeprueftVon",
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
		const v = s.getItem(key);
		return v ?? null;
	} catch {
		return null;
	}
}

export function setLocalPref(key: LocalPrefKey, value: string): void {
	const s = storage();
	if (!s) return;
	try {
		s.setItem(key, value);
	} catch {
		// Quota / private mode — silently ignore.
	}
}

export function clearLocalPref(key: LocalPrefKey): void {
	const s = storage();
	if (!s) return;
	try {
		s.removeItem(key);
	} catch {
		// ignore
	}
}
