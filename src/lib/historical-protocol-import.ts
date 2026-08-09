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
	contentFingerprint: string;
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

export type HistoricalProtocolDraftStatus = "editing" | "ready" | "imported";

export type HistoricalProtocolDraftDecision = "include" | "review" | "exclude";

export type HistoricalProtocolDraftItem = {
	id: string;
	draftId: string;
	fileIndex: number;
	path: string;
	parserStatus: HistoricalProtocolImportStatus;
	parserReason: string;
	decision: HistoricalProtocolDraftDecision;
	date: string | null;
	detail: string;
	area: Umsatzbereich | null;
	revenueCent: number | null;
	expensesCent: number | null;
	classificationKey: string;
	classificationConfidence: "high" | "medium" | "low";
	correctionNote: string | null;
	detected: HistoricalProtocolParsedRow;
	revision: number;
	updatedAt: Date;
	updatedByName: string;
};

export type HistoricalProtocolDraftSummary = {
	id: string;
	folderName: string;
	digest: string;
	status: HistoricalProtocolDraftStatus;
	revision: number;
	files: number;
	spreadsheetFiles: number;
	createdAt: Date;
	updatedAt: Date;
	createdByName: string;
	importedAt: Date | null;
	resultCreated: number | null;
	resultSkipped: number | null;
	counts: {
		include: number;
		review: number;
		exclude: number;
		invalidIncluded: number;
	};
	totals: {
		revenueCent: number;
		expensesCent: number;
		cardCent: number;
	};
};

export type HistoricalProtocolDraftDetail = HistoricalProtocolDraftSummary & {
	items: HistoricalProtocolDraftItem[];
};

export type HistoricalProtocolDraftCompactItem = Omit<
	HistoricalProtocolDraftItem,
	"detected"
> & {
	evidence: {
		dateOrigin: "workbook" | "file_modified" | null;
		warnings: string[];
		cardCent: number;
		cashRegisterNumber: string | null;
		cashRegisterLabel: string | null;
		protocolNumber: string | null;
	};
};

export type HistoricalProtocolDraftFacet = {
	value: string;
	count: number;
};

export type HistoricalProtocolDraftAnalysis = {
	draft: HistoricalProtocolDraftSummary;
	matched: number;
	totals: {
		revenueCent: number;
		expensesCent: number;
		cardCent: number;
	};
	issues: {
		missingArea: number;
		derivedDate: number;
		vatWarning: number;
		denominationWarning: number;
		unclearRegister: number;
	};
	facets: {
		decisions: HistoricalProtocolDraftFacet[];
		parserStatuses: HistoricalProtocolDraftFacet[];
		parserReasons: HistoricalProtocolDraftFacet[];
		classificationKeys: HistoricalProtocolDraftFacet[];
		classificationConfidence: HistoricalProtocolDraftFacet[];
		areas: HistoricalProtocolDraftFacet[];
		dateOrigins: HistoricalProtocolDraftFacet[];
		warnings: HistoricalProtocolDraftFacet[];
	};
};

export type HistoricalProtocolDraftItemPage = {
	draft: HistoricalProtocolDraftSummary;
	page: number;
	pageSize: number;
	total: number;
	pageCount: number;
	items: Array<
		HistoricalProtocolDraftItem | HistoricalProtocolDraftCompactItem
	>;
};

export type HistoricalProtocolReviewPhaseKind =
	| "source"
	| "date"
	| "amount"
	| "assignment"
	| "tax"
	| "denomination"
	| "final";

export type HistoricalProtocolReviewPhaseStatus = "active" | "completed";
export type HistoricalProtocolReviewItemStatus =
	| "pending"
	| "accepted"
	| "issue"
	| "not_applicable";

export type HistoricalProtocolReviewIssue =
	| "derived_date"
	| "vat_warning"
	| "denomination_warning"
	| "missing_area"
	| "unclear_register";

export type HistoricalProtocolReviewPhaseFilters = {
	year_from?: number;
	year_to?: number;
	decisions?: HistoricalProtocolDraftDecision[];
	issue?: HistoricalProtocolReviewIssue;
	query?: string;
};

export type HistoricalProtocolReviewPhaseSummary = {
	id: string;
	draftId: string;
	name: string;
	kind: HistoricalProtocolReviewPhaseKind;
	status: HistoricalProtocolReviewPhaseStatus;
	filters: HistoricalProtocolReviewPhaseFilters;
	revision: number;
	createdByName: string;
	createdAt: Date;
	updatedAt: Date;
	completedByName: string | null;
	completedAt: Date | null;
	counts: Record<HistoricalProtocolReviewItemStatus, number> & {
		total: number;
		completed: number;
	};
	progressPercent: number;
	totals: {
		revenueCent: number;
		expensesCent: number;
		cardCent: number;
	};
};

export type HistoricalProtocolReviewPhasePlan = {
	draft: HistoricalProtocolDraftSummary;
	name: string;
	kind: HistoricalProtocolReviewPhaseKind;
	filters: HistoricalProtocolReviewPhaseFilters;
	selectionHash: string;
	matched: number;
	totals: {
		revenueCent: number;
		expensesCent: number;
		cardCent: number;
	};
};

export type HistoricalProtocolReviewPhaseItem = {
	id: string;
	phaseId: string;
	itemId: string;
	status: HistoricalProtocolReviewItemStatus;
	note: string | null;
	revision: number;
	updatedAt: Date;
	updatedByName: string;
	item: HistoricalProtocolDraftCompactItem;
};

export type HistoricalProtocolReviewPhaseItemPage = {
	phase: HistoricalProtocolReviewPhaseSummary;
	page: number;
	pageSize: number;
	total: number;
	pageCount: number;
	items: HistoricalProtocolReviewPhaseItem[];
};

export type HistoricalProtocolReviewUpdatePlan = {
	phase: HistoricalProtocolReviewPhaseSummary;
	status: HistoricalProtocolReviewItemStatus;
	selectionHash: string;
	matched: number;
	totals: {
		revenueCent: number;
		expensesCent: number;
		cardCent: number;
	};
};
