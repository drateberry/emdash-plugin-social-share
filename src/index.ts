import type { PluginDescriptor } from "emdash";

export function socialSharePlugin(): PluginDescriptor {
	return {
		id: "social-share",
		version: "0.2.0",
		format: "standard",
		entrypoint: "@drateberry/emdash-plugin-social-share/sandbox",
		capabilities: ["content:read", "media:read", "network:request:unrestricted"],
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
