import type { PluginDescriptor } from "emdash";

export function socialSharePlugin(): PluginDescriptor {
	return {
		id: "social-share",
		version: "0.1.0",
		format: "standard",
		entrypoint: "@drateberry/emdash-plugin-social-share/sandbox",
		capabilities: ["read:content", "read:media", "network:fetch:any"],
		storage: {
			shares: {
				indexes: ["postId", "platform", "status", "postedAt"],
			},
		},
		adminPages: [
			{ path: "/settings", label: "Social Share Settings", icon: "send" },
			{ path: "/posts", label: "Posts & Sharing", icon: "list" },
			{ path: "/log", label: "Share Log", icon: "history" },
		],
		adminWidgets: [
			{ id: "recent-shares", title: "Social Shares", size: "third" },
		],
	};
}
