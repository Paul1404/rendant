import { Building2, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { addTenant, type SessionUser, selectTenant } from "@/lib/server-fns";

export function TenantSwitcher({ user }: { user: SessionUser }) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [pending, startTransition] = useTransition();

	function switchTo(tenantId: string) {
		if (tenantId === user.tenant.id) return;
		startTransition(async () => {
			try {
				await selectTenant(tenantId);
				// A fresh document drops every query, component and router cache.
				window.location.assign("/protokolle");
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Verein konnte nicht gewechselt werden.",
				);
			}
		});
	}

	function create() {
		startTransition(async () => {
			try {
				const tenant = await addTenant({ name, slug });
				await selectTenant(tenant.id);
				window.location.assign("/protokolle");
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Verein konnte nicht angelegt werden.",
				);
			}
		});
	}

	if (user.tenantHostBound) {
		return (
			<span className="flex max-w-28 items-center gap-1.5 px-2 text-sm text-nav-foreground/90 sm:max-w-40">
				<Building2 className="h-4 w-4 shrink-0" aria-hidden />
				<span className="sr-only">Verein: {user.tenant.name}</span>
				<span aria-hidden className="truncate">
					{user.tenant.name}
				</span>
			</span>
		);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="max-w-40 text-nav-foreground/90 hover:bg-white/8 hover:text-nav-foreground focus-visible:border-nav-accent focus-visible:ring-nav-accent/80"
					aria-label={`Verein: ${user.tenant.name}`}
				>
					<Building2 className="h-4 w-4 shrink-0 sm:mr-1.5" />
					<span className="hidden truncate sm:inline">{user.tenant.name}</span>
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Verein wählen</DialogTitle>
					<DialogDescription>
						Daten und Einstellungen gehören jeweils zu einem Verein.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-2">
					{user.tenants.map((tenant) => (
						<Button
							key={tenant.id}
							variant={tenant.id === user.tenant.id ? "secondary" : "outline"}
							className="h-auto min-h-10 w-full justify-between whitespace-normal text-left"
							disabled={pending || tenant.id === user.tenant.id}
							onClick={() => switchTo(tenant.id)}
						>
							<span>{tenant.name}</span>
							<span className="ml-3 text-xs text-muted-foreground">
								{tenant.id === user.tenant.id
									? "Aktuell"
									: tenant.role === "admin"
										? "Admin"
										: "Mitglied"}
							</span>
						</Button>
					))}
				</div>
				{user.canCreateTenant && (
					<form
						className="space-y-3 border-t pt-4"
						onSubmit={(event) => {
							event.preventDefault();
							create();
						}}
					>
						<h3 className="font-medium">Weiteren Verein anlegen</h3>
						<div className="space-y-1.5">
							<Label htmlFor="tenant-name">Vereinsname</Label>
							<Input
								id="tenant-name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								minLength={2}
								maxLength={120}
								required
								disabled={pending}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="tenant-slug">Kürzel</Label>
							<Input
								id="tenant-slug"
								value={slug}
								onChange={(event) => setSlug(event.target.value)}
								pattern="[a-z0-9]+(-[a-z0-9]+)*"
								minLength={3}
								maxLength={50}
								placeholder="mein-verein"
								required
								disabled={pending}
								aria-describedby="tenant-slug-hint"
							/>
							<p
								id="tenant-slug-hint"
								className="text-xs text-muted-foreground"
							>
								Kleinbuchstaben, Zahlen und Bindestriche.
							</p>
						</div>
						<Button
							type="submit"
							disabled={pending || !name.trim() || !slug.trim()}
						>
							<Plus className="mr-1.5 h-4 w-4" />
							Verein anlegen
						</Button>
					</form>
				)}
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => setOpen(false)}
						disabled={pending}
					>
						Schließen
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
