import type { PluginContext } from "emdash";

export async function buildSettingsPage(ctx: PluginContext): Promise<{
	blocks: unknown[];
}> {
	const enabled =
		(await ctx.kv.get<boolean>("settings:enabled")) ?? true;
	const template =
		(await ctx.kv.get<string>("settings:template")) ?? "{title}\n\n{url}";
	const collections =
		(await ctx.kv.get<string>("settings:collections")) ?? "posts";

	const blueskyEnabled =
		(await ctx.kv.get<boolean>("settings:bluesky:enabled")) ?? false;
	const blueskyAttachImage =
		(await ctx.kv.get<boolean>("settings:bluesky:attachImage")) ?? true;
	const blueskyHandle =
		(await ctx.kv.get<string>("creds:bluesky:handle")) ?? "";
	const storedAppPassword = await ctx.kv.get<string>("creds:bluesky:appPassword");
	const blueskyAppPasswordSet =
		typeof storedAppPassword === "string" && storedAppPassword !== "";

	const mastodonEnabled =
		(await ctx.kv.get<boolean>("settings:mastodon:enabled")) ?? false;
	const mastodonAttachImage =
		(await ctx.kv.get<boolean>("settings:mastodon:attachImage")) ?? true;
	const mastodonInstance =
		(await ctx.kv.get<string>("creds:mastodon:instance")) ?? "";
	const storedMastodonToken = await ctx.kv.get<string>(
		"creds:mastodon:accessToken",
	);
	const mastodonTokenSet =
		typeof storedMastodonToken === "string" && storedMastodonToken !== "";

	const xEnabled =
		(await ctx.kv.get<boolean>("settings:x:enabled")) ?? false;
	const xAttachImage =
		(await ctx.kv.get<boolean>("settings:x:attachImage")) ?? true;
	const xConsumerKey =
		(await ctx.kv.get<string>("creds:x:consumerKey")) ?? "";
	const xAccessToken =
		(await ctx.kv.get<string>("creds:x:accessToken")) ?? "";
	const xConsumerSecretSet =
		typeof (await ctx.kv.get<string>("creds:x:consumerSecret")) === "string" &&
		(await ctx.kv.get<string>("creds:x:consumerSecret")) !== "";
	const xAccessTokenSecretSet =
		typeof (await ctx.kv.get<string>("creds:x:accessTokenSecret")) ===
			"string" &&
		(await ctx.kv.get<string>("creds:x:accessTokenSecret")) !== "";
	const xUsername = (await ctx.kv.get<string>("state:x:username")) ?? "";

	return {
		blocks: [
			{ type: "header", text: "Social Share Settings" },
			{
				type: "context",
				text: "Automatically share newly published posts to Bluesky, Mastodon, and X. Post URLs come from each collection's urlPattern (configured on the collection itself).",
			},
			{ type: "divider" },
			{
				type: "form",
				block_id: "global-settings",
				fields: [
					{
						type: "toggle",
						action_id: "enabled",
						label: "Enable Social Share (master switch)",
						initial_value: enabled,
					},
					{
						type: "text_input",
						action_id: "collections",
						label: "Collections to auto-share (comma-separated slugs)",
						initial_value: collections,
						placeholder: "posts",
					},
					{
						type: "text_input",
						action_id: "template",
						label: "Status template ({title}, {url}, {excerpt}, {tags})",
						initial_value: template,
						placeholder: "{title}\n\n{url}",
						multiline: true,
					},
				],
				submit: {
					label: "Save global settings",
					action_id: "save_global",
				},
			},
			{ type: "divider" },
			{ type: "header", text: "Bluesky" },
			{
				type: "context",
				text: blueskyAppPasswordSet
					? "App password saved. Leave blank below to keep it; enter a new one to replace."
					: "No app password yet. Create one at https://bsky.app/settings/app-passwords and paste below.",
			},
			{
				type: "form",
				block_id: "bluesky-settings",
				fields: [
					{
						type: "toggle",
						action_id: "blueskyEnabled",
						label: "Auto-share to Bluesky",
						initial_value: blueskyEnabled,
					},
					{
						type: "toggle",
						action_id: "blueskyAttachImage",
						label: "Attach featured image (max 1MB)",
						initial_value: blueskyAttachImage,
					},
					{
						type: "text_input",
						action_id: "blueskyHandle",
						label: "Handle (e.g. yourname.bsky.social)",
						initial_value: blueskyHandle,
						placeholder: "yourname.bsky.social",
					},
					{
						type: "secret_input",
						action_id: "blueskyAppPassword",
						label: "App password",
						placeholder: "xxxx-xxxx-xxxx-xxxx",
						has_value: blueskyAppPasswordSet,
					},
				],
				submit: {
					label: "Save Bluesky settings",
					action_id: "save_bluesky",
				},
			},
			{
				type: "actions",
				elements: [
					{
						type: "button",
						label: "Test Bluesky connection",
						action_id: "test_bluesky",
						style: "primary",
					},
				],
			},
			{ type: "divider" },
			{ type: "header", text: "Mastodon" },
			{
				type: "context",
				text: mastodonTokenSet
					? "Access token saved. Leave blank below to keep it; enter a new one to replace."
					: "Create an access token at https://{your-instance}/settings/applications → New application → scopes: write:statuses. Copy 'Your access token'.",
			},
			{
				type: "form",
				block_id: "mastodon-settings",
				fields: [
					{
						type: "toggle",
						action_id: "mastodonEnabled",
						label: "Auto-share to Mastodon",
						initial_value: mastodonEnabled,
					},
					{
						type: "toggle",
						action_id: "mastodonAttachImage",
						label: "Attach featured image (max 10MB)",
						initial_value: mastodonAttachImage,
					},
					{
						type: "text_input",
						action_id: "mastodonInstance",
						label: "Instance URL",
						initial_value: mastodonInstance,
						placeholder: "mastodon.social",
					},
					{
						type: "secret_input",
						action_id: "mastodonAccessToken",
						label: "Access token",
						placeholder: "xxxxxxxxxxxxxxxxxxxxxxx",
						has_value: mastodonTokenSet,
					},
				],
				submit: {
					label: "Save Mastodon settings",
					action_id: "save_mastodon",
				},
			},
			{
				type: "actions",
				elements: [
					{
						type: "button",
						label: "Test Mastodon connection",
						action_id: "test_mastodon",
						style: "primary",
					},
				],
			},
			{ type: "divider" },
			{ type: "header", text: "X" },
			{
				type: "context",
				text: xUsername
					? `Authenticated as @${xUsername}. Create tokens at https://developer.x.com → Project → App → Keys and tokens. You need all four: API Key + Secret (consumer), Access Token + Secret (user-context with write access).`
					: "Create tokens at https://developer.x.com → Project → App → Keys and tokens. You need all four: API Key + Secret (consumer), Access Token + Secret (user-context with write access). App permissions must be Read and Write.",
			},
			{
				type: "form",
				block_id: "x-settings",
				fields: [
					{
						type: "toggle",
						action_id: "xEnabled",
						label: "Auto-share to X",
						initial_value: xEnabled,
					},
					{
						type: "toggle",
						action_id: "xAttachImage",
						label: "Attach featured image (max 5MB)",
						initial_value: xAttachImage,
					},
					{
						type: "text_input",
						action_id: "xConsumerKey",
						label: "API Key (Consumer Key)",
						initial_value: xConsumerKey,
					},
					{
						type: "secret_input",
						action_id: "xConsumerSecret",
						label: "API Key Secret (Consumer Secret)",
						has_value: xConsumerSecretSet,
					},
					{
						type: "text_input",
						action_id: "xAccessToken",
						label: "Access Token",
						initial_value: xAccessToken,
					},
					{
						type: "secret_input",
						action_id: "xAccessTokenSecret",
						label: "Access Token Secret",
						has_value: xAccessTokenSecretSet,
					},
				],
				submit: {
					label: "Save X settings",
					action_id: "save_x",
				},
			},
			{
				type: "actions",
				elements: [
					{
						type: "button",
						label: "Test X connection",
						action_id: "test_x",
						style: "primary",
					},
				],
			},
		],
	};
}
