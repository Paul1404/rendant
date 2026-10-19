import type { ProtokollRow } from "@/lib/protokoll-types";

export type ProtokollEventGroup = {
	key: string;
	label: string;
	items: ProtokollRow[];
	sumActiveCent: number;
	hasCardRevenue: boolean;
};

// A catalogue occasion repeats across dates. Legacy rows without a catalogue
// reference only belong together when their full labels agree.
export function groupProtokollEvents(
	items: ProtokollRow[],
): ProtokollEventGroup[] {
	const groups = new Map<string, ProtokollEventGroup>();
	for (const item of items) {
		const key = JSON.stringify([
			item.anlass_datum,
			item.anlass_katalog_id ? "catalogue" : "label",
			item.anlass_katalog_id ?? item.anlass.trim().toLocaleLowerCase("de-DE"),
			item.umsatzbereich,
		]);
		let group = groups.get(key);
		if (!group) {
			group = {
				key,
				label: item.anlass,
				items: [],
				sumActiveCent: 0,
				hasCardRevenue: false,
			};
			groups.set(key, group);
		}
		group.items.push(item);
		if (!item.storniert_am) {
			group.sumActiveCent += item.tageseinnahmen_cent + item.kartenzahlung_cent;
			group.hasCardRevenue ||= item.kartenzahlung_cent !== 0;
		}
	}
	return [...groups.values()];
}

// Page size is a target: an event may exceed it, but is never split. Input is
// already in display order (months descending, then existing receipt order).
export function paginateProtokollEvents(
	groups: ProtokollEventGroup[],
	pageSize: number,
): ProtokollRow[][] {
	const pages: ProtokollRow[][] = [];
	let page: ProtokollRow[] = [];
	for (const group of groups) {
		if (page.length && page.length + group.items.length > pageSize) {
			pages.push(page);
			page = [];
		}
		page.push(...group.items);
	}
	if (page.length) pages.push(page);
	return pages;
}
