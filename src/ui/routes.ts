import type { PluginContext } from "emdash";
import { testNetwork } from "../share";
import { buildSettingsPage } from "./settings";
import { getRecentShares } from "../dedup";

type AdminInteraction = {
	type: string;
	page?: string;
	action_id?: string;
	block_id?: string;
	values?: Record<string, unknown>;
};

export async function handleAdminInteraction(
	interaction: AdminInteraction,
	ctx: PluginContext,
): Promise<{ blocks: unknown[]; toast?: { message: string; type: string } }> {
	if (interaction.type === "page_load") {
		return renderPage(interaction.page ?? "/settings", ctx);
	}

	if (interaction.type === "form_submit") {
		if (interaction.action_id === "save_global") {
			return saveGlobal(ctx, interaction.values ?? {});
		}
		if (interaction.action_id === "save_bluesky") {
			return saveBluesky(ctx, interaction.values ?? {});
		}
		if (interaction.action_id === "save_mastodon") {
			return saveMastodon(ctx, interaction.values ?? {});
		}
		if (interaction.action_id === "save_x") {
			return saveX(ctx, interaction.values ?? {});
		}
	}

	if (interaction.type === "block_action") {
		if (interaction.action_id === "test_bluesky") {
			return testPlatform(ctx, "bluesky", "Bluesky");
		}
		if (interaction.action_id === "test_mastodon") {
			return testPlatform(ctx, "mastodon", "Mastodon");
		}
		if (interaction.action_id === "test_x") {
			return testPlatform(ctx, "x", "X");
		}
	}

	return { blocks: [] };
}

async function renderPage(page: string, ctx: PluginContext) {
	switch (page) {
		case "/settings":
			return buildSettingsPage(ctx);
		case "/posts":
			return {
				blocks: [
					{ type: "header", text: "Posts & Sharing" },
					{
						type: "context",
						text: "Per-post share status with manual Share now / Retry — coming in the next slice.",
					},
				],
			};
		case "/log":
			return buildLogPage(ctx);
		case "widget:recent-shares":
			return buildWidget(ctx);
		default:
			return { blocks: [{ type: "context", text: `Unknown page: ${page}` }] };
	}
}

async function saveGlobal(
	ctx: PluginContext,
	values: Record<string, unknown>,
) {
	if (typeof values.enabled === "boolean") {
		await ctx.kv.set("settings:enabled", values.enabled);
	}
	if (typeof values.collections === "string") {
		await ctx.kv.set("settings:collections", values.collections);
	}
	if (typeof values.template === "string" && values.template !== "") {
		await ctx.kv.set("settings:template", values.template);
	}
	const page = await buildSettingsPage(ctx);
	return { ...page, toast: { message: "Global settings saved", type: "success" } };
}

async function saveBluesky(
	ctx: PluginContext,
	values: Record<string, unknown>,
) {
	if (typeof values.blueskyEnabled === "boolean") {
		await ctx.kv.set("settings:bluesky:enabled", values.blueskyEnabled);
	}
	if (typeof values.blueskyAttachImage === "boolean") {
		await ctx.kv.set("settings:bluesky:attachImage", values.blueskyAttachImage);
	}
	if (typeof values.blueskyHandle === "string") {
		await ctx.kv.set("creds:bluesky:handle", values.blueskyHandle);
	}
	if (
		typeof values.blueskyAppPassword === "string" &&
		values.blueskyAppPassword !== ""
	) {
		await ctx.kv.set("creds:bluesky:appPassword", values.blueskyAppPassword);
	}
	const page = await buildSettingsPage(ctx);
	return { ...page, toast: { message: "Bluesky settings saved", type: "success" } };
}

async function saveMastodon(
	ctx: PluginContext,
	values: Record<string, unknown>,
) {
	if (typeof values.mastodonEnabled === "boolean") {
		await ctx.kv.set("settings:mastodon:enabled", values.mastodonEnabled);
	}
	if (typeof values.mastodonAttachImage === "boolean") {
		await ctx.kv.set(
			"settings:mastodon:attachImage",
			values.mastodonAttachImage,
		);
	}
	if (typeof values.mastodonInstance === "string") {
		await ctx.kv.set("creds:mastodon:instance", values.mastodonInstance);
	}
	if (
		typeof values.mastodonAccessToken === "string" &&
		values.mastodonAccessToken !== ""
	) {
		await ctx.kv.set(
			"creds:mastodon:accessToken",
			values.mastodonAccessToken,
		);
	}
	const page = await buildSettingsPage(ctx);
	return {
		...page,
		toast: { message: "Mastodon settings saved", type: "success" },
	};
}

async function saveX(ctx: PluginContext, values: Record<string, unknown>) {
	if (typeof values.xEnabled === "boolean") {
		await ctx.kv.set("settings:x:enabled", values.xEnabled);
	}
	if (typeof values.xAttachImage === "boolean") {
		await ctx.kv.set("settings:x:attachImage", values.xAttachImage);
	}
	if (typeof values.xConsumerKey === "string") {
		await ctx.kv.set("creds:x:consumerKey", values.xConsumerKey);
	}
	if (
		typeof values.xConsumerSecret === "string" &&
		values.xConsumerSecret !== ""
	) {
		await ctx.kv.set("creds:x:consumerSecret", values.xConsumerSecret);
	}
	if (typeof values.xAccessToken === "string") {
		await ctx.kv.set("creds:x:accessToken", values.xAccessToken);
	}
	if (
		typeof values.xAccessTokenSecret === "string" &&
		values.xAccessTokenSecret !== ""
	) {
		await ctx.kv.set(
			"creds:x:accessTokenSecret",
			values.xAccessTokenSecret,
		);
	}
	const page = await buildSettingsPage(ctx);
	return {
		...page,
		toast: { message: "X settings saved", type: "success" },
	};
}

async function testPlatform(
	ctx: PluginContext,
	platform: "bluesky" | "mastodon" | "x",
	displayName: string,
) {
	const result = await testNetwork(ctx, platform);
	const page = await buildSettingsPage(ctx);
	if (result.success) {
		return {
			...page,
			toast: { message: `${displayName}: auth OK`, type: "success" },
		};
	}
	return {
		...page,
		toast: { message: `${displayName}: ${result.error}`, type: "error" },
	};
}

async function buildLogPage(ctx: PluginContext) {
	const recent = await getRecentShares(ctx, 50);
	if (recent.length === 0) {
		return {
			blocks: [
				{ type: "header", text: "Share Log" },
				{ type: "context", text: "No shares yet." },
			],
		};
	}
	const rows = recent.map(({ record }) => ({
		platform: record.platform,
		status: record.status,
		postedAt: record.postedAt,
		postId: record.postId,
		url: record.postUrl ?? "",
		error: record.error ?? "",
	}));
	return {
		blocks: [
			{ type: "header", text: "Share Log" },
			{
				type: "table",
				block_id: "shares-table",
				page_action_id: "shares_page",
				columns: [
					{ key: "postedAt", label: "When", format: "relative_time" },
					{ key: "platform", label: "Platform", format: "text" },
					{ key: "status", label: "Status", format: "badge" },
					{ key: "postId", label: "Post", format: "text" },
					{ key: "url", label: "Link", format: "text" },
					{ key: "error", label: "Error", format: "text" },
				],
				rows,
			},
		],
	};
}

async function buildWidget(ctx: PluginContext) {
	const recent = await getRecentShares(ctx, 10);
	const successful = recent.filter((r) => r.record.status === "success").length;
	const failed = recent.filter((r) => r.record.status === "failed").length;
	const lastLine =
		recent.length === 0
			? "No shares yet. Configure a network in Social Share Settings."
			: `Last: ${recent[0].record.platform} — ${recent[0].record.status}`;
	return {
		blocks: [
			{
				type: "stats",
				items: [
					{ label: "Shared (last 10)", value: String(successful) },
					{ label: "Failed", value: String(failed) },
				],
			},
			{ type: "context", text: lastLine },
		],
	};
}
