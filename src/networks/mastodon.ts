import type { PluginContext } from "emdash";
import { filenameFor } from "../images";
import type { NetworkAdapter, ShareRequest, ShareResult } from "./types";

const MASTODON_MAX_IMAGE_BYTES = 10_485_760;

interface Credentials {
	instance: string;
	accessToken: string;
}

export async function getMastodonCredentials(
	ctx: PluginContext,
): Promise<Credentials | null> {
	const instance = await ctx.kv.get<string>("creds:mastodon:instance");
	const accessToken = await ctx.kv.get<string>("creds:mastodon:accessToken");
	if (!instance || !accessToken) return null;
	return {
		instance: normalizeInstance(instance),
		accessToken,
	};
}

function normalizeInstance(raw: string): string {
	let s = raw.trim();
	if (!s.startsWith("http://") && !s.startsWith("https://")) {
		s = `https://${s}`;
	}
	return s.replace(/\/+$/, "");
}

export function createMastodonAdapter(ctx: PluginContext): NetworkAdapter {
	return {
		id: "mastodon",
		charLimit: 500,

		async testConnection() {
			if (!ctx.http) {
				throw new Error("Mastodon adapter requires network:fetch capability");
			}
			const creds = await getMastodonCredentials(ctx);
			if (!creds) throw new Error("Mastodon credentials not configured");
			const res = await ctx.http.fetch(
				`${creds.instance}/api/v1/accounts/verify_credentials`,
				{
					headers: { Authorization: `Bearer ${creds.accessToken}` },
				},
			);
			if (!res.ok) {
				const text = await safeText(res);
				throw new Error(
					`Mastodon verify_credentials failed (${res.status}): ${text.slice(0, 200)}`,
				);
			}
		},

		async postStatus(req: ShareRequest): Promise<ShareResult> {
			if (!ctx.http) {
				throw new Error("Mastodon adapter requires network:fetch capability");
			}
			const creds = await getMastodonCredentials(ctx);
			if (!creds) throw new Error("Mastodon credentials not configured");

			const mediaIds: string[] = [];
			if (req.image) {
				if (req.image.bytes.byteLength > MASTODON_MAX_IMAGE_BYTES) {
					console.warn(
						`[social-share] mastodon: image ${req.image.bytes.byteLength}B exceeds 10MB limit — posting text-only`,
					);
				} else {
					const id = await uploadMedia(ctx, creds, req.image);
					if (id) mediaIds.push(id);
				}
			}

			const body: Record<string, unknown> = {
				status: req.text,
				visibility: "public",
			};
			if (mediaIds.length > 0) body.media_ids = mediaIds;

			const res = await ctx.http.fetch(`${creds.instance}/api/v1/statuses`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${creds.accessToken}`,
					"Content-Type": "application/json",
					"Idempotency-Key": crypto.randomUUID(),
				},
				body: JSON.stringify(body),
			});
			if (!res.ok) {
				const text = await safeText(res);
				throw new Error(
					`Mastodon status post failed (${res.status}): ${text.slice(0, 200)}`,
				);
			}
			const json = (await res.json()) as { id?: string; url?: string };
			if (!json.id || !json.url) {
				throw new Error("Mastodon status post returned incomplete response");
			}
			return { externalId: json.id, url: json.url };
		},
	};
}

async function uploadMedia(
	ctx: PluginContext,
	creds: Credentials,
	image: NonNullable<ShareRequest["image"]>,
): Promise<string | null> {
	if (!ctx.http) throw new Error("Mastodon uploadMedia requires network:fetch");
	const form = new FormData();
	form.append(
		"file",
		new Blob([image.bytes], { type: image.contentType }),
		filenameFor(image.contentType),
	);
	if (image.alt) form.append("description", image.alt);

	const res = await ctx.http.fetch(`${creds.instance}/api/v1/media`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${creds.accessToken}`,
		},
		body: form,
	});
	if (!res.ok) {
		const text = await safeText(res);
		console.warn(
			`[social-share] mastodon: media upload failed (${res.status}): ${text.slice(0, 200)}`,
		);
		return null;
	}
	const json = (await res.json()) as { id?: string };
	return json.id ?? null;
}

async function safeText(res: Response): Promise<string> {
	try {
		return await res.text();
	} catch {
		return "";
	}
}
