// Small structured logger for the server. Emits one JSON line per event in
// production (easy to ship/parse), and a readable line in development. Levels
// gate output via LOG_LEVEL; sensitive keys are redacted. Never log secrets or
// raw Postgres NOTICE chatter.

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

const REDACT = /pass|secret|token|cookie|authorization|apikey|api_key|key$/i;

export type LogContext = Record<string, unknown>;

function redact(value: unknown, depth = 0): unknown {
	if (value instanceof Error) {
		return { name: value.name, message: value.message, stack: value.stack };
	}
	if (Array.isArray(value)) {
		return depth > 3 ? "[…]" : value.map((v) => redact(v, depth + 1));
	}
	if (value && typeof value === "object") {
		if (depth > 3) return "[…]";
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			out[k] = REDACT.test(k) ? "[redacted]" : redact(v, depth + 1);
		}
		return out;
	}
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
	const ctx = context ? (redact(context) as LogContext) : undefined;
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

export const logger = make({});
