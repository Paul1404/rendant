import * as v from "valibot";
import {
	DatevSettingsSchema,
	EmailSettingsSchema,
	McpSettingsSchema,
	OperatorInviteRevokeSchema,
	OperatorInviteSchema,
	OperatorMemberBanSchema,
	OperatorMemberRoleSchema,
	OperatorTenantCreateSchema,
	OperatorTenantRenameSchema,
	OperatorTenantTargetSchema,
	RolePolicyUpdateSchema,
	SumupSettingsSchema,
	TestEmailSchema,
} from "@/lib/schemas";
import { requestAuditContext } from "@/server/services/audit";
import {
	getOperatorIntegrations,
	sendOperatorTestEmail,
	testOperatorSumupConnection,
	updateOperatorDatevSettings,
	updateOperatorEmailSettings,
	updateOperatorMcpSettings,
	updateOperatorSumupSettings,
} from "@/server/services/operator-integrations";
import {
	createOperatorTenant,
	getOperatorRolePolicy,
	inviteOperatorMember,
	listOperatorInvites,
	listOperatorMembers,
	listOperatorTenants,
	renameOperatorTenant,
	revokeOperatorInvite,
	setOperatorMemberBanned,
	setOperatorMemberRole,
	updateOperatorRolePolicy,
} from "@/server/services/operators";
import { operatorOnly } from "./base";

const stamp = v.pipe(v.string(), v.isoTimestamp());

export const operators = {
	integrationSettings: operatorOnly
		.input(OperatorTenantTargetSchema)
		.handler(({ input, context }) =>
			getOperatorIntegrations(input.tenantId, context.operator),
		),
	updateEmail: operatorOnly
		.input(
			v.object({
				...OperatorTenantTargetSchema.entries,
				...EmailSettingsSchema.entries,
				expected_updated_at: stamp,
			}),
		)
		.handler(({ input, context }) =>
			updateOperatorEmailSettings(
				input,
				context.operator,
				requestAuditContext(context),
			),
		),
	updateSumup: operatorOnly
		.input(
			v.object({
				...OperatorTenantTargetSchema.entries,
				...SumupSettingsSchema.entries,
				expected_updated_at: stamp,
			}),
		)
		.handler(({ input, context }) =>
			updateOperatorSumupSettings(
				input,
				context.operator,
				requestAuditContext(context),
			),
		),
	updateDatev: operatorOnly
		.input(
			v.object({
				...OperatorTenantTargetSchema.entries,
				...DatevSettingsSchema.entries,
			}),
		)
		.handler(({ input, context }) =>
			updateOperatorDatevSettings(
				input,
				context.operator,
				requestAuditContext(context),
			),
		),
	updateMcp: operatorOnly
		.input(
			v.object({
				...OperatorTenantTargetSchema.entries,
				...McpSettingsSchema.entries,
			}),
		)
		.handler(({ input, context }) =>
			updateOperatorMcpSettings(
				input,
				context.operator,
				requestAuditContext(context),
			),
		),
	testEmail: operatorOnly
		.input(
			v.object({
				...OperatorTenantTargetSchema.entries,
				...TestEmailSchema.entries,
			}),
		)
		.handler(({ input, context }) =>
			sendOperatorTestEmail(
				input,
				context.operator,
				requestAuditContext(context),
			),
		),
	testSumup: operatorOnly
		.input(OperatorTenantTargetSchema)
		.handler(({ input, context }) =>
			testOperatorSumupConnection(
				input,
				context.operator,
				requestAuditContext(context),
			),
		),
	rolePolicy: operatorOnly
		.input(OperatorTenantTargetSchema)
		.handler(({ input, context }) =>
			getOperatorRolePolicy(input.tenantId, context.operator),
		),
	updateRolePolicy: operatorOnly
		.input(
			v.object({
				...OperatorTenantTargetSchema.entries,
				...RolePolicyUpdateSchema.entries,
			}),
		)
		.handler(({ input, context }) =>
			updateOperatorRolePolicy(
				input,
				context.operator,
				requestAuditContext(context),
			),
		),
	list: operatorOnly.handler(({ context }) =>
		listOperatorTenants(context.operator),
	),
	create: operatorOnly
		.input(OperatorTenantCreateSchema)
		.handler(({ input, context }) =>
			createOperatorTenant(
				input,
				context.operator,
				requestAuditContext(context),
			),
		),
	rename: operatorOnly
		.input(OperatorTenantRenameSchema)
		.handler(({ input, context }) =>
			renameOperatorTenant(
				input,
				context.operator,
				requestAuditContext(context),
			),
		),
	members: operatorOnly
		.input(OperatorTenantTargetSchema)
		.handler(({ input, context }) =>
			listOperatorMembers(input.tenantId, context.operator),
		),
	invites: operatorOnly
		.input(OperatorTenantTargetSchema)
		.handler(({ input, context }) =>
			listOperatorInvites(input.tenantId, context.operator),
		),
	invite: operatorOnly
		.input(OperatorInviteSchema)
		.handler(({ input, context }) =>
			inviteOperatorMember(
				input,
				context.operator,
				requestAuditContext(context),
			),
		),
	revoke: operatorOnly
		.input(OperatorInviteRevokeSchema)
		.handler(({ input, context }) =>
			revokeOperatorInvite(
				input,
				context.operator,
				requestAuditContext(context),
			),
		),
	setRole: operatorOnly
		.input(OperatorMemberRoleSchema)
		.handler(({ input, context }) =>
			setOperatorMemberRole(
				input,
				context.operator,
				requestAuditContext(context),
			),
		),
	setBanned: operatorOnly
		.input(OperatorMemberBanSchema)
		.handler(({ input, context }) =>
			setOperatorMemberBanned(
				input,
				context.operator,
				requestAuditContext(context),
			),
		),
};
