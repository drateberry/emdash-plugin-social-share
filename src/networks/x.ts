import type { PluginContext } from "emdash";
import { filenameFor } from "../images";
import { buildOAuth1Header } from "../oauth1";
import type { NetworkAdapter, ShareRequest, ShareResult } from "./types";

interface Credentials {
	consumerKey: string;
	consumerSecret: string;
	accessToken: string;
	accessTokenSecret: string;
}

const API_HOST = "https://api.x.com";
const WEB_HOST = "https://x.com";
const UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json";
const X_MAX_IMAGE_BYTES = 5_242_880;

export async function getXCredentials(
	ctx: PluginContext,
): Promise<Credentials | null> {
	const consumerKey = await ctx.kv.get<string>("creds:x:consumerKey");
	const consumerSecret = await ctx.kv.get<string>("creds:x:consumerSecret");
	const accessToken = await ctx.kv.get<string>("creds:x:accessToken");
	const accessTokenSecret = await ctx.kv.get<string>(
		"creds:x:accessTokenSecret",
	);
	if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
		return null;
	}
	return { consumerKey, consumerSecret, accessToken, accessTokenSecret };
}

export function createXAdapter(ctx: PluginContext): NetworkAdapter {
	return {
		id: "x",
		charLimit: 280,

		async testConnection() {
			if (!ctx.http) {
				throw new Error("X adapter requires network:fetch capability");
			}
			const creds = await getXCredentials(ctx);
			if (!creds) throw new Error("X credentials not configured");

			const url = `${API_HOST}/2/users/me`;
			const authHeader = await buildOAuth1Header("GET", url, creds);
			const res = await ctx.http.fetch(url, {
				headers: { Authorization: authHeader },
			});
			if (!res.ok) {
				const text = await safeText(res);
				throw new Error(
					`X users/me failed (${res.status}): ${text.slice(0, 200)}`,
				);
			}
			const json = (await res.json()) as {
				data?: { username?: string };
			};
			if (json.data?.username) {
				await ctx.kv.set("state:x:username", json.data.username);
			}
		},

		async postStatus(req: ShareRequest): Promise<ShareResult> {
			if (!ctx.http) {
				throw new Error("X adapter requires network:fetch capability");
			}
			const creds = await getXCredentials(ctx);
			if (!creds) throw new Error("X credentials not configured");

			const mediaIds: string[] = [];
			if (req.image) {
				if (req.image.bytes.byteLength > X_MAX_IMAGE_BYTES) {
					console.warn(
						`[social-share] x: image ${req.image.bytes.byteLength}B exceeds 5MB limit — posting text-only`,
					);
				} else {
					const id = await uploadMedia(ctx, creds, req.image);
					if (id) mediaIds.push(id);
				}
			}

			const body: Record<string, unknown> = { text: req.text };
			if (mediaIds.length > 0) body.media = { media_ids: mediaIds };

			const url = `${API_HOST}/2/tweets`;
			const authHeader = await buildOAuth1Header("POST", url, creds);
			const res = await ctx.http.fetch(url, {
				method: "POST",
				headers: {
					Authorization: authHeader,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
			});
			if (!res.ok) {
				const text = await safeText(res);
				throw new Error(
					`X create tweet failed (${res.status}): ${text.slice(0, 200)}`,
				);
			}
			const json = (await res.json()) as { data?: { id?: string } };
			if (!json.data?.id) throw new Error("X create tweet returned no id");

			const username = await ctx.kv.get<string>("state:x:username");
			const permalink = username
				? `${WEB_HOST}/${username}/status/${json.data.id}`
				: `${WEB_HOST}/i/web/status/${json.data.id}`;
			return { externalId: json.data.id, url: permalink };
		},
	};
}

async function uploadMedia(
	ctx: PluginContext,
	creds: Credentials,
	image: NonNullable<ShareRequest["image"]>,
): Promise<string | null> {
	if (!ctx.http) throw new Error("X uploadMedia requires network:fetch");

	const form = new FormData();
	form.append(
		"media",
		new Blob([image.bytes], { type: image.contentType }),
		filenameFor(image.contentType),
	);

	const authHeader = await buildOAuth1Header("POST", UPLOAD_URL, creds);
	const res = await ctx.http.fetch(UPLOAD_URL, {
		method: "POST",
		headers: { Authorization: authHeader },
		body: form,
	});
	if (!res.ok) {
		const text = await safeText(res);
		console.warn(
			`[social-share] x: media upload failed (${res.status}): ${text.slice(0, 200)}`,
		);
		return null;
	}
	const json = (await res.json()) as {
		media_id_string?: string;
		media_id?: number;
	};
	const id = json.media_id_string ?? (json.media_id ? String(json.media_id) : null);
	if (!id) return null;

	if (image.alt) {
		try {
			await setMediaAlt(ctx, creds, id, image.alt);
		} catch (error) {
			console.warn(`[social-share] x: failed to set alt text`, error);
		}
	}
	return id;
}

async function setMediaAlt(
	ctx: PluginContext,
	creds: Credentials,
	mediaId: string,
	alt: string,
): Promise<void> {
	if (!ctx.http) return;
	const metadataUrl = "https://upload.twitter.com/1.1/media/metadata/create.json";
	const authHeader = await buildOAuth1Header("POST", metadataUrl, creds);
	await ctx.http.fetch(metadataUrl, {
		method: "POST",
		headers: {
			Authorization: authHeader,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			media_id: mediaId,
			alt_text: { text: alt.slice(0, 1000) },
		}),
	});
}

async function safeText(res: Response): Promise<string> {
	try {
		return await res.text();
	} catch {
		return "";
	}
}
