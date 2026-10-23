import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTimeDe } from "@/lib/date";
import { DATEV_DELIVERY_LABELS, type DatevDocument } from "@/lib/datev";
import { orpc, orpcClient } from "@/lib/orpc";
import { orpcMessage } from "@/lib/orpc-error";

type Status = Awaited<ReturnType<typeof orpcClient.protokolle.datevStatus>>;
type Review = {
	document: DatevDocument;
	attempt_id: string;
	expected_revision: number;
	recipient: string;
	sender: string;
};
type SendReview = {
	document: DatevDocument;
	expected_delivery_attempt_id: string | null;
	pdf_key: string;
	settings: Status["settings"];
};

export function DatevSendPanel({
	protokollId,
	belegnummer,
}: {
	protokollId: string;
	belegnummer: string;
}) {
	const queryClient = useQueryClient();
	const { data, error, isPending } = useQuery(
		orpc.protokolle.datevStatus.queryOptions({
			input: { id: protokollId },
			refetchInterval: 15_000,
		}),
	);
	const [review, setReview] = useState<SendReview | null>(null);
	const [resolve, setResolve] = useState<Review | null>(null);
	const [reason, setReason] = useState("");
	const [pending, start] = useTransition();

	function send() {
		if (!review) return;
		start(async () => {
			try {
				const result = await orpcClient.protokolle.sendDatev({
					id: protokollId,
					document: review.document,
					expected_delivery_attempt_id: review.expected_delivery_attempt_id,
					expected_pdf_key: review.pdf_key,
					expected_settings_updated_at: review.settings.updated_at,
				});
				toast.success(
					result.status === "sent"
						? "Beleg per E-Mail an DATEV gesendet"
						: "Dieser Beleg wurde bereits gesendet oder wird gerade verarbeitet",
				);
			} catch (err) {
				toast.error(
					orpcMessage(
						err,
						"Versand fehlgeschlagen. Bitte Versandstatus prüfen.",
					),
				);
			} finally {
				setReview(null);
				await queryClient.invalidateQueries();
			}
		});
	}

	function reconcile(outcome: "sent" | "ready") {
		if (!resolve) return;
		start(async () => {
			try {
				await orpcClient.protokolle.resolveDatev({
					id: protokollId,
					document: resolve.document,
					attempt_id: resolve.attempt_id,
					expected_revision: resolve.expected_revision,
					outcome,
					reason: reason.trim(),
				});
				setResolve(null);
				setReason("");
				toast.success(
					outcome === "sent"
						? "Versand als geklärt gespeichert"
						: "Beleg für einen neuen Versand freigegeben",
				);
			} catch (err) {
				toast.error(orpcMessage(err, "Klärung fehlgeschlagen"));
			} finally {
				await queryClient.invalidateQueries();
			}
		});
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle as="h2" className="text-base">
					DATEV · Kasse
				</CardTitle>
				<CardDescription>
					PDF-Belege direkt per E-Mail an DATEV Unternehmen online senden. Die
					DATEV-Rückmeldung und den Eingang bitte dort prüfen.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{isPending ? (
					<p className="text-sm text-muted-foreground">
						Versandstatus wird geladen…
					</p>
				) : null}
				{error ? (
					<p role="alert" className="text-sm text-destructive">
						Versandstatus konnte nicht aktualisiert werden. Bitte die Verbindung
						prüfen oder die Seite neu laden.
					</p>
				) : null}
				{data && !data.settings.enabled ? (
					<p className="text-sm text-muted-foreground">
						DATEV ist noch nicht aktiviert.{" "}
						<Link
							to="/protokolle/einstellungen"
							hash="datev"
							className="text-primary underline"
						>
							Verbindung einrichten
						</Link>
					</p>
				) : null}
				{data?.documents.map((item) => {
					const delivery = item.delivery;
					const canSend =
						!error &&
						data.settings.enabled &&
						item.pdf_key &&
						(!delivery || delivery.state === "ready");
					return (
						<div
							key={item.document}
							className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
						>
							<div className="min-w-0 space-y-1">
								<p className="text-sm font-medium">
									{item.document === "storno" ? "Stornobeleg" : "Originalbeleg"}{" "}
									{belegnummer}
								</p>
								<p className="text-xs text-muted-foreground">
									{delivery
										? DATEV_DELIVERY_LABELS[delivery.state]
										: item.pdf_key
											? "Noch nicht gesendet"
											: "PDF fehlt. Bitte zuerst neu erzeugen."}
									{delivery?.sent_at
										? ` · ${formatDateTimeDe(delivery.sent_at)}`
										: ""}
								</p>
								{delivery ? (
									<p className="break-all text-xs text-muted-foreground">
										Ziel: {delivery.recipient}
									</p>
								) : null}
								{delivery?.state === "sending" ||
								delivery?.state === "uncertain" ? (
									<p className="text-xs text-muted-foreground">
										Bei unklarem Versand zuerst DATEV und die Rückmeldung per
										E-Mail prüfen. Laufende Vorgänge können nach fünf Minuten
										geklärt werden.
									</p>
								) : null}
							</div>
							<div className="flex shrink-0 flex-wrap gap-2">
								{canSend ? (
									<Button
										variant="outline"
										size="sm"
										disabled={pending || !!error}
										onClick={() =>
											setReview({
												document: item.document,
												expected_delivery_attempt_id:
													delivery?.attempt_id ?? null,
												pdf_key: item.pdf_key as string,
												settings: { ...data.settings },
											})
										}
									>
										<Send className="mr-2 h-4 w-4" />
										{item.document === "storno"
											? "Storno an DATEV senden"
											: "An DATEV senden"}
									</Button>
								) : null}
								{delivery?.can_resolve ? (
									<Button
										variant="outline"
										size="sm"
										disabled={pending}
										onClick={() => {
											setResolve({
												document: item.document,
												attempt_id: delivery.attempt_id,
												expected_revision: delivery.revision,
												recipient: delivery.recipient,
												sender: delivery.sender,
											});
											setReason("");
										}}
									>
										Versand prüfen
									</Button>
								) : null}
							</div>
						</div>
					);
				})}
			</CardContent>
			<Dialog
				open={review !== null}
				onOpenChange={(open) => {
					if (!open && !pending) setReview(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{review?.document === "storno" ? "Stornobeleg" : "Beleg"}{" "}
							{belegnummer} an DATEV senden?
						</DialogTitle>
						<DialogDescription>
							Das gespeicherte PDF wird als Anhang an den Belegtyp „Kasse“
							gesendet. Es wird keine neue Buchung in Rendant angelegt.
						</DialogDescription>
					</DialogHeader>
					<dl className="space-y-2 text-sm">
						<div>
							<dt className="text-muted-foreground">Absender</dt>
							<dd className="break-all">{review?.settings.sender}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">DATEV-Zieladresse</dt>
							<dd className="break-all">{review?.settings.recipient}</dd>
						</div>
					</dl>
					<p className="text-xs text-muted-foreground">
						„Gesendet“ bestätigt die Übergabe an den Mailserver. Die
						Verarbeitung durch DATEV wird per E-Mail zurückgemeldet.
					</p>
					<DialogFooter>
						<Button
							variant="outline"
							disabled={pending}
							onClick={() => setReview(null)}
						>
							Abbrechen
						</Button>
						<Button disabled={pending} onClick={send}>
							{pending ? "Wird gesendet…" : "Jetzt an DATEV senden"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<Dialog
				open={resolve !== null}
				onOpenChange={(open) => {
					if (!open && !pending) setResolve(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>DATEV-Versand klären</DialogTitle>
						<DialogDescription>
							Prüfe den Beleg in DATEV und die Rückmeldung per E-Mail. Gib ihn
							nur erneut frei, wenn er nicht angekommen ist oder DATEV ihn
							abgelehnt hat. Eine Freigabe sendet noch keine E-Mail.
						</DialogDescription>
					</DialogHeader>
					<p className="break-all text-xs text-muted-foreground">
						Geprüftes Ziel: {resolve?.recipient}
					</p>
					<Label htmlFor="datev-reason">Ergebnis der Prüfung</Label>
					<Textarea
						id="datev-reason"
						value={reason}
						onChange={(event) => setReason(event.target.value)}
						minLength={10}
						maxLength={1000}
						disabled={pending}
						placeholder="Was wurde in DATEV und in der Rückmeldung festgestellt?"
					/>
					<DialogFooter className="flex-wrap gap-2">
						<Button
							variant="outline"
							disabled={pending}
							onClick={() => setResolve(null)}
						>
							Abbrechen
						</Button>
						<Button
							variant="outline"
							disabled={pending || reason.trim().length < 10}
							onClick={() => reconcile("ready")}
						>
							Nicht angekommen, freigeben
						</Button>
						<Button
							disabled={pending || reason.trim().length < 10}
							onClick={() => reconcile("sent")}
						>
							In DATEV vorhanden
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Card>
	);
}
