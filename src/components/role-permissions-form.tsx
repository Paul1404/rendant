import { ORPCError } from "@orpc/client";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Fragment, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { orpc, orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";
import {
	CLUB_ROLES,
	type Permission,
	type RolePolicy,
	roleLabel,
} from "@/lib/permissions";

type CatalogEntry = {
	key: Permission;
	label: string;
	group: string;
	requires: readonly Permission[];
};
type PolicyResponse = Awaited<
	ReturnType<typeof orpcClient.operators.rolePolicy>
>;
type FormValues = { version: number; roles: RolePolicy };

/** Apply the visible checkbox action together with its required read scopes. */
export function changePermissionSelection(
	current: readonly Permission[],
	permission: Permission,
	enabled: boolean,
	catalog: readonly CatalogEntry[],
): Permission[] {
	const selected = new Set(current);
	if (enabled) {
		selected.add(permission);
		let changed = true;
		while (changed) {
			changed = false;
			for (const entry of catalog) {
				if (!selected.has(entry.key)) continue;
				for (const dependency of entry.requires) {
					if (!selected.has(dependency)) {
						selected.add(dependency);
						changed = true;
					}
				}
			}
		}
	} else {
		selected.delete(permission);
		let changed = true;
		while (changed) {
			changed = false;
			for (const entry of catalog) {
				if (
					selected.has(entry.key) &&
					entry.requires.some((dependency) => !selected.has(dependency))
				) {
					selected.delete(entry.key);
					changed = true;
				}
			}
		}
	}
	return catalog
		.filter((entry) => selected.has(entry.key))
		.map((entry) => entry.key);
}

function formValues(policy: PolicyResponse): FormValues {
	return {
		version: policy.version,
		roles: {
			user: [...policy.roles.user],
			admin: [...policy.roles.admin],
			board: [...policy.roles.board],
		},
	};
}

export function RolePermissionsForm({ tenantId }: { tenantId: string }) {
	const policy = useQuery(
		orpc.operators.rolePolicy.queryOptions({ input: { tenantId } }),
	);
	if (policy.isPending)
		return (
			<p role="status" className="text-sm text-muted-foreground">
				Berechtigungen werden geladen.
			</p>
		);
	if (policy.error)
		return (
			<div role="alert" className="space-y-3 text-sm">
				<p>
					{orpcMessage(
						policy.error,
						"Berechtigungen konnten nicht geladen werden.",
					)}
				</p>
				<Button
					variant="outline"
					size="sm"
					onClick={() => void policy.refetch()}
				>
					Erneut laden
				</Button>
			</div>
		);
	return (
		<RolePolicyEditor key={tenantId} tenantId={tenantId} policy={policy.data} />
	);
}

export function RolePolicyEditor({
	policy,
	tenantId,
}: {
	policy: PolicyResponse;
	tenantId: string;
}) {
	const queryClient = useQueryClient();
	const router = useRouter();
	// This is the form's initial revision, not another live server-state cache.
	// Background reads must never silently overwrite an unsaved permissions draft.
	const initialValues = useRef(formValues(policy));
	const [announcement, setAnnouncement] = useState("");
	const update = useMutation({
		mutationFn: (value: FormValues) =>
			orpcClient.operators.updateRolePolicy({ tenantId, ...value }),
	});
	const form = useForm({
		defaultValues: initialValues.current,
		onSubmit: async ({ value }) => {
			try {
				const saved = await update.mutateAsync(value);
				resetDraft(saved);
				queryClient.setQueryData(
					orpc.operators.rolePolicy.queryOptions({ input: { tenantId } })
						.queryKey,
					saved,
				);
				await queryClient.invalidateQueries();
				await router.invalidate();
				setAnnouncement("");
				toast.success("Berechtigungen gespeichert.");
			} catch (error) {
				toast.error(
					orpcMessage(
						error,
						"Berechtigungen konnten nicht gespeichert werden.",
					),
				);
				if (error instanceof ORPCError && error.code === "CONFLICT")
					await queryClient.invalidateQueries({
						queryKey: orpc.operators.rolePolicy.queryOptions({
							input: { tenantId },
						}).queryKey,
					});
			}
		},
	});
	function resetDraft(nextPolicy: PolicyResponse) {
		// TanStack Form also reads this option on subsequent renders. Updating only
		// FormApi would let its old, untouched default values undo the reset.
		initialValues.current = formValues(nextPolicy);
		form.reset(initialValues.current);
	}
	const groups = [...new Set(policy.permissions.map((entry) => entry.group))];
	return (
		<form
			className="space-y-4"
			onSubmit={(event) => {
				event.preventDefault();
				void form.handleSubmit();
			}}
		>
			<p className="max-w-3xl text-sm text-muted-foreground">
				Die Rechte gelten für alle Personen mit dieser Rolle in diesem Verein.
				Vorstand hat zunächst alle hier aufgeführten Rechte im eigenen Verein.
				Die Rolle Admin bleibt zusätzlich geschützt. Du kannst die Rechte hier
				anpassen.
			</p>
			<p className="max-w-3xl text-sm text-muted-foreground">
				Schreibrechte aktivieren die nötigen Leserechte mit. Wenn du ein
				Leserecht entfernst, werden davon abhängige Rechte ebenfalls entfernt.
			</p>
			<p id="role-policy-lock-note" className="text-xs text-muted-foreground">
				Die Benutzerverwaltung bleibt für Admin geschützt, damit sich der Verein
				nicht aussperrt.
			</p>
			<form.Subscribe selector={(state) => state.values.version}>
				{(version) =>
					policy.version !== version ? (
						<div
							role="alert"
							className="space-y-2 rounded-lg border border-amber-500/40 p-3 text-sm"
						>
							<p>
								Die Berechtigungen wurden zwischenzeitlich geändert. Neu laden
								verwirft deine noch nicht gespeicherten Eingaben.
							</p>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => {
									resetDraft(policy);
									setAnnouncement("");
								}}
							>
								Aktuellen Stand übernehmen
							</Button>
						</div>
					) : null
				}
			</form.Subscribe>
			<form.Subscribe selector={(state) => state.isSubmitting}>
				{(saving) => (
					<fieldset disabled={saving} className="min-w-0">
						<legend className="sr-only">Berechtigungen je Rolle</legend>
						<div className="rounded-lg border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="whitespace-normal">
											Berechtigung
										</TableHead>
										{CLUB_ROLES.map((role) => (
											<TableHead
												key={role}
												className="px-2 text-center text-xs"
											>
												{roleLabel(role)}
											</TableHead>
										))}
									</TableRow>
								</TableHeader>
								<TableBody>
									{groups.map((group) => (
										<Fragment key={group}>
											<TableRow>
												<TableCell
													colSpan={4}
													className="bg-muted/40 py-2 text-xs font-semibold"
												>
													{group}
												</TableCell>
											</TableRow>
											{policy.permissions
												.filter((entry) => entry.group === group)
												.map((permission) => (
													<TableRow key={permission.key}>
														<TableCell className="max-w-sm whitespace-normal [overflow-wrap:anywhere]">
															{permission.label}
														</TableCell>
														{CLUB_ROLES.map((role) => (
															<TableCell
																key={role}
																className="px-2 text-center text-xs"
															>
																<form.Field name={`roles.${role}`}>
																	{(field) => {
																		const locked = policy.locked[role].includes(
																			permission.key,
																		);
																		return (
																			<input
																				type="checkbox"
																				className="h-4 w-4 accent-primary disabled:opacity-60"
																				checked={field.state.value.includes(
																					permission.key,
																				)}
																				disabled={locked}
																				aria-label={`${roleLabel(role)}: ${permission.label}`}
																				aria-describedby={
																					locked
																						? "role-policy-lock-note"
																						: undefined
																				}
																				title={
																					locked
																						? "Die Rolle Admin ist geschützt."
																						: undefined
																				}
																				onChange={(event) => {
																					const next =
																						changePermissionSelection(
																							field.state.value,
																							permission.key,
																							event.target.checked,
																							policy.permissions,
																						);
																					const additions = next.filter(
																						(key) =>
																							!field.state.value.includes(
																								key,
																							) && key !== permission.key,
																					);
																					const removals =
																						field.state.value.filter(
																							(key) =>
																								!next.includes(key) &&
																								key !== permission.key,
																						);
																					field.handleChange(next);
																					const related = event.target.checked
																						? additions
																						: removals;
																					setAnnouncement(
																						related.length
																							? `Für ${roleLabel(role)} ${event.target.checked ? "zusätzlich aktiviert" : "ebenfalls entfernt"}: ${policy.permissions
																									.filter((entry) =>
																										related.includes(entry.key),
																									)
																									.map((entry) => entry.label)
																									.join(", ")}.`
																							: "",
																					);
																				}}
																			/>
																		);
																	}}
																</form.Field>
															</TableCell>
														))}
													</TableRow>
												))}
										</Fragment>
									))}
								</TableBody>
							</Table>
						</div>
					</fieldset>
				)}
			</form.Subscribe>
			<p className="text-sm text-muted-foreground" aria-live="polite">
				{announcement}
			</p>
			<form.Subscribe
				selector={(state) => ({
					dirty: state.isDirty,
					saving: state.isSubmitting,
				})}
			>
				{({ dirty, saving }) => (
					<div className="flex flex-wrap gap-3">
						<Button type="submit" disabled={!dirty || saving}>
							{saving && (
								<Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
							)}
							{saving ? "Wird gespeichert…" : "Berechtigungen speichern"}
						</Button>
						<Button
							type="button"
							variant="outline"
							disabled={!dirty || saving}
							onClick={() => {
								resetDraft(policy);
								setAnnouncement("");
							}}
						>
							Verwerfen
						</Button>
					</div>
				)}
			</form.Subscribe>
		</form>
	);
}
