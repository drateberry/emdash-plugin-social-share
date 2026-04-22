import type { PluginContext } from "emdash";
import type { PlatformId } from "./networks/types";

export interface ShareRecord {
	postId: string;
	collection: string;
	platform: PlatformId;
	status: "success" | "failed" | "pending";
	postedAt: string;
	externalId?: string;
	postUrl?: string;
	error?: string;
	attempts: number;
}

export async function hasSucceeded(
	ctx: PluginContext,
	postId: string,
	platform: PlatformId,
): Promise<boolean> {
	const shares = (ctx.storage as Record<string, any>).shares;
	if (!shares) return false;
	const result = await shares.query({
		where: { postId, platform, status: "success" },
		limit: 1,
	});
	return result.items.length > 0;
}

export async function recordShare(
	ctx: PluginContext,
	record: ShareRecord,
): Promise<string> {
	const shares = (ctx.storage as Record<string, any>).shares;
	if (!shares) throw new Error("shares storage collection not available");
	const id = `${record.postId}:${record.platform}:${Date.now()}`;
	await shares.put(id, record);
	return id;
}

export async function getRecentShares(
	ctx: PluginContext,
	limit = 20,
): Promise<Array<{ id: string; record: ShareRecord }>> {
	const shares = (ctx.storage as Record<string, any>).shares;
	if (!shares) return [];
	const result = await shares.query({
		orderBy: { postedAt: "desc" },
		limit,
	});
	return result.items.map((item: { id: string; data: ShareRecord }) => ({
		id: item.id,
		record: item.data,
	}));
}
