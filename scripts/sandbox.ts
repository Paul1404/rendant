#!/usr/bin/env bun
/**
 * Launch a completely disposable Rendant instance for interactive browser QA.
 *
 * PostgreSQL runs in a uniquely named, tmpfs-backed Docker container. S3 uses
 * a tiny in-process, memory-only HTTP implementation that supports exactly the
 * object operations Rendant needs. Ctrl-C removes the database and every object.
 */
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

const DEFAULT_PORT = 3100;
const POSTGRES_IMAGE = "postgres:17.10-alpine3.23";
const POSTGRES_USER = "rendant_sandbox";
const POSTGRES_DATABASE = "rendant_sandbox";
const SANDBOX_LABEL = "local.rendant.sandbox=1";
const S3_BUCKET = "rendant-sandbox";

export type SandboxCredentials = {
	name: string;
	email: string;
	password: string;
	authSecret: string;
	databasePassword: string;
	objectStoreSecret: string;
};

type ObjectStoreResult = {
	status: number;
	headers?: Record<string, string>;
	body?: Buffer | string;
};

export function createSandboxCredentials(): SandboxCredentials {
	const token = randomBytes(6).toString("hex");
	return {
		name: "Sandbox Admin",
		email: `sandbox-${token}@example.test`,
		password: `Sandbox-${randomBytes(15).toString("base64url")}`,
		authSecret: randomBytes(32).toString("hex"),
		databasePassword: randomBytes(24).toString("base64url"),
		objectStoreSecret: randomBytes(24).toString("base64url"),
	};
}

export function sandboxPort(raw: string | undefined): number {
	if (raw === undefined || raw === "") return DEFAULT_PORT;
	const port = Number(raw);
	if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
		throw new Error(
			"SANDBOX_PORT muss eine ganze Zahl zwischen 1024 und 65535 sein.",
		);
	}
	return port;
}

export function parsePublishedPort(output: string): number {
	const match = output.trim().match(/:(\d+)$/);
	const port = Number(match?.[1]);
	if (!Number.isInteger(port) || port < 1 || port > 65_535) {
		throw new Error(`Docker-Port konnte nicht gelesen werden: ${output.trim()}`);
	}
	return port;
}

function xmlEscape(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

function objectKey(url: URL): string | undefined {
	const parts = url.pathname.split("/").filter(Boolean);
	if (parts[0] !== S3_BUCKET || parts.length < 2) return undefined;
	return decodeURIComponent(parts.slice(1).join("/"));
}

export function objectStoreResponse(
	method: string,
	requestUrl: string,
	body: Buffer,
	objects: Map<string, Buffer>,
): ObjectStoreResult {
	const url = new URL(requestUrl, "http://127.0.0.1");
	const bucketPath = url.pathname === `/${S3_BUCKET}` || url.pathname === `/${S3_BUCKET}/`;

	if (method === "HEAD" && bucketPath) return { status: 200 };
	if (method === "GET" && bucketPath && url.searchParams.get("list-type") === "2") {
		const prefix = url.searchParams.get("prefix") ?? "";
		const entries = [...objects.entries()].filter(([key]) => key.startsWith(prefix));
		const contents = entries
			.map(
				([key, value]) =>
					`<Contents><Key>${xmlEscape(key)}</Key><Size>${value.byteLength}</Size><ETag>&quot;sandbox&quot;</ETag><StorageClass>STANDARD</StorageClass></Contents>`,
			)
			.join("");
		return {
			status: 200,
			headers: { "content-type": "application/xml" },
			body: `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>${S3_BUCKET}</Name><Prefix>${xmlEscape(prefix)}</Prefix><KeyCount>${entries.length}</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated>${contents}</ListBucketResult>`,
		};
	}

	const key = objectKey(url);
	if (!key) return { status: 404 };
	if (method === "PUT") {
		objects.set(key, Buffer.from(body));
		return { status: 200, headers: { etag: '"sandbox"' } };
	}
	if (method === "GET") {
		const object = objects.get(key);
		if (!object) {
			return {
				status: 404,
				headers: { "content-type": "application/xml" },
				body: "<Error><Code>NoSuchKey</Code><Message>Object not found</Message></Error>",
			};
		}
		return {
			status: 200,
			headers: {
				"content-length": String(object.byteLength),
				"content-type": "application/pdf",
				etag: '"sandbox"',
			},
			body: object,
		};
	}
	if (method === "DELETE") {
		objects.delete(key);
		return { status: 204 };
	}
	return { status: 405 };
}

async function readRequestBody(request: IncomingMessage): Promise<Buffer> {
	const chunks: Buffer[] = [];
	for await (const chunk of request) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
}

function writeResponse(response: ServerResponse, result: ObjectStoreResult): void {
	response.writeHead(result.status, {
		"x-amz-request-id": "rendant-sandbox",
		...result.headers,
	});
	response.end(result.body);
}

async function startObjectStore(): Promise<{ server: Server; endpoint: string }> {
	const objects = new Map<string, Buffer>();
	const server = createServer(async (request, response) => {
		try {
			const host = request.headers.host ?? "127.0.0.1";
			const body = await readRequestBody(request);
			writeResponse(
				response,
				objectStoreResponse(
					request.method ?? "GET",
					`http://${host}${request.url ?? "/"}`,
					body,
					objects,
				),
			);
		} catch {
			writeResponse(response, { status: 500 });
		}
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const address = server.address() as AddressInfo;
	return { server, endpoint: `http://127.0.0.1:${address.port}` };
}

function closeServer(server: Server): Promise<void> {
	return new Promise((resolve) => server.close(() => resolve()));
}

function run(
	command: string,
	args: string[],
	options: { env?: NodeJS.ProcessEnv; capture?: boolean; allowFailure?: boolean } = {},
): string {
	const result = spawnSync(command, args, {
		cwd: process.cwd(),
		env: options.env ?? process.env,
		encoding: "utf8",
		stdio: options.capture ? "pipe" : "inherit",
	});
	if (result.error) throw result.error;
	if (result.status !== 0 && !options.allowFailure) {
		const detail = options.capture ? result.stderr.trim() : "";
		throw new Error(
			`${command} ${args.join(" ")} ist mit Status ${result.status ?? 1} beendet.${detail ? ` ${detail}` : ""}`,
		);
	}
	return options.capture ? result.stdout : "";
}

function sandboxContainerIds(): string[] {
	const output = run(
		"docker",
		["ps", "-aq", "--filter", `label=${SANDBOX_LABEL}`],
		{ capture: true },
	);
	return output.split(/\s+/).filter(Boolean);
}

export function removeSandboxContainers(allowFailure = false): void {
	try {
		const ids = sandboxContainerIds();
		if (ids.length > 0) {
			run("docker", ["rm", "-f", ...ids], { capture: true });
		}
	} catch (error) {
		if (!allowFailure) throw error;
		console.warn(
			`[sandbox] Container-Aufräumen übersprungen: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

async function waitForPostgres(containerName: string): Promise<void> {
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		const result = spawnSync(
			"docker",
			[
				"exec",
				containerName,
				"pg_isready",
				"-U",
				POSTGRES_USER,
				"-d",
				POSTGRES_DATABASE,
			],
			{ stdio: "ignore" },
		);
		if (result.status === 0) return;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error("Die Sandbox-Datenbank wurde nicht rechtzeitig bereit.");
}

async function waitUntilReady(baseUrl: string, server: ChildProcess): Promise<void> {
	const deadline = Date.now() + 120_000;
	while (Date.now() < deadline) {
		if (server.exitCode !== null) {
			throw new Error(
				`Sandbox-Server wurde vorzeitig mit Status ${server.exitCode} beendet.`,
			);
		}
		try {
			const response = await fetch(`${baseUrl}/api/health`);
			if (response.ok) return;
		} catch {
			// Vite is still starting or compiling the first request.
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`Sandbox-Server unter ${baseUrl} wurde nicht rechtzeitig bereit.`);
}

function waitForExit(server: ChildProcess): Promise<number> {
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.once("exit", (code) => resolve(code ?? 0));
	});
}

export async function main(): Promise<void> {
	const port = sandboxPort(process.env.SANDBOX_PORT);
	const baseUrl = `http://127.0.0.1:${port}`;
	const credentials = createSandboxCredentials();
	const containerName = `rendant-sandbox-${randomBytes(6).toString("hex")}`;
	let appServer: ChildProcess | undefined;
	let objectStore: Awaited<ReturnType<typeof startObjectStore>> | undefined;
	let stopRequested = false;

	const requestStop = () => {
		stopRequested = true;
		appServer?.kill("SIGTERM");
	};
	process.once("SIGINT", requestStop);
	process.once("SIGTERM", requestStop);

	try {
		console.log("[sandbox] Docker prüfen und alte Sandbox entfernen…");
		run("docker", ["info"], { capture: true });
		removeSandboxContainers();
		if (stopRequested) return;

		console.log("[sandbox] temporäre PostgreSQL-Datenbank starten…");
		run(
			"docker",
			[
				"run",
				"--detach",
				"--rm",
				"--name",
				containerName,
				"--label",
				SANDBOX_LABEL,
				"--publish",
				"127.0.0.1::5432",
				"--tmpfs",
				"/var/lib/postgresql/data:rw,noexec,nosuid,size=512m",
				"--env",
				`POSTGRES_USER=${POSTGRES_USER}`,
				"--env",
				`POSTGRES_DB=${POSTGRES_DATABASE}`,
				"--env",
				`POSTGRES_PASSWORD=${credentials.databasePassword}`,
				POSTGRES_IMAGE,
			],
			{ capture: true },
		);
		await waitForPostgres(containerName);
		const databasePort = parsePublishedPort(
			run("docker", ["port", containerName, "5432/tcp"], { capture: true }),
		);

		console.log("[sandbox] temporären Objektspeicher starten…");
		objectStore = await startObjectStore();
		const sandboxEnv: NodeJS.ProcessEnv = {
			...process.env,
			NODE_ENV: "development",
			PORT: String(port),
			DATABASE_URL: `postgres://${POSTGRES_USER}:${credentials.databasePassword}@127.0.0.1:${databasePort}/${POSTGRES_DATABASE}`,
			BETTER_AUTH_SECRET: credentials.authSecret,
			BETTER_AUTH_URL: baseUrl,
			ADMIN_EMAIL: credentials.email,
			ADMIN_PASSWORD: credentials.password,
			ADMIN_NAME: credentials.name,
			AWS_ACCESS_KEY_ID: "rendant-sandbox",
			AWS_SECRET_ACCESS_KEY: credentials.objectStoreSecret,
			AWS_DEFAULT_REGION: "us-east-1",
			AWS_ENDPOINT_URL_S3: objectStore.endpoint,
			S3_BUCKET_NAME: S3_BUCKET,
			VEREINSNAME: "SV Untereuerheim Sandbox",
			LFIO_INGEST_TOKEN: "",
		};

		console.log("[sandbox] Migrationen anwenden und Admin anlegen…");
		run("bun", ["src/server/db/migrate.ts"], { env: sandboxEnv });
		if (stopRequested) return;

		console.log("[sandbox] App starten…");
		appServer = spawn(
			"bunx",
			[
				"vite",
				"dev",
				"--host",
				"127.0.0.1",
				"--port",
				String(port),
				"--strictPort",
			],
			{ cwd: process.cwd(), env: sandboxEnv, stdio: "inherit" },
		);
		await waitUntilReady(baseUrl, appServer);

		console.log("\nRendant Sandbox ist bereit");
		console.log(`URL:      ${baseUrl}/login`);
		console.log(`E-Mail:   ${credentials.email}`);
		console.log(`Passwort: ${credentials.password}`);
		console.log("\nMit Ctrl-C beenden. Danach werden alle Sandbox-Daten gelöscht.\n");

		const exitCode = await waitForExit(appServer);
		if (!stopRequested && exitCode !== 0) {
			throw new Error(`Sandbox-Server ist mit Status ${exitCode} beendet.`);
		}
	} finally {
		process.removeListener("SIGINT", requestStop);
		process.removeListener("SIGTERM", requestStop);
		if (appServer?.exitCode === null) appServer.kill("SIGTERM");
		console.log("[sandbox] temporäre Daten entfernen…");
		if (objectStore) await closeServer(objectStore.server);
		run("docker", ["stop", "--time", "2", containerName], {
			capture: true,
			allowFailure: true,
		});
		console.log("[sandbox] beendet");
	}
}

if (import.meta.main) {
	main().catch((error) => {
		console.error(
			`[sandbox] ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exitCode = 1;
	});
}
