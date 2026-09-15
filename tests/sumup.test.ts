import { beforeAll, describe, expect, it } from "vitest";
import { berlinDayRangeUtc, berlinDayStartUtc } from "@/lib/date";

beforeAll(() => {
	process.env.BETTER_AUTH_SECRET ||= "test-secret-please-ignore-32-bytes-long";
	// sumup.ts pulls in the db client, which constructs a pg Pool at import time.
	// The Pool does not connect until queried, so a dummy URL is enough here.
	process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/test";
});

describe("Berlin day range", () => {
	it("starts a winter day at 23:00 UTC of the day before", () => {
		expect(berlinDayStartUtc("2026-01-15").toISOString()).toBe(
			"2026-01-14T23:00:00.000Z",
		);
	});

	it("starts a summer day at 22:00 UTC of the day before", () => {
		expect(berlinDayStartUtc("2026-07-15").toISOString()).toBe(
			"2026-07-14T22:00:00.000Z",
		);
	});

	it("handles the switch to daylight saving time", () => {
		const { from, to } = berlinDayRangeUtc("2026-03-29");
		expect(from.toISOString()).toBe("2026-03-28T23:00:00.000Z");
		expect(to.toISOString()).toBe("2026-03-29T22:00:00.000Z");
	});

	it("handles the switch back to standard time", () => {
		const { from, to } = berlinDayRangeUtc("2026-10-25");
		expect(from.toISOString()).toBe("2026-10-24T22:00:00.000Z");
		expect(to.toISOString()).toBe("2026-10-25T23:00:00.000Z");
	});
});

describe("summarizeCardRevenue", () => {
	const tx = (over: Record<string, unknown>) => ({
		id: String(over.id ?? Math.random()),
		transaction_code: "T",
		amount: 10,
		currency: "EUR",
		timestamp: "2026-09-12T18:00:00.000Z",
		status: "SUCCESSFUL",
		payment_type: "POS",
		type: "PAYMENT",
		refunded_amount: 0,
		card_type: "VISA",
		...over,
	});

	it("sums successful card payments in cent without float drift", async () => {
		const { summarizeCardRevenue } = await import("@/server/services/sumup");
		const s = summarizeCardRevenue([
			tx({ id: "a", amount: 10.1 }),
			tx({ id: "b", amount: 0.2 }),
			tx({ id: "c", amount: 1.15 }),
		]);
		expect(s.kartenzahlung_cent).toBe(1145);
		expect(s.anzahl).toBe(3);
		expect(s.uebersprungen).toBe(0);
	});

	it("skips cash, failed, foreign-currency and refund rows", async () => {
		const { summarizeCardRevenue } = await import("@/server/services/sumup");
		const s = summarizeCardRevenue([
			tx({ id: "a", amount: 5 }),
			tx({ id: "cash", payment_type: "CASH" }),
			tx({ id: "failed", status: "FAILED" }),
			tx({ id: "cancelled", status: "CANCELLED" }),
			tx({ id: "chf", currency: "CHF" }),
			tx({ id: "refund-row", type: "REFUND", amount: 5 }),
		]);
		expect(s.kartenzahlung_cent).toBe(500);
		expect(s.anzahl).toBe(1);
		expect(s.uebersprungen).toBe(5);
	});

	it("nets refunded amounts against the payment and counts them once", async () => {
		const { summarizeCardRevenue } = await import("@/server/services/sumup");
		const s = summarizeCardRevenue([
			tx({ id: "a", amount: 20, status: "REFUNDED", refunded_amount: 20 }),
			tx({ id: "b", amount: 30, refunded_amount: 12.5 }),
			tx({ id: "b", amount: 30, refunded_amount: 12.5 }),
		]);
		expect(s.brutto_cent).toBe(5000);
		expect(s.erstattet_cent).toBe(3250);
		expect(s.kartenzahlung_cent).toBe(1750);
		expect(s.anzahl).toBe(2);
	});
});

describe("pickMerchant", () => {
	it("returns the first accepted merchant membership", async () => {
		const { pickMerchant } = await import("@/server/services/sumup");
		expect(
			pickMerchant({
				items: [
					{
						resource_id: "PENDING1",
						status: "pending",
						resource: { id: "PENDING1", type: "merchant", name: "Alt" },
					},
					{
						resource_id: "MABC123",
						status: "accepted",
						resource: { id: "MABC123", type: "merchant", name: "SV Verein" },
					},
				],
			}),
		).toEqual({ code: "MABC123", name: "SV Verein" });
	});

	it("returns null without a merchant", async () => {
		const { pickMerchant } = await import("@/server/services/sumup");
		expect(pickMerchant({ items: [] })).toBeNull();
		expect(pickMerchant({})).toBeNull();
		expect(pickMerchant(null)).toBeNull();
	});
});

describe("resolveNextLink", () => {
	it("appends a query-only next link to the history path", async () => {
		const { resolveNextLink } = await import("@/server/services/sumup");
		expect(
			resolveNextLink("/v2.1/merchants/M1/transactions/history", [
				{ rel: "next", href: "limit=10&oldest_ref=abc&order=ascending" },
			]),
		).toBe(
			"/v2.1/merchants/M1/transactions/history?limit=10&oldest_ref=abc&order=ascending",
		);
	});

	it("keeps absolute links and ignores other relations", async () => {
		const { resolveNextLink } = await import("@/server/services/sumup");
		expect(
			resolveNextLink("/x", [
				{ rel: "self", href: "a=1" },
				{ rel: "next", href: "https://api.sumup.com/x?a=2" },
			]),
		).toBe("https://api.sumup.com/x?a=2");
		expect(resolveNextLink("/x", [{ rel: "self", href: "a=1" }])).toBeNull();
		expect(resolveNextLink("/x", undefined)).toBeNull();
	});
});

describe("listSumupTransactions", () => {
	it("follows paging links, sends the bearer key and filters by range", async () => {
		const { listSumupTransactions } = await import("@/server/services/sumup");
		const calls: { url: string; auth: string | null }[] = [];
		const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			const headers = new Headers(init?.headers);
			calls.push({ url, auth: headers.get("authorization") });
			const page = url.includes("oldest_ref=") ? 2 : 1;
			const body =
				page === 1
					? {
							items: [
								{
									id: "1",
									amount: 12.5,
									currency: "EUR",
									timestamp: "2026-09-12T10:00:00Z",
									status: "SUCCESSFUL",
									payment_type: "POS",
									type: "PAYMENT",
								},
							],
							links: [{ rel: "next", href: "limit=100&oldest_ref=x" }],
						}
					: {
							items: [
								{
									id: "2",
									amount: 3,
									currency: "EUR",
									timestamp: "2026-09-13T10:00:00Z",
									status: "SUCCESSFUL",
									payment_type: "POS",
									type: "PAYMENT",
								},
							],
							links: [],
						};
			return new Response(JSON.stringify(body), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as typeof fetch;

		const rows = await listSumupTransactions({
			apiKey: "sup_sk_test",
			merchantCode: "M1",
			from: new Date("2026-09-11T22:00:00Z"),
			to: new Date("2026-09-12T22:00:00Z"),
			fetchImpl,
		});
		expect(rows.map((r) => r.id)).toEqual(["1"]);
		expect(calls).toHaveLength(2);
		expect(calls[0].auth).toBe("Bearer sup_sk_test");
		expect(calls[0].url).toContain(
			"https://api.sumup.com/v2.1/merchants/M1/transactions/history?",
		);
		expect(calls[0].url).toContain("oldest_time=2026-09-11T22%3A00%3A00.000Z");
		expect(calls[1].url).toContain("oldest_ref=x");
	});

	it("maps a rejected key to a readable error", async () => {
		const { listSumupTransactions, SumupError } = await import(
			"@/server/services/sumup"
		);
		const fetchImpl = (async () =>
			new Response("{}", { status: 401 })) as typeof fetch;
		await expect(
			listSumupTransactions({
				apiKey: "bad",
				merchantCode: "M1",
				from: new Date(0),
				to: new Date(1),
				fetchImpl,
			}),
		).rejects.toMatchObject({
			name: "SumupError",
			code: "UNAUTHORIZED",
		});
		expect(SumupError).toBeDefined();
	});
});
