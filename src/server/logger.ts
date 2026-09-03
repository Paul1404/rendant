// Small structured logger for the server. Emits one JSON line per event in
// production (easy to ship/parse), and a readable line in development. Levels
// gate output via LOG_LEVEL; sensitive keys are redacted. Never log secrets or
// raw Postgres NOTICE chatter.

import packageJson from "../../package.json";

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<Level, number> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
};

const isProd = process.env.NODE_ENV === "production";

function threshold(): number {
	const configured = process.env.LOG_LEVEL?.toLowerCase() as Level | undefined;
	if (configured && configured in LEVEL_WEIGHT) return LEVEL_WEIGHT[configured];
	return isProd ? LEVEL_WEIGHT.info : LEVEL_WEIGHT.debug;
}

const REDACT =
	/pass|secret|token|cookie|authorization|credential|connection.?string|database.?url|private.?key|api.?key/i;

const BASE_CONTEXT: LogContext = {
	service: "rendant",
	version: packageJson.version,
	environment: process.env.NODE_ENV ?? "development",
	...(process.env.RAILWAY_DEPLOYMENT_ID
		? { deploymentId: process.env.RAILWAY_DEPLOYMENT_ID }
		: {}),
};

export type LogContext = Record<string, unknown>;

function property(value: object, key: string): unknown {
	try {
		return Reflect.get(value, key);
	} catch {
		return undefined;
	}
}

function errorDetails(value: object, depth: number): LogContext | undefined {
	const tag = Object.prototype.toString.call(value);
	const message = property(value, "message");
	const stack = property(value, "stack");
	const errorLike =
		value instanceof Error ||
		tag === "[object Error]" ||
		tag === "[object DOMException]" ||
		(typeof message === "string" && typeof stack === "string");
	if (!errorLike) return undefined;

	const details: LogContext = {};
	for (const key of ["name", "message", "stack", "code"]) {
		const item = property(value, key);
		if (typeof item === "string") {
			details[key] = redactText(item);
		} else if (typeof item === "number") {
			details[key] = item;
		}
	}
	const cause = property(value, "cause");
	if (cause !== undefined) {
		details.cause = serializeLogValue(cause, depth + 1);
	}
	return details;
}

// Key-name redaction cannot see a secret that arrives inside a string: a pg or
// S3 error message carries the connection string or endpoint in `err.message`,
// and those go out in the log line and to the external health ingest.
const SECRET_IN_TEXT: Array<[RegExp, string]> = [
	// postgres://user:password@host - keep the shape, drop the credentials
	[/\b([a-z][a-z0-9+.-]*:\/\/)[^\s:@/]+:[^\s@/]+@/gi, "$1[redacted]@"],
	// key=value and "key": "value" for the sensitive key names
	[
		/\b(pass\w*|secret\w*|token\w*|api[_-]?key|credential\w*)\b(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;)}]+)/gi,
		"$1$2[redacted]",
	],
	// AWS access key ids
	[/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, "[redacted]"],
];

export function redactText(value: string): string {
	let out = value;
	for (const [pattern, replacement] of SECRET_IN_TEXT) {
		out = out.replace(pattern, replacement);
	}
	return out;
}

export function serializeLogValue(value: unknown, depth = 0): unknown {
	if (depth > 3) return "[…]";
	if (value && typeof value === "object") {
		const details = errorDetails(value, depth);
		if (details) return details;
	}
	if (Array.isArray(value)) {
		return value.map((v) => serializeLogValue(v, depth + 1));
	}
	if (value && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			out[k] = REDACT.test(k) ? "[redacted]" : serializeLogValue(v, depth + 1);
		}
		return out;
	}
	if (typeof value === "string") return redactText(value);
	return value;
}

const COLORS: Record<Level, string> = {
	debug: "\x1b[2;37m",
	info: "\x1b[36m",
	warn: "\x1b[33m",
	error: "\x1b[31m",
};
const RESET = "\x1b[0m";

function emit(level: Level, msg: string, context?: LogContext): void {
	if (LEVEL_WEIGHT[level] < threshold()) return;
	const ctx = context ? (serializeLogValue(context) as LogContext) : undefined;
	const time = new Date().toISOString();

	if (isProd) {
		const line = JSON.stringify({ time, level, msg, ...ctx });
		if (level === "error" || level === "warn") console.error(line);
		else console.log(line);
		return;
	}

	const head = `${COLORS[level]}${level.toUpperCase().padEnd(5)}${RESET}`;
	const tail = ctx && Object.keys(ctx).length ? ` ${JSON.stringify(ctx)}` : "";
	const out = `${head} ${msg}${tail}`;
	if (level === "error" || level === "warn") console.error(out);
	else console.log(out);
}

export type Logger = {
	debug: (msg: string, context?: LogContext) => void;
	info: (msg: string, context?: LogContext) => void;
	warn: (msg: string, context?: LogContext) => void;
	error: (msg: string, context?: LogContext) => void;
	child: (bindings: LogContext) => Logger;
};

function make(base: LogContext): Logger {
	const merge = (c?: LogContext) => ({ ...base, ...c });
	return {
		debug: (m, c) => emit("debug", m, merge(c)),
		info: (m, c) => emit("info", m, merge(c)),
		warn: (m, c) => emit("warn", m, merge(c)),
		error: (m, c) => emit("error", m, merge(c)),
		child: (bindings) => make({ ...base, ...bindings }),
	};
}

export const logger = make(BASE_CONTEXT);
