import { after } from "emdash";
import type { PluginContext } from "emdash";
import type { SandboxedPlugin } from "emdash/plugin";
import { sharePost } from "./share";
import { handleAdminInteraction } from "./ui/routes";

// Standard-format entries are a plain object, not definePlugin() — since
// emdash 1.0, definePlugin() requires an `id` and is reserved for native
// plugins. Identity and capabilities come from the descriptor in index.ts.
export default {
	hooks: {
		"content:afterPublish": {
			priority: 220,
			timeout: 20_000,
			errorPolicy: "continue",
			handler: async (event, ctx) => {
				after(async () => {
					try {
						await sharePost(ctx as PluginContext, {
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
			handler: async (_event, ctx) => {
				ctx.log.info("[social-share] installed");
			},
		},

		"plugin:uninstall": {
			handler: async (_event, ctx) => {
				ctx.log.info("[social-share] uninstalled");
			},
		},
	},

	routes: {
		admin: {
			handler: async (routeCtx, ctx) => {
				const interaction = (routeCtx.input ?? {}) as Parameters<
					typeof handleAdminInteraction
				>[0];
				return handleAdminInteraction(interaction, ctx as PluginContext);
			},
		},
	},
} satisfies SandboxedPlugin;
