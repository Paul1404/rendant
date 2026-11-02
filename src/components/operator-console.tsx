import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ExternalLink, Loader2, LogOut, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { BrandLockup } from "@/components/brand-lockup";
import { RolePermissionsForm } from "@/components/role-permissions-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { VersionChip } from "@/components/version-chip";
import { authClient } from "@/lib/auth-client";
import { formatDateDe } from "@/lib/date";
import { orpc, orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";
import {
	CLUB_ROLES,
	type ClubRole,
	isClubRole,
	roleLabel,
} from "@/lib/permissions";
import type { OperatorUser } from "@/lib/server-fns";

type TenantSummary = Awaited<
	ReturnType<typeof orpcClient.operators.list>
>[number];
type Member = Awaited<
	ReturnType<typeof orpcClient.operators.members>
>["members"][number];
const selectClass =
	"h-9 rounded-lg border border-input bg-background px-2 text-sm disabled:opacity-50";

async function logout() {
	await authClient.signOut();
	window.location.assign("/login");
}

function OperatorHeader() {
	return (
		<header className="border-b bg-nav text-nav-foreground">
			<div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
				<div className="flex min-w-0 items-center gap-3">
					<BrandLockup
						variant="bar"
						onDark
						caption="Vereinsverwaltung"
						className="text-nav-foreground"
					/>
				</div>
				<div className="flex items-center gap-1">
					<ThemeToggle variant="nav" />
					<Button
						variant="ghost"
						size="sm"
						onClick={() => void logout()}
						className="text-nav-foreground hover:bg-white/10 hover:text-nav-foreground"
						aria-label="Abmelden"
					>
						<LogOut className="h-4 w-4 sm:mr-1.5" />
						<span className="hidden sm:inline">Abmelden</span>
					</Button>
				</div>
			</div>
		</header>
	);
}

export function OperatorDenied() {
	return (
		<>
			<OperatorHeader />
			<main id="main-content" className="mx-auto w-full max-w-3xl px-4 py-12">
				<p className="mb-2 text-sm text-muted-foreground">Zugriff verweigert</p>
				<h1 className="font-heading text-2xl">Keine Betreiberberechtigung</h1>
				<p className="mt-3 text-sm">
					Dieses Konto darf die Vereinsverwaltung nicht öffnen. Melde dich mit
					einem freigeschalteten Betreiberkonto an.
				</p>
				<Button className="mt-6" onClick={() => void logout()}>
					Mit anderem Konto anmelden
				</Button>
			</main>
		</>
	);
}

function QueryFailure({ error, retry }: { error: unknown; retry: () => void }) {
	return (
		<div
			role="alert"
			className="rounded-lg border border-destructive/30 p-4 text-sm"
		>
			<p>{orpcMessage(error, "Daten konnten nicht geladen werden.")}</p>
			<Button variant="outline" size="sm" className="mt-3" onClick={retry}>
				Erneut laden
			</Button>
		</div>
	);
}

export function OperatorConsole({
	user,
	selectedTenantId,
	onSelect,
}: {
	user: OperatorUser;
	selectedTenantId?: string;
	onSelect: (id: string) => void;
}) {
	const [adminInviteTenantId, setAdminInviteTenantId] = useState<string | null>(
		null,
	);
	const list = useQuery(orpc.operators.list.queryOptions());
	const selected =
		list.data?.find((tenant) => tenant.id === selectedTenantId) ??
		(!selectedTenantId ? list.data?.[0] : undefined);
	return (
		<>
			<OperatorHeader />
			<main
				id="main-content"
				className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-4 py-8 sm:px-6 sm:py-10"
			>
				<div className="flex flex-wrap items-end justify-between gap-4">
					<div>
						<h1 className="font-heading text-3xl">Vereine verwalten</h1>
						<p className="mt-2 text-sm text-muted-foreground">
							Vereine, Zugänge und Einladungen. Angemeldet als {user.name}.
						</p>
					</div>
					<CreateClub
						onCreated={(id) => {
							setAdminInviteTenantId(id);
							onSelect(id);
						}}
					/>
				</div>
				{list.isPending ? (
					<p role="status" className="flex items-center gap-2 text-sm">
						<Loader2 className="h-4 w-4 animate-spin" />
						Vereine werden geladen.
					</p>
				) : list.error ? (
					<QueryFailure error={list.error} retry={() => void list.refetch()} />
				) : (
					<>
						<div className="rounded-lg border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Verein</TableHead>
										<TableHead>Adresse</TableHead>
										<TableHead>Mitglieder</TableHead>
										<TableHead>Admins</TableHead>
										<TableHead className="sticky right-0 z-10 border-l bg-background">
											<span className="sr-only">Aktionen</span>
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{list.data.map((tenant) => (
										<TableRow
											key={tenant.id}
											data-state={
												tenant.id === selected?.id ? "selected" : undefined
											}
										>
											<TableCell>
												<button
													type="button"
													className="text-left font-medium underline-offset-4 hover:underline focus-visible:underline"
													onClick={() => onSelect(tenant.id)}
													aria-pressed={tenant.id === selected?.id}
												>
													{tenant.name}
												</button>
												<div className="mt-1 font-mono text-xs text-muted-foreground">
													{tenant.slug}
												</div>
											</TableCell>
											<TableCell>
												{tenant.url ? (
													<a
														href={tenant.url}
														target="_blank"
														rel="noreferrer"
														className="inline-flex items-center gap-1.5 underline underline-offset-4"
													>
														{new URL(tenant.url).host}
														<ExternalLink className="h-3 w-3" aria-hidden />
													</a>
												) : (
													<span className="text-muted-foreground">
														Noch nicht konfiguriert
													</span>
												)}
											</TableCell>
											<TableCell>{tenant.memberCount}</TableCell>
											<TableCell>{tenant.adminCount}</TableCell>
											<TableCell className="sticky right-0 z-10 border-l bg-background">
												<Button
													variant={
														tenant.id === selected?.id ? "secondary" : "outline"
													}
													size="sm"
													onClick={() => onSelect(tenant.id)}
													aria-label={`${tenant.name} verwalten`}
												>
													Verwalten
												</Button>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
						<p className="-mt-5 text-xs text-muted-foreground">
							Die Adresse zeigt die Konfiguration. DNS und Zertifikat werden
							separat eingerichtet und hier nicht auf Erreichbarkeit geprüft.
						</p>
						{selected ? (
							<ClubDetails
								key={selected.id}
								tenant={selected}
								currentUserId={user.id}
								adminInviteRequested={adminInviteTenantId === selected.id}
								onAdminInviteHandled={() => setAdminInviteTenantId(null)}
							/>
						) : (
							<p className="text-sm text-muted-foreground">
								{selectedTenantId
									? "Dieser Verein wurde nicht gefunden. Wähle einen Verein aus der Liste."
									: "Noch kein Verein angelegt."}
							</p>
						)}
					</>
				)}
			</main>
			<footer className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-5 text-xs text-muted-foreground sm:px-6">
				<span>Rendant Vereinsverwaltung</span>
				<VersionChip />
			</footer>
		</>
	);
}

function CreateClub({ onCreated }: { onCreated: (id: string) => void }) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const queryClient = useQueryClient();
	const create = useMutation({
		mutationFn: (input: { name: string; slug: string }) =>
			orpcClient.operators.create(input),
		onSuccess: async (tenant) => {
			await queryClient.invalidateQueries();
			setOpen(false);
			setName("");
			setSlug("");
			onCreated(tenant.id);
			toast.success(
				"Verein angelegt. Die Webadresse wird separat freigeschaltet.",
			);
		},
		onError: (error) =>
			toast.error(orpcMessage(error, "Verein konnte nicht angelegt werden.")),
	});
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!create.isPending) setOpen(next);
			}}
		>
			<DialogTrigger asChild>
				<Button>
					<Plus className="mr-1.5 h-4 w-4" />
					Verein anlegen
				</Button>
			</DialogTrigger>
			<DialogContent showCloseButton={!create.isPending}>
				<DialogHeader>
					<DialogTitle>Verein anlegen</DialogTitle>
					<DialogDescription>
						Der neue Verein startet ohne Buchungen. Eine Webadresse und weitere
						Zugänge werden anschließend eingerichtet.
					</DialogDescription>
				</DialogHeader>
				<form
					id="operator-create-club"
					className="space-y-4"
					onSubmit={(event) => {
						event.preventDefault();
						create.mutate({ name: name.trim(), slug: slug.trim() });
					}}
				>
					<div className="space-y-1.5">
						<Label htmlFor="operator-club-name">Vereinsname</Label>
						<Input
							id="operator-club-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							minLength={2}
							maxLength={120}
							required
							disabled={create.isPending}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="operator-club-slug">Kürzel</Label>
						<Input
							id="operator-club-slug"
							value={slug}
							onChange={(event) => setSlug(event.target.value)}
							minLength={3}
							maxLength={50}
							pattern="[a-z0-9]+(-[a-z0-9]+)*"
							placeholder="mein-verein"
							required
							disabled={create.isPending}
						/>
						<p className="text-xs text-muted-foreground">
							Dauerhafte Kennung mit Kleinbuchstaben, Zahlen und Bindestrichen.
						</p>
					</div>
				</form>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => setOpen(false)}
						disabled={create.isPending}
					>
						Abbrechen
					</Button>
					<Button
						type="submit"
						form="operator-create-club"
						disabled={create.isPending || !name.trim() || !slug.trim()}
					>
						{create.isPending ? "Wird angelegt…" : "Verein anlegen"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function ClubDetails({
	tenant,
	currentUserId,
	adminInviteRequested,
	onAdminInviteHandled,
}: {
	tenant: TenantSummary;
	currentUserId: string;
	adminInviteRequested: boolean;
	onAdminInviteHandled: () => void;
}) {
	const queryClient = useQueryClient();
	const members = useQuery(
		orpc.operators.members.queryOptions({ input: { tenantId: tenant.id } }),
	);
	const invites = useQuery(
		orpc.operators.invites.queryOptions({ input: { tenantId: tenant.id } }),
	);
	const [name, setName] = useState(tenant.name);
	const [adminInviteOpen, setAdminInviteOpen] = useState(adminInviteRequested);
	const [adminInvitePending, setAdminInvitePending] = useState(false);
	const activeInvites = (invites.data ?? []).filter(
		(invite) =>
			!invite.accepted_at && new Date(invite.expires_at).getTime() > Date.now(),
	);
	const activeInviteIds = activeInvites.map((invite) => invite.id);
	const pendingAdminCount = activeInvites.filter(
		(invite) => invite.role === "admin",
	).length;
	const rename = useMutation({
		mutationFn: () =>
			orpcClient.operators.rename({ tenantId: tenant.id, name: name.trim() }),
		onSuccess: async () => {
			await queryClient.invalidateQueries();
			toast.success("Vereinsname gespeichert.");
		},
		onError: (error) =>
			toast.error(orpcMessage(error, "Name konnte nicht gespeichert werden.")),
	});
	return (
		<section
			className="space-y-6 border-t pt-7"
			aria-labelledby="operator-selected-club"
		>
			<div className="flex items-start gap-2">
				<Building2 className="mt-1 h-5 w-5 shrink-0 text-primary" />
				<div>
					<h2
						id="operator-selected-club"
						tabIndex={-1}
						className="scroll-mt-24 font-heading text-xl outline-none"
					>
						{tenant.name}
					</h2>
					<p className="mt-1 font-mono text-xs text-muted-foreground">
						{tenant.slug}
					</p>
				</div>
			</div>
			<Dialog
				open={adminInviteOpen}
				onOpenChange={(open) => {
					if (adminInvitePending && !open) return;
					setAdminInviteOpen(open);
					if (!open) onAdminInviteHandled();
				}}
			>
				<div className="flex flex-wrap items-center gap-3">
					<DialogTrigger asChild>
						<Button variant={tenant.adminCount === 0 ? "default" : "outline"}>
							{tenant.adminCount === 0
								? "Ersten Admin einladen"
								: "Vereinsadmin einladen"}
						</Button>
					</DialogTrigger>
					{tenant.adminCount === 0 && (
						<p className="text-sm text-muted-foreground">
							Die technische Rolle Admin ist hier noch nicht vergeben.
						</p>
					)}
					{pendingAdminCount > 0 && (
						<p className="text-sm text-muted-foreground">
							{pendingAdminCount === 1
								? "Eine Admin-Einladung ist noch offen."
								: `${pendingAdminCount} Admin-Einladungen sind noch offen.`}
						</p>
					)}
				</div>
				<DialogContent
					showCloseButton={!adminInvitePending}
					onEscapeKeyDown={(event) => {
						if (adminInvitePending) event.preventDefault();
					}}
					onInteractOutside={(event) => {
						if (adminInvitePending) event.preventDefault();
					}}
				>
					<DialogHeader>
						<DialogTitle>
							{tenant.adminCount === 0
								? "Ersten Admin einladen"
								: "Vereinsadmin einladen"}
						</DialogTitle>
						<DialogDescription>
							Adminzugang für {tenant.name}. Die Person gibt ihren Namen beim
							Annehmen selbst an und legt ihr Passwort fest. Ein bestehendes
							Konto bleibt erhalten.
						</DialogDescription>
					</DialogHeader>
					<OperatorInvitePanel
						tenantId={tenant.id}
						addressConfigured={Boolean(tenant.url)}
						activeInviteIds={activeInviteIds}
						adminOnly
						inDialog
						onPendingChange={setAdminInvitePending}
					/>
					<DialogFooter>
						<Button
							variant="outline"
							disabled={adminInvitePending}
							onClick={() => {
								setAdminInviteOpen(false);
								onAdminInviteHandled();
							}}
						>
							Schließen
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<form
				className="flex max-w-xl flex-wrap items-end gap-3"
				onSubmit={(event) => {
					event.preventDefault();
					rename.mutate();
				}}
			>
				<div className="min-w-48 flex-1 space-y-1.5">
					<Label htmlFor="operator-display-name">Vereinsname</Label>
					<Input
						id="operator-display-name"
						value={name}
						onChange={(event) => setName(event.target.value)}
						required
						minLength={2}
						maxLength={120}
						disabled={rename.isPending}
					/>
				</div>
				<Button
					type="submit"
					variant="outline"
					disabled={
						rename.isPending || !name.trim() || name.trim() === tenant.name
					}
				>
					Speichern
				</Button>
			</form>
			<p className="max-w-2xl text-xs text-muted-foreground">
				Ändert den Namen in der App und für neue Belege. Bereits gespeicherte
				Belege bleiben unverändert. Anschrift und Registerdaten werden im
				jeweiligen Verein gepflegt.
			</p>
			<section
				className="space-y-4"
				aria-labelledby="operator-role-policy-heading"
			>
				<h3 id="operator-role-policy-heading" className="font-heading text-lg">
					Rollen und Berechtigungen
				</h3>
				<RolePermissionsForm key={tenant.id} tenantId={tenant.id} />
			</section>
			<div className="space-y-3">
				<h3 className="font-heading text-lg">Mitglieder und Rollen</h3>
				{members.isPending ? (
					<p role="status" className="text-sm">
						Mitglieder werden geladen.
					</p>
				) : members.error ? (
					<QueryFailure
						error={members.error}
						retry={() => void members.refetch()}
					/>
				) : (
					<MemberList
						members={members.data.members}
						tenantId={tenant.id}
						currentUserId={currentUserId}
					/>
				)}
			</div>
			<OperatorInvitePanel
				tenantId={tenant.id}
				addressConfigured={Boolean(tenant.url)}
				activeInviteIds={activeInviteIds}
			/>
			{invites.isPending ? (
				<p role="status" className="text-sm">
					Einladungen werden geladen.
				</p>
			) : invites.error ? (
				<QueryFailure
					error={invites.error}
					retry={() => void invites.refetch()}
				/>
			) : (
				<InviteList invites={invites.data} tenantId={tenant.id} />
			)}
		</section>
	);
}

type MemberAction =
	| { kind: "role"; member: Member; role: ClubRole }
	| { kind: "ban"; member: Member; banned: boolean };
function MemberList({
	members,
	tenantId,
	currentUserId,
}: {
	members: Member[];
	tenantId: string;
	currentUserId: string;
}) {
	const queryClient = useQueryClient();
	const [action, setAction] = useState<MemberAction | null>(null);
	const change = useMutation({
		mutationFn: (next: MemberAction) =>
			next.kind === "role"
				? orpcClient.operators.setRole({
						tenantId,
						id: next.member.id,
						role: next.role,
					})
				: orpcClient.operators.setBanned({
						tenantId,
						id: next.member.id,
						banned: next.banned,
					}),
		onSuccess: async () => {
			await queryClient.invalidateQueries();
			setAction(null);
			toast.success("Vereinszugang aktualisiert.");
		},
		onError: (error) =>
			toast.error(orpcMessage(error, "Zugang konnte nicht geändert werden.")),
	});
	return (
		<>
			<div className="rounded-lg border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Person</TableHead>
							<TableHead>Rolle</TableHead>
							<TableHead>Zugang</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{members.map((member) => (
							<TableRow key={member.id}>
								<TableCell>
									<div className="font-medium">
										{member.name}
										{member.id === currentUserId ? " (Du)" : ""}
									</div>
									<div className="mt-1 text-xs text-muted-foreground">
										{member.email}
									</div>
								</TableCell>
								<TableCell>
									<select
										className={selectClass}
										value={member.role}
										disabled={change.isPending || member.id === currentUserId}
										aria-label={`Rolle von ${member.name}`}
										onChange={(event) =>
											setAction({
												kind: "role",
												member,
												role: isClubRole(event.target.value)
													? event.target.value
													: "user",
											})
										}
									>
										{CLUB_ROLES.map((role) => (
											<option key={role} value={role}>
												{roleLabel(role)}
											</option>
										))}
									</select>
								</TableCell>
								<TableCell>
									{member.globalBanned ? (
										<span className="text-sm text-destructive">
											Global gesperrt
										</span>
									) : (
										<Button
											variant="outline"
											size="sm"
											disabled={change.isPending || member.id === currentUserId}
											onClick={() =>
												setAction({
													kind: "ban",
													member,
													banned: !member.banned,
												})
											}
										>
											{member.banned ? "Entsperren" : "Sperren"}
										</Button>
									)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
			{members.length === 0 && (
				<p className="text-sm text-muted-foreground">Noch keine Mitglieder.</p>
			)}
			<ConfirmDialog
				open={Boolean(action)}
				onOpenChange={(open) => {
					if (!open) setAction(null);
				}}
				title={
					action?.kind === "role"
						? "Rolle ändern?"
						: action?.banned
							? "Vereinszugang sperren?"
							: "Vereinszugang entsperren?"
				}
				description={
					action
						? `${action.member.name}: ${action.kind === "role" ? `Rolle auf ${roleLabel(action.role)} ändern.` : "Die Änderung gilt nur für diesen Verein."}`
						: ""
				}
				confirmLabel="Bestätigen"
				pending={change.isPending}
				onConfirm={async () => {
					if (action) await change.mutateAsync(action);
				}}
			/>
		</>
	);
}

export function OperatorInvitationDeliveryNotice({
	requested,
	status,
}: {
	requested: boolean;
	status: "sent" | "skipped" | "failed";
}) {
	const message = !requested
		? "Der Link ist erstellt. Es wurde keine E-Mail versendet."
		: status === "sent"
			? "Der E-Mail-Server hat die Einladung angenommen. Das bestätigt noch keinen Eingang im Postfach. Bitte bei der eingeladenen Person nachfragen."
			: status === "failed"
				? "Der E-Mail-Versand ist nicht bestätigt. Es wird nicht automatisch erneut gesendet. Den Einladungslink kannst du selbst weitergeben."
				: "Für diesen Verein ist kein E-Mail-Versand eingerichtet. Den Einladungslink kannst du selbst weitergeben.";
	return (
		<p role="status" className="text-sm text-muted-foreground">
			{message}
		</p>
	);
}

export function OperatorInvitePanel({
	tenantId,
	addressConfigured,
	activeInviteIds,
	adminOnly = false,
	inDialog = false,
	onPendingChange,
}: {
	tenantId: string;
	addressConfigured: boolean;
	activeInviteIds: string[];
	adminOnly?: boolean;
	inDialog?: boolean;
	onPendingChange?: (pending: boolean) => void;
}) {
	const submitPending = useRef(false);
	const queryClient = useQueryClient();
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<ClubRole>("user");
	const [sendEmail, setSendEmail] = useState(false);
	const [createdInvite, setCreatedInvite] = useState<{
		id: string;
		url: string | null;
		emailStatus: "sent" | "skipped" | "failed";
		emailRequested: boolean;
	} | null>(null);
	const activeCreatedInvite =
		createdInvite && activeInviteIds.includes(createdInvite.id)
			? createdInvite
			: null;
	const link = activeCreatedInvite?.url;
	const emailId = adminOnly
		? "operator-admin-invite-email"
		: "operator-invite-email";
	const roleId = adminOnly
		? "operator-admin-invite-role"
		: "operator-invite-role";
	const linkId = adminOnly
		? "operator-admin-invite-link"
		: "operator-new-invite-link";
	const create = useMutation({
		onMutate: () => onPendingChange?.(true),
		onSettled: () => {
			submitPending.current = false;
			onPendingChange?.(false);
		},
		mutationFn: () =>
			orpcClient.operators.invite({
				tenantId,
				email: email.trim(),
				role: adminOnly ? "admin" : role,
				sendEmail,
			}),
		onSuccess: async (invite) => {
			await queryClient.invalidateQueries();
			setEmail("");
			setCreatedInvite({
				id: invite.id,
				url: invite.inviteUrl,
				emailStatus: invite.email_status,
				emailRequested: invite.sendEmail,
			});
			if (invite.sendEmail && invite.email_status === "failed")
				toast.warning("Einladung erstellt. Versand nicht bestätigt.");
			else if (invite.sendEmail && invite.email_status === "sent")
				toast.success("Einladung vom E-Mail-Server angenommen.");
			else toast.success("Einladungslink erstellt.");
		},
		onError: (error) =>
			toast.error(
				orpcMessage(error, "Einladung konnte nicht erstellt werden."),
			),
	});
	return (
		<div className={inDialog ? "space-y-3" : "space-y-3 border-t pt-5"}>
			{!inDialog && (
				<>
					<h3 className="font-heading text-lg">Person einladen</h3>
					<p className="text-sm text-muted-foreground">
						E-Mail-Adresse hier angeben. Die Person gibt ihren Namen beim
						Annehmen selbst an. Ein bestehendes Konto bleibt erhalten.
					</p>
				</>
			)}
			{!addressConfigured && (
				<p className="text-sm text-muted-foreground">
					Für Einladungen zuerst eine Vereinsadresse konfigurieren.
				</p>
			)}
			<form
				className="flex flex-wrap items-end gap-3"
				onSubmit={(event) => {
					event.preventDefault();
					if (create.isPending || submitPending.current) return;
					submitPending.current = true;
					create.mutate();
				}}
			>
				<div className="min-w-48 flex-1 space-y-1.5">
					<Label htmlFor={emailId}>E-Mail</Label>
					<Input
						id={emailId}
						type="email"
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						required
						disabled={create.isPending || !addressConfigured}
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor={adminOnly ? undefined : roleId}>Rolle</Label>
					{adminOnly ? (
						<p className="flex h-9 items-center text-sm font-medium">Admin</p>
					) : (
						<select
							id={roleId}
							className={selectClass}
							value={role}
							onChange={(event) =>
								isClubRole(event.target.value) && setRole(event.target.value)
							}
							disabled={create.isPending || !addressConfigured}
						>
							{CLUB_ROLES.map((role) => (
								<option key={role} value={role}>
									{roleLabel(role)}
								</option>
							))}
						</select>
					)}
				</div>
				<label className="flex w-full items-center gap-2 text-sm">
					<input
						type="checkbox"
						checked={sendEmail}
						onChange={(event) => setSendEmail(event.target.checked)}
						disabled={create.isPending || !addressConfigured}
						className="h-4 w-4 accent-primary"
					/>
					Einladung per E-Mail senden
				</label>
				<p className="w-full text-xs text-muted-foreground">
					Ohne Auswahl wird nur ein Link erstellt. Ein Versand verwendet den
					eingerichteten E-Mail-Zugang des Vereins.
				</p>
				<Button
					type="submit"
					disabled={create.isPending || !addressConfigured || !email.trim()}
				>
					{create.isPending ? (
						<>
							<Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
							{sendEmail
								? "Einladung wird erstellt und versendet…"
								: "Einladungslink wird erstellt…"}
						</>
					) : sendEmail ? (
						adminOnly ? (
							"Admin einladen und E-Mail senden"
						) : (
							"Einladen und E-Mail senden"
						)
					) : adminOnly ? (
						"Admin-Einladungslink erstellen"
					) : (
						"Einladungslink erstellen"
					)}
				</Button>
			</form>
			{activeCreatedInvite && (
				<OperatorInvitationDeliveryNotice
					requested={activeCreatedInvite.emailRequested}
					status={activeCreatedInvite.emailStatus}
				/>
			)}
			{link && (
				<div className="space-y-2">
					<Label htmlFor={linkId}>Neuer Einladungslink</Label>
					<Input
						id={linkId}
						value={link}
						readOnly
						onFocus={(event) => event.currentTarget.select()}
					/>
					<Button
						variant="outline"
						size="sm"
						onClick={async () => {
							try {
								await navigator.clipboard.writeText(link);
								toast.success("Link kopiert.");
							} catch {
								toast.error(
									"Kopieren nicht möglich. Bitte den Link markieren und kopieren.",
								);
							}
						}}
					>
						Link kopieren
					</Button>
				</div>
			)}
		</div>
	);
}

type Invite = Awaited<ReturnType<typeof orpcClient.operators.invites>>[number];
function InviteList({
	invites,
	tenantId,
}: {
	invites: Invite[];
	tenantId: string;
}) {
	const queryClient = useQueryClient();
	const revoke = useMutation({
		mutationFn: (id: string) => orpcClient.operators.revoke({ tenantId, id }),
		onSuccess: async () => {
			await queryClient.invalidateQueries();
			toast.success("Einladung widerrufen.");
		},
		onError: (error) =>
			toast.error(
				orpcMessage(error, "Einladung konnte nicht widerrufen werden."),
			),
	});
	return (
		<div className="space-y-3">
			<h3 className="font-heading text-lg">Einladungen</h3>
			{invites.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					Keine Einladungen vorhanden.
				</p>
			) : (
				<div className="rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>E-Mail</TableHead>
								<TableHead>Rolle</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>
									<span className="sr-only">Aktionen</span>
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{invites.map((invite) => (
								<TableRow key={invite.id}>
									<TableCell>{invite.email}</TableCell>
									<TableCell>{roleLabel(invite.role)}</TableCell>
									<TableCell>
										{invite.accepted_at
											? "Angenommen"
											: new Date(invite.expires_at).getTime() < Date.now()
												? "Abgelaufen"
												: `Gültig bis ${formatDateDe(invite.expires_at)}`}
									</TableCell>
									<TableCell>
										{!invite.accepted_at && (
											<ConfirmDialog
												trigger={
													<Button
														variant="outline"
														size="sm"
														disabled={revoke.isPending}
													>
														Widerrufen
													</Button>
												}
												title="Einladung widerrufen?"
												description="Der bisherige Link kann anschließend nicht mehr angenommen werden."
												confirmLabel="Widerrufen"
												pending={revoke.isPending}
												onConfirm={async () => {
													await revoke.mutateAsync(invite.id);
												}}
											/>
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	);
}
