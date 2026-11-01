import { sql } from "drizzle-orm";
import {
	bigserial,
	boolean,
	check,
	index,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

// The control plane is global. Business queries use a restricted PostgreSQL
// role with no access to these tables; authorized membership helpers use the
// separate global database handle and always scope membership writes.
export const tenants = pgTable(
	"tenants",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		slug: text("slug").notNull().unique(),
		name: text("name").notNull(),
		created_at: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		check("tenants_slug_check", sql`${t.slug} ~ '^[a-z0-9][a-z0-9-]{0,62}$'`),
		check("tenants_name_check", sql`length(trim(${t.name})) BETWEEN 1 AND 120`),
	],
);

export const memberships = pgTable(
	"tenant_memberships",
	{
		tenant_id: uuid("tenant_id")
			.notNull()
			.references(() => tenants.id, { onDelete: "restrict" }),
		user_id: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: text("role").$type<"user" | "admin">().notNull().default("user"),
		banned: boolean("banned").notNull().default(false),
		notify_protokoll: boolean("notify_protokoll").notNull().default(true),
		created_at: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updated_at: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		primaryKey({ columns: [t.tenant_id, t.user_id] }),
		index("tenant_memberships_user_idx").on(t.user_id),
		check("tenant_memberships_role_check", sql`${t.role} IN ('user', 'admin')`),
	],
);

export { memberships as tenantMemberships };

// Authentication failures have no trustworthy tenant context. Keeping these
// events global prevents an unrelated club from learning who tried to sign in.
export const authSecurityEvents = pgTable(
	"auth_security_events",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		event_at: timestamp("event_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		category: text("category").notNull().default("auth"),
		action: text("action").notNull(),
		success: boolean("success").notNull().default(true),
		actor_user_id: text("actor_user_id"),
		actor_email: text("actor_email"),
		actor_name: text("actor_name"),
		actor_role: text("actor_role"),
		subject_type: text("subject_type"),
		subject_id: text("subject_id"),
		subject_label: text("subject_label"),
		request_id: uuid("request_id").notNull().defaultRandom(),
		ip_address: text("ip_address"),
		user_agent: text("user_agent"),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
	},
	(t) => [index("auth_security_events_event_at_idx").on(t.event_at)],
);
