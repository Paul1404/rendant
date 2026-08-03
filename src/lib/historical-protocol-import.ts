import type { DenominationCounts } from "@/lib/denominations";
import type { Umsatzbereich } from "@/lib/umsatzbereich";

export type HistoricalProtocolImportStatus =
	| "ready"
	| "review"
	| "already_imported"
	| "existing_protocol"
	| "duplicate_file"
	| "skipped"
	| "error";

export type HistoricalProtocolVatSplit = {
	ust_basis_punkte: number;
	betrag_cent: number;
};

export type HistoricalProtocolSource = {
	sha256: string;
	path: string;
	format: "ods" | "xlsx";
	protocolNumber: string | null;
	cashRegisterNumber: string | null;
	cashRegisterLabel: string | null;
	countedBy: string | null;
	openingCent: number | null;
	cardCent: number;
	countedCent: number | null;
	cashRevenueCent: number;
	denominations: DenominationCounts | null;
	vat: HistoricalProtocolVatSplit[];
	warnings: string[];
	dateOrigin: "workbook" | "file_modified";
};

export type HistoricalProtocolParsedRow = {
	fileIndex: number;
	path: string;
	status: HistoricalProtocolImportStatus;
	statusReason: string;
	date: string | null;
	detail: string;
	classificationKey: string;
	suggestedArea: Umsatzbereich;
	classificationConfidence: "high" | "medium" | "low";
	revenueCent: number | null;
	expensesCent: number | null;
	source: HistoricalProtocolSource | null;
};

export type HistoricalProtocolClassification = {
	key: string;
	label: string;
	count: number;
	suggestedArea: Umsatzbereich;
	confidence: "high" | "medium" | "low";
};

export type HistoricalProtocolPreview = {
	valid: boolean;
	digest: string;
	folderName: string;
	files: number;
	spreadsheetFiles: number;
	statusCounts: Record<HistoricalProtocolImportStatus, number>;
	toImport: number;
	reviewRequired: number;
	totals: {
		revenueCent: number;
		expensesCent: number;
		cashCent: number;
		cardCent: number;
	};
	coverage: {
		years: number[];
		withDenominations: number;
		withVat: number;
		withCard: number;
		withCashRegister: number;
	};
	classifications: HistoricalProtocolClassification[];
	rows: HistoricalProtocolParsedRow[];
};

export type HistoricalProtocolClassificationOverrides = Record<
	string,
	Umsatzbereich
>;
