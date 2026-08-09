import { inArray, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import {
	historicalProtocolImportReviewItems,
	historicalProtocolImportReviewPhases,
} from "@/server/db/schema";
import type { AuthUser } from "@/server/orpc/base";

export async function invalidateHistoricalProtocolReviewsForItems(
	database: DbOrTx,
	itemIds: string[],
	actor: AuthUser,
): Promise<number> {
	if (itemIds.length === 0) return 0;
	const memberships = await database
		.select({
			id: historicalProtocolImportReviewItems.id,
			phaseId: historicalProtocolImportReviewItems.phase_id,
		})
		.from(historicalProtocolImportReviewItems)
		.where(inArray(historicalProtocolImportReviewItems.item_id, itemIds));
	if (memberships.length === 0) return 0;
	await database
		.update(historicalProtocolImportReviewItems)
		.set({
			status: "pending",
			note: null,
			revision: sql`${historicalProtocolImportReviewItems.revision} + 1`,
			updated_by_user_id: actor.id,
			updated_by_name: actor.name,
			updated_at: new Date(),
		})
		.where(
			inArray(
				historicalProtocolImportReviewItems.id,
				memberships.map((membership) => membership.id),
			),
		);
	const phaseIds = [
		...new Set(memberships.map((membership) => membership.phaseId)),
	];
	await database
		.update(historicalProtocolImportReviewPhases)
		.set({
			status: "active",
			revision: sql`${historicalProtocolImportReviewPhases.revision} + 1`,
			updated_at: new Date(),
			completed_by_user_id: null,
			completed_by_name: null,
			completed_at: null,
		})
		.where(inArray(historicalProtocolImportReviewPhases.id, phaseIds));
	return memberships.length;
}
