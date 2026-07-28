export function resolveTrustedOrigins(
	baseUrl: string | undefined,
	aliases: string | undefined,
): string[] {
	const origins = new Set<string>(["http://localhost:3000"]);
	for (const origin of [baseUrl, ...(aliases ?? "").split(",")]) {
		const normalized = origin?.trim().replace(/\/$/, "");
		if (normalized) origins.add(normalized);
	}
	return Array.from(origins);
}
