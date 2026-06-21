// The club this deployment runs for. SVUFO owns all visual branding; the club
// is surfaced only as a quiet "läuft für ..." attribution and in the PDF header.
// The name is configured in-app under Einstellungen (see the settings service),
// falling back to the VEREINSNAME env var. The resolved value reaches the
// browser through the root route loader (see __root.tsx).

export type Branding = {
	vereinsname: string;
};
