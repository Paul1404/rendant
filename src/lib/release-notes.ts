// Internal release notes, parsed at build time from the repo's CHANGELOG.md.
// The raw markdown is bundled via Vite's `?raw` import so the notes ship with
// the app instead of linking out. Newest release first (file order).
import changelog from "../../CHANGELOG.md?raw";

export type Release = {
	version: string;
	date: string | null;
	notes: string[];
};

// Matches a section heading like `## 1.0.1 — 2026-06-20` or `## 1.0.0`.
// The separator before the date may be any dash variant or omitted entirely.
const HEADING = /^##\s+(\S+)(?:\s*[—–-]\s*(.+))?$/;

function parseReleases(raw: string): Release[] {
	const releases: Release[] = [];
	let current: Release | null = null;
	// Tracks the in-progress bullet so wrapped continuation lines can be joined.
	let pendingNote: string | null = null;

	const flushNote = () => {
		if (current && pendingNote !== null) {
			const note = pendingNote.trim();
			if (note.length > 0) {
				current.notes.push(note);
			}
		}
		pendingNote = null;
	};

	for (const line of raw.split("\n")) {
		const heading = line.match(HEADING);
		if (heading) {
			flushNote();
			current = {
				version: heading[1],
				date: heading[2]?.trim() ?? null,
				notes: [],
			};
			releases.push(current);
			continue;
		}

		// Ignore anything before the first release heading (the `# Changelog`
		// title and intro paragraph).
		if (!current) {
			continue;
		}

		const bullet = line.match(/^-\s+(.*)$/);
		if (bullet) {
			flushNote();
			pendingNote = bullet[1];
			continue;
		}

		const trimmed = line.trim();
		if (trimmed.length === 0) {
			// Blank line ends the current bullet but not the release section.
			flushNote();
			continue;
		}

		if (pendingNote !== null) {
			// Indented continuation of the current bullet.
			pendingNote += ` ${trimmed}`;
		}
	}

	flushNote();
	return releases;
}

export const RELEASES: Release[] = parseReleases(changelog);
