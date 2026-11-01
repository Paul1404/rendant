import {
	OperatorInviteRevokeSchema,
	OperatorInviteSchema,
	OperatorMemberBanSchema,
	OperatorMemberRoleSchema,
	OperatorTenantCreateSchema,
	OperatorTenantRenameSchema,
	OperatorTenantTargetSchema,
} from "@/lib/schemas";
import { requestAuditContext } from "@/server/services/audit";
import {
	createOperatorTenant,
	inviteOperatorMember,
	listOperatorInvites,
	listOperatorMembers,
	listOperatorTenants,
	renameOperatorTenant,
	revokeOperatorInvite,
	setOperatorMemberBanned,
	setOperatorMemberRole,
} from "@/server/services/operators";
import { operatorOnly } from "./base";

export const operators = {
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
