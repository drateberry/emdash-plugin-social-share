import { after, definePlugin } from "emdash";
import type { PluginContext } from "emdash";
import { sharePost } from "./share";
import { handleAdminInteraction } from "./ui/routes";

export default definePlugin({
	hooks: {
		"content:afterPublish": {
			priority: 220,
			timeout: 20_000,
			errorPolicy: "continue",
			handler: async (event, ctx: PluginContext) => {
				after(async () => {
					try {
						await sharePost(ctx, {
							content: event.content,
							collection: event.collection,
						});
					} catch (error) {
						ctx.log.error("[social-share] sharePost threw", error);
					}
				});
			},
		},

		"plugin:install": {
			handler: async (_event, ctx: PluginContext) => {
				ctx.log.info("[social-share] installed");
			},
		},

		"plugin:uninstall": {
			handler: async (_event, ctx: PluginContext) => {
				ctx.log.info("[social-share] uninstalled");
			},
		},
	},

	routes: {
		admin: {
			handler: async (routeCtx, ctx: PluginContext) => {
				const interaction = (routeCtx.input ?? {}) as Parameters<
					typeof handleAdminInteraction
				>[0];
				return handleAdminInteraction(interaction, ctx);
			},
		},
	},
});
