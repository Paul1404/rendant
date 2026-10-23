export type DatevDocument = "original" | "storno";
export type DatevDeliveryState = "ready" | "sending" | "sent" | "uncertain";

export const DATEV_DELIVERY_LABELS: Record<DatevDeliveryState, string> = {
	ready: "Zum Versand freigegeben",
	sending: "Versand läuft",
	sent: "Per E-Mail gesendet",
	uncertain: "Versand unklar",
};
