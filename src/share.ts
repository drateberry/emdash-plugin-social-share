import { getCollectionInfo } from "emdash";
import type { PluginContext } from "emdash";
import { hasSucceeded, recordShare } from "./dedup";
import { fetchPostImage, type PostImage } from "./images";
import { createBlueskyAdapter, getBlueskyCredentials } from "./networks/bluesky";
import { createMastodonAdapter, getMastodonCredentials } from "./networks/mastodon";
import type { NetworkAdapter, PlatformId } from "./networks/types";
import { createXAdapter, getXCredentials } from "./networks/x";
import { renderStatus } from "./renderer";

export interface SharePostInput {
	content: Record<string, unknown>;
	collection: string;
	force?: boolean;
	platforms?: PlatformId[];
}

const DEFAULT_TEMPLATE = "{title}\n\n{url}";
const DEFAULT_COLLECTIONS = "posts";

export async function sharePost(
	ctx: PluginContext,
	input: SharePostInput,
): Promise<void> {
	const enabled = (await ctx.kv.get<boolean>("settings:enabled")) ?? true;
	if (!enabled) return;

	const rawCollections =
		(await ctx.kv.get<string>("settings:collections")) ?? DEFAULT_COLLECTIONS;
	const allowedCollections = rawCollections
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	if (!allowedCollections.includes(input.collection)) return;

	const content = input.content as Record<string, unknown>;
	const postId = String(content.id ?? "");
	const slug = String(content.slug ?? "");
	if (!postId || !slug) {
		ctx.log.warn("[social-share] post missing id or slug; skipping");
		return;
	}

	const data = ((content.data as Record<string, unknown>) ?? {}) as Record<
		string,
		unknown
	>;
	const title = String(data.title ?? slug);
	const excerpt = String(data.excerpt ?? "");
	const url = await resolveEntryUrl(ctx, input.collection, slug);
	const template =
		(await ctx.kv.get<string>("settings:template")) ?? DEFAULT_TEMPLATE;

	const platforms =
		input.platforms ?? (await determineEnabledPlatforms(ctx));
	if (platforms.length === 0) return;

	let sharedImage: PostImage | null = null;
	if (await anyImageToggleOn(ctx, platforms)) {
		sharedImage = await fetchPostImage(ctx, content);
	}

	for (const platform of platforms) {
		if (!input.force && (await hasSucceeded(ctx, postId, platform))) {
			continue;
		}

		const adapter = await createAdapter(ctx, platform);
		if (!adapter) continue;

		const text = renderStatus(
			{ title, url, excerpt, tags: [] },
			{
				template,
				appendHashtags: false,
				hashtagMaxCount: 3,
				charLimit: adapter.charLimit,
			},
		);

		const platformImage =
			sharedImage && (await isImageEnabledFor(ctx, platform))
				? sharedImage
				: undefined;

		try {
			const result = await adapter.postStatus({ text, url, image: platformImage });
			await recordShare(ctx, {
				postId,
				collection: input.collection,
				platform,
				status: "success",
				postedAt: new Date().toISOString(),
				externalId: result.externalId,
				postUrl: result.url,
				attempts: 1,
			});
			ctx.log.info(
				`[social-share] ${platform}: posted ${result.url}`,
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			ctx.log.error(`[social-share] ${platform}: ${message}`);
			try {
				await recordShare(ctx, {
					postId,
					collection: input.collection,
					platform,
					status: "failed",
					postedAt: new Date().toISOString(),
					error: message,
					attempts: 1,
				});
			} catch (recordErr) {
				ctx.log.error(
					`[social-share] ${platform}: failed to record failure`,
					recordErr,
				);
			}
		}
	}
}

async function resolveEntryUrl(
	ctx: PluginContext,
	collection: string,
	slug: string,
): Promise<string> {
	let pattern: string | null = null;
	try {
		const info = await getCollectionInfo(collection);
		pattern = info?.urlPattern ?? null;
	} catch {
		// Fall through to default path.
	}
	const path = pattern
		? pattern.replace(/\{slug\}/g, slug)
		: `/${collection}/${slug}`;
	return ctx.url(path);
}

async function isImageEnabledFor(
	ctx: PluginContext,
	platform: PlatformId,
): Promise<boolean> {
	const value = await ctx.kv.get<boolean>(`settings:${platform}:attachImage`);
	return value ?? true;
}

async function anyImageToggleOn(
	ctx: PluginContext,
	platforms: PlatformId[],
): Promise<boolean> {
	for (const p of platforms) {
		if (await isImageEnabledFor(ctx, p)) return true;
	}
	return false;
}

async function determineEnabledPlatforms(
	ctx: PluginContext,
): Promise<PlatformId[]> {
	const enabled: PlatformId[] = [];

	if (
		(await ctx.kv.get<boolean>("settings:bluesky:enabled")) &&
		(await getBlueskyCredentials(ctx))
	) {
		enabled.push("bluesky");
	}
	if (
		(await ctx.kv.get<boolean>("settings:mastodon:enabled")) &&
		(await getMastodonCredentials(ctx))
	) {
		enabled.push("mastodon");
	}
	if (
		(await ctx.kv.get<boolean>("settings:x:enabled")) &&
		(await getXCredentials(ctx))
	) {
		enabled.push("x");
	}
	return enabled;
}

async function createAdapter(
	ctx: PluginContext,
	platform: PlatformId,
): Promise<NetworkAdapter | null> {
	switch (platform) {
		case "bluesky":
			return createBlueskyAdapter(ctx);
		case "mastodon":
			return createMastodonAdapter(ctx);
		case "x":
			return createXAdapter(ctx);
	}
}

export async function testNetwork(
	ctx: PluginContext,
	platform: PlatformId,
): Promise<{ success: true } | { success: false; error: string }> {
	try {
		const adapter = await createAdapter(ctx, platform);
		if (!adapter) return { success: false, error: "Adapter not implemented yet" };
		await adapter.testConnection();
		return { success: true };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
