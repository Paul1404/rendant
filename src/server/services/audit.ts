import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import {
	type AuditCategory,
	type AuditEventRow,
	sanitizeAuditMetadata,
} from "@/lib/audit";
import type { DbOrTx } from "@/server/db";
import { db } from "@/server/db";
import { auditEvents } from "@/server/db/schema";
import { logger } from "@/server/logger";
import { ilikeContains } from "@/server/services/search-pattern";

type AuditActor = {
	id: string;
	email: string;
	name: string;
	role: string;
};

export function auditActor(user: {
	id: string;
	email: string;
	name: string;
	role?: string | null;
}): AuditActor {
	return {
		id: user.id,
		email: user.email,
		name: user.name,
		role: user.role ?? "user",
	};
}

export function auditRequest(request: Request): RecordAuditInput["request"] {
	const forwardedFor = request.headers.get("x-forwarded-for");
	const forwardedAddresses = forwardedFor
		?.split(",")
		.map((address) => address.trim())
		.filter(Boolean);
	return {
		id: request.headers.get("x-request-id"),
		ip:
			forwardedAddresses?.at(-1) ??
			request.headers.get("x-real-ip") ??
			request.headers.get("cf-connecting-ip"),
		userAgent: request.headers.get("user-agent"),
	};
}

export type RecordAuditInput = {
	category: AuditCategory;
	action: string;
	success?: boolean;
	actor?: AuditActor | null;
	actorEmail?: string | null;
	subject?: {
		type: string;
		id?: string | null;
		label?: string | null;
	};
	request?: {
		id?: string | null;
		ip?: string | null;
		userAgent?: string | null;
	};
	metadata?: Record<string, unknown>;
};

function uuidOrUndefined(value?: string | null): string | undefined {
	if (!value) return undefined;
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
		value,
	)
		? value
		: undefined;
}

export async function recordAuditEventStrict(
	database: DbOrTx,
	input: RecordAuditInput,
): Promise<void> {
	await database.insert(auditEvents).values({
		category: input.category,
		action: input.action,
		success: input.success ?? true,
		actor_user_id: input.actor?.id ?? null,
		actor_email: input.actor?.email ?? input.actorEmail ?? null,
		actor_name: input.actor?.name ?? null,
		actor_role: input.actor?.role ?? null,
		subject_type: input.subject?.type ?? null,
		subject_id: input.subject?.id ?? null,
		subject_label: input.subject?.label?.slice(0, 500) ?? null,
		request_id: uuidOrUndefined(input.request?.id),
		ip_address: input.request?.ip?.slice(0, 100) ?? null,
		user_agent: input.request?.userAgent?.slice(0, 500) ?? null,
		metadata: sanitizeAuditMetadata(input.metadata),
	});
}

export async function recordAuditEvent(input: RecordAuditInput): Promise<void> {
	try {
		await recordAuditEventStrict(db, input);
	} catch (err) {
		// Auditing must never make a completed accounting operation appear failed
		// to the user, which could trigger a duplicate retry. The server log keeps
		// this exceptional condition visible to operators.
		logger.error("Audit-Ereignis konnte nicht gespeichert werden", {
			action: input.action,
			err,
		});
	}
}

export function requestAuditContext(context: {
	headers: Headers;
	clientIp: string;
	requestId?: string;
}): RecordAuditInput["request"] {
	return {
		id: context.requestId ?? context.headers.get("x-request-id"),
		ip: context.clientIp,
		userAgent: context.headers.get("user-agent"),
	};
}

export async function listAuditEvents(opts: {
	page: number;
	pageSize: number;
	category?: string;
	query?: string;
}): Promise<{
	items: AuditEventRow[];
	total: number;
	page: number;
	pageSize: number;
}> {
	const page = Math.max(1, Math.floor(opts.page));
	const pageSize = Math.min(100, Math.max(10, Math.floor(opts.pageSize)));
	const conditions: SQL[] = [];
	if (opts.category) conditions.push(eq(auditEvents.category, opts.category));
	const query = opts.query?.trim();
	if (query) {
		const pattern = ilikeContains(query);
		const search = or(
			ilike(auditEvents.action, pattern),
			ilike(auditEvents.actor_name, pattern),
			ilike(auditEvents.actor_email, pattern),
			ilike(auditEvents.subject_label, pattern),
		);
		if (search) conditions.push(search);
	}
	const where = conditions.length > 0 ? and(...conditions) : undefined;
	const [rows, totals] = await Promise.all([
		db
			.select()
			.from(auditEvents)
			.where(where)
			.orderBy(desc(auditEvents.event_at), desc(auditEvents.id))
			.limit(pageSize)
			.offset((page - 1) * pageSize),
		db.select({ value: count() }).from(auditEvents).where(where),
	]);
	return {
		items: rows as AuditEventRow[],
		total: Number(totals[0]?.value ?? 0),
		page,
		pageSize,
	};
}
