import { describe, expect, it } from "vitest";
import {
	callout,
	ctaBlock,
	detailsTable,
	emailShell,
	escapeHtml,
	paragraph,
} from "@/server/services/email-template";

describe("email template", () => {
	it("renders the accessible Rendant identity without external assets", () => {
		const html = emailShell({
			preheader: "Ein neuer Eintrag ist bereit.",
			eyebrow: "Benachrichtigung",
			heading: "Neues Kassenzählprotokoll",
			blocks: [paragraph("Der Eintrag wurde gespeichert.")],
			verein: "Beispielverein e.V.",
		});

		expect(html).toContain("#0F2A22");
		expect(html).toContain("#8A6A28");
		expect(html).toContain("#F7F3EA");
		expect(html).toContain('role="img" aria-label="Rendant Registermarke"');
		expect(html).toContain("Finanzverwaltung f&uuml;r Vereine");
		expect(html).toContain("ERFASSEN. AUSWERTEN. NACHWEISEN.");
		expect(html).not.toContain("#0F4435");
		expect(html).not.toContain("#C49A4E");
		expect(html).not.toMatch(/<(?:img|link)\b/i);
		expect(html).not.toMatch(/url\(/i);
	});

	it("escapes shell content and preserves trusted content blocks", () => {
		const html = emailShell({
			preheader: '<Vorschau & "mehr">',
			eyebrow: "Einladung <offen>",
			heading: "Willkommen & los",
			blocks: [paragraph("Text mit <strong>Hervorhebung</strong>.")],
			verein: "Verein & Partner",
		});

		expect(html).toContain("&lt;Vorschau &amp; &quot;mehr&quot;&gt;");
		expect(html).toContain("Einladung &lt;offen&gt;");
		expect(html).toContain("Willkommen &amp; los");
		expect(html).toContain("Verein &amp; Partner");
		expect(html).toContain("Text mit <strong>Hervorhebung</strong>.");
	});

	it("keeps details, callouts and CTAs table-first and escaped", () => {
		const details = detailsTable([["Rolle <intern>", "Kassier & Vorstand"]]);
		const note = callout("Hinweis & Schutz", "Nur <strong>angemeldet</strong> sichtbar.");
		const cta = ctaBlock(
			'https://example.test/?next="konto"&role=admin',
			"Konto <anlegen>",
			"7 Tage & einmalig",
		);

		expect(details).toContain("Rolle &lt;intern&gt;");
		expect(details).toContain("Kassier &amp; Vorstand");
		expect(note).toContain("Hinweis &amp; Schutz");
		expect(note).toContain("Nur <strong>angemeldet</strong> sichtbar.");
		expect(note).toContain("#8A6A28");
		expect(cta).toContain("https://example.test/?next=&quot;konto&quot;&amp;role=admin");
		expect(cta).toContain("Konto &lt;anlegen&gt;");
		expect(cta).toContain("7 Tage &amp; einmalig");
		expect(cta).toContain("<!--[if mso]>");
		expect(escapeHtml("'<&>\"")).toBe("&#39;&lt;&amp;&gt;&quot;");
	});
});
