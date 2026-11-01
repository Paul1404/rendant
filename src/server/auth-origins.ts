// The dev origin is only trusted outside production. In production it would let
// a page served from the user's own machine talk to the deployed auth endpoints.
export function resolveTrustedOrigins(
	baseUrl: string | undefined,
	aliases: string | undefined,
	nodeEnv: string | undefined = process.env.NODE_ENV,
): string[] {
	const origins = new Set<string>(
		nodeEnv === "production" ? [] : ["http://localhost:3000"],
	);
	for (const origin of [baseUrl, ...(aliases ?? "").split(",")]) {
		const value = origin?.trim();
		if (!value) continue;
		let parsed: URL;
		try {
			parsed = new URL(value);
		} catch {
			throw new Error(
				"Die vertrauenswürdigen Anmeldeadressen müssen vollständige HTTP- oder HTTPS-Adressen sein",
			);
		}
		if (
			!["http:", "https:"].includes(parsed.protocol) ||
			parsed.username ||
			parsed.password ||
			parsed.pathname !== "/" ||
			parsed.search ||
			parsed.hash ||
			parsed.hostname.includes("*")
		) {
			throw new Error(
				"Vertrauenswürdige Anmeldeadressen müssen einzelne Domains ohne Platzhalter oder Pfad benennen",
			);
		}
		origins.add(parsed.origin);
	}
	return Array.from(origins);
}
