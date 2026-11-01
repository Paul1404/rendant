function normalizedHostname(value: string): string | null {
	if (!value || /[\s,@/\\?#]/.test(value)) return null;
	try {
		return new URL(`https://${value}`).hostname
			.toLowerCase()
			.replace(/\.$/, "");
	} catch {
		return null;
	}
}

export function configuredOperatorHost(): string | null {
	const configured = process.env.TENANT_ADMIN_HOST?.trim();
	if (!configured) return null;
	const hostname = normalizedHostname(configured);
	if (
		!hostname ||
		hostname !== configured.toLowerCase().replace(/\.$/, "") ||
		!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
			hostname,
		)
	)
		throw new Error(
			"TENANT_ADMIN_HOST muss eine einzelne Domain ohne Protokoll oder Port benennen",
		);
	return hostname;
}

export function isOperatorHost(headers: Headers): boolean {
	const expected = configuredOperatorHost();
	return (
		expected !== null &&
		normalizedHostname(headers.get("host") ?? "") === expected
	);
}

export function platformAdminEmailAllowed(email: string): boolean {
	const configured =
		process.env.PLATFORM_ADMIN_EMAILS?.split(",")
			.map((entry) => entry.trim().toLowerCase())
			.filter(Boolean) ?? [];
	if (configured.some((entry) => !/^[^\s@*]+@[^\s@*]+\.[^\s@*]+$/.test(entry)))
		throw new Error(
			"PLATFORM_ADMIN_EMAILS muss vollständige E-Mail-Adressen ohne Platzhalter enthalten",
		);
	return configured.includes(email.trim().toLowerCase());
}
