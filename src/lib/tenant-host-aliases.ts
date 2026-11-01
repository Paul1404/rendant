// These retired addresses retain their club boundary for open tabs, downloads
// and POST requests. New aliases are public configuration, never wildcards.
export const LEGACY_TENANT_HOST_ALIASES: Readonly<Record<string, string>> =
	Object.freeze({
		"rendant.sv-untereuerheim.de": "svu",
		"svufo.sv-untereuerheim.de": "svu",
		"ssv-gaedheim.rendant.pdcd.net": "ssv-gaedheim",
	});

export function configuredTenantHostAliases(
	raw: string | undefined,
): ReadonlyMap<string, string> {
	const aliases = new Map(Object.entries(LEGACY_TENANT_HOST_ALIASES));
	if (!raw?.trim()) return aliases;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error(
			"TENANT_HOST_ALIASES_JSON muss eine Zuordnung von Domains zu Vereinskennungen enthalten",
		);
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
		throw new Error("TENANT_HOST_ALIASES_JSON muss ein JSON-Objekt sein");
	for (const [host, value] of Object.entries(parsed)) {
		const hostname = host.toLowerCase().replace(/\.$/, "");
		if (
			!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
				hostname,
			) ||
			typeof value !== "string" ||
			!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)
		)
			throw new Error(
				"Vereinsadressen müssen einzelne Domains und gültige Vereinskennungen benennen",
			);
		const existing = aliases.get(hostname);
		if (existing && existing !== value)
			throw new Error(
				"Eine bestehende Vereinsadresse darf keinem anderen Verein zugeordnet werden",
			);
		aliases.set(hostname, value);
	}
	return aliases;
}

function normalizedBaseDomain(baseDomain: string | undefined): string | null {
	if (!baseDomain?.trim()) return null;
	const base = baseDomain.trim().toLowerCase().replace(/\.$/, "");
	if (
		!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
			base,
		)
	)
		throw new Error("TENANT_BASE_DOMAIN ist keine gültige Domain");
	return base;
}

/** Preferred addresses can use a public vanity label without changing the
 * stable database slug. Each exact hostname still belongs to only one club. */
export function configuredTenantCanonicalHosts(
	raw: string | undefined,
	baseDomain: string | undefined,
): ReadonlyMap<string, string> {
	const base = normalizedBaseDomain(baseDomain);
	const canonical = new Map<string, string>();
	if (!raw?.trim()) return canonical;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error(
			"TENANT_CANONICAL_HOSTS_JSON muss eine Zuordnung von Vereinskennungen zu Domains enthalten",
		);
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
		throw new Error("TENANT_CANONICAL_HOSTS_JSON muss ein JSON-Objekt sein");
	const owners = new Map<string, string>();
	for (const [slug, value] of Object.entries(parsed)) {
		if (
			!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug) ||
			typeof value !== "string"
		)
			throw new Error(
				"Bevorzugte Vereinsadressen brauchen gültige Vereinskennungen und einzelne Domains",
			);
		const hostname = value.toLowerCase().replace(/\.$/, "");
		if (
			!base ||
			!hostname.endsWith(`.${base}`) ||
			!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
				hostname.slice(0, -base.length - 1),
			)
		)
			throw new Error(
				"Bevorzugte Vereinsadressen müssen einzelne Subdomains der Rendant-Domain sein",
			);
		const owner = owners.get(hostname);
		if (owner && owner !== slug)
			throw new Error(
				"Eine bevorzugte Vereinsadresse darf nur einem Verein gehören",
			);
		const historicalOwner = LEGACY_TENANT_HOST_ALIASES[hostname];
		if (historicalOwner && historicalOwner !== slug)
			throw new Error(
				"Eine bestehende Vereinsadresse darf keinem anderen Verein zugeordnet werden",
			);
		owners.set(hostname, slug);
		canonical.set(slug, hostname);
	}
	return canonical;
}

export function tenantCanonicalHost(
	slug: string,
	baseDomain: string | undefined,
	raw: string | undefined,
): string | null {
	if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug))
		throw new Error("Ungültige Vereinskennung");
	const canonical = configuredTenantCanonicalHosts(raw, baseDomain);
	const preferred = canonical.get(slug);
	if (preferred) return preferred;
	const base = normalizedBaseDomain(baseDomain);
	return base ? `${slug}.${base}` : null;
}

/** One validated reverse map serves both hostname authorization and redirects.
 * Alias configuration cannot reassign a canonical vanity host to another club. */
export function configuredTenantHostBindings(
	aliasesRaw: string | undefined,
	canonicalRaw: string | undefined,
	baseDomain: string | undefined,
): ReadonlyMap<string, string> {
	const bindings = new Map(configuredTenantHostAliases(aliasesRaw));
	const canonical = configuredTenantCanonicalHosts(canonicalRaw, baseDomain);
	const base = normalizedBaseDomain(baseDomain);
	for (const [slug, hostname] of canonical) {
		const owner = bindings.get(hostname);
		if (owner && owner !== slug)
			throw new Error(
				"Eine bevorzugte Vereinsadresse widerspricht ihrer bisherigen Vereinszuordnung",
			);
		bindings.set(hostname, slug);
	}
	if (base) {
		for (const [hostname, slug] of bindings) {
			if (hostname === base)
				throw new Error(
					"Die gemeinsame Rendant-Adresse darf keinem einzelnen Verein zugeordnet werden",
				);
			if (
				hostname.endsWith(`.${base}`) &&
				hostname !== `${slug}.${base}` &&
				hostname !== canonical.get(slug)
			)
				throw new Error(
					"Eine Vereinsadresse darf nicht die Kennung eines anderen Vereins verwenden",
				);
		}
	}
	return bindings;
}
