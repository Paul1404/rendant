export const LOCAL_PREF_KEYS = {
	lastRegisterId: "rendant:lastRegisterId",
	lastGezaehltVon: "rendant:lastGezaehltVon",
	lastGeprueftVon: "rendant:lastGeprueftVon",
} as const;

export type LocalPrefKey =
	(typeof LOCAL_PREF_KEYS)[keyof typeof LOCAL_PREF_KEYS];

const LEGACY_LOCAL_PREF_KEYS: Partial<Record<LocalPrefKey, string>> = {
	"rendant:lastRegisterId": "svufo:lastRegisterId",
	"rendant:lastGezaehltVon": "svufo:lastGezaehltVon",
	"rendant:lastGeprueftVon": "svufo:lastGeprueftVon",
};

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
		const current = s.getItem(key);
		if (current != null) return current;
		const legacyKey = LEGACY_LOCAL_PREF_KEYS[key];
		if (!legacyKey) return null;
		const legacy = s.getItem(legacyKey);
		if (legacy != null) {
			s.setItem(key, legacy);
			s.removeItem(legacyKey);
		}
		return legacy;
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
