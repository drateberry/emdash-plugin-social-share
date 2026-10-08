import type { PluginContext } from "emdash";
import type { NetworkAdapter, ShareRequest, ShareResult } from "./types";

interface Credentials {
	handle: string;
	appPassword: string;
}

interface Session {
	accessJwt: string;
	did: string;
	handle: string;
}

const BSKY_HOST = "https://bsky.social";
const BSKY_WEB_HOST = "https://bsky.app";
const BSKY_MAX_IMAGE_BYTES = 976_560;

export async function getBlueskyCredentials(
	ctx: PluginContext,
): Promise<Credentials | null> {
	const handle = await ctx.kv.get<string>("creds:bluesky:handle");
	const appPassword = await ctx.kv.get<string>("creds:bluesky:appPassword");
	if (!handle || !appPassword) return null;
	return { handle, appPassword };
}

async function createSession(
	ctx: PluginContext,
	creds: Credentials,
): Promise<Session> {
	if (!ctx.http) {
		throw new Error("Bluesky adapter requires network:fetch capability");
	}
	const res = await ctx.http.fetch(
		`${BSKY_HOST}/xrpc/com.atproto.server.createSession`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				identifier: creds.handle,
				password: creds.appPassword,
			}),
		},
	);
	if (!res.ok) {
		const text = await safeText(res);
		throw new Error(
			`Bluesky createSession failed (${res.status}): ${text.slice(0, 200)}`,
		);
	}
	const json = (await res.json()) as {
		accessJwt?: string;
		did?: string;
		handle?: string;
	};
	if (!json.accessJwt || !json.did || !json.handle) {
		throw new Error("Bluesky createSession returned incomplete session");
	}
	return {
		accessJwt: json.accessJwt,
		did: json.did,
		handle: json.handle,
	};
}

export function createBlueskyAdapter(ctx: PluginContext): NetworkAdapter {
	return {
		id: "bluesky",
		charLimit: 300,

		async testConnection() {
			const creds = await getBlueskyCredentials(ctx);
			if (!creds) throw new Error("Bluesky credentials not configured");
			await createSession(ctx, creds);
		},

		async postStatus(req: ShareRequest): Promise<ShareResult> {
			if (!ctx.http) {
				throw new Error("Bluesky adapter requires network:fetch capability");
			}
			const creds = await getBlueskyCredentials(ctx);
			if (!creds) throw new Error("Bluesky credentials not configured");
			const session = await createSession(ctx, creds);

			let embed: Record<string, unknown> | undefined;
			if (req.image) {
				if (req.image.bytes.byteLength > BSKY_MAX_IMAGE_BYTES) {
					console.warn(
						`[social-share] bluesky: image ${req.image.bytes.byteLength}B exceeds 1MB limit — posting text-only`,
					);
				} else {
					const blob = await uploadBlob(
						ctx,
						session.accessJwt,
						req.image.bytes,
						req.image.contentType,
					);
					embed = {
						$type: "app.bsky.embed.images",
						images: [{ alt: req.image.alt, image: blob }],
					};
				}
			}

			const record: Record<string, unknown> = {
				$type: "app.bsky.feed.post",
				text: req.text,
				createdAt: new Date().toISOString(),
				langs: ["en"],
				facets: detectLinkFacets(req.text),
			};
			if (embed) record.embed = embed;

			const res = await ctx.http.fetch(
				`${BSKY_HOST}/xrpc/com.atproto.repo.createRecord`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${session.accessJwt}`,
					},
					body: JSON.stringify({
						repo: session.did,
						collection: "app.bsky.feed.post",
						record,
					}),
				},
			);
			if (!res.ok) {
				const text = await safeText(res);
				throw new Error(
					`Bluesky createRecord failed (${res.status}): ${text.slice(0, 200)}`,
				);
			}
			const json = (await res.json()) as { uri?: string; cid?: string };
			if (!json.uri) {
				throw new Error("Bluesky createRecord returned no URI");
			}

			const rkey = json.uri.split("/").pop() ?? "";
			const permalink = `${BSKY_WEB_HOST}/profile/${session.handle}/post/${rkey}`;
			return { externalId: json.uri, url: permalink };
		},
	};
}

async function uploadBlob(
	ctx: PluginContext,
	jwt: string,
	bytes: Uint8Array<ArrayBuffer>,
	contentType: string,
): Promise<unknown> {
	if (!ctx.http) throw new Error("Bluesky uploadBlob requires network:fetch");
	const res = await ctx.http.fetch(
		`${BSKY_HOST}/xrpc/com.atproto.repo.uploadBlob`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${jwt}`,
				"Content-Type": contentType,
			},
			body: bytes,
		},
	);
	if (!res.ok) {
		const text = await safeText(res);
		throw new Error(
			`Bluesky uploadBlob failed (${res.status}): ${text.slice(0, 200)}`,
		);
	}
	const json = (await res.json()) as { blob?: unknown };
	if (!json.blob) throw new Error("Bluesky uploadBlob returned no blob ref");
	return json.blob;
}

async function safeText(res: Response): Promise<string> {
	try {
		return await res.text();
	} catch {
		return "";
	}
}

type Facet = {
	index: { byteStart: number; byteEnd: number };
	features: Array<{ $type: "app.bsky.richtext.facet#link"; uri: string }>;
};

function detectLinkFacets(text: string): Facet[] {
	const facets: Facet[] = [];
	const urlRegex = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)]/g;
	const encoder = new TextEncoder();
	const bytes = encoder.encode(text);
	let match: RegExpExecArray | null;
	while ((match = urlRegex.exec(text)) !== null) {
		const prefixBytes = encoder.encode(text.slice(0, match.index)).byteLength;
		const matchBytes = encoder.encode(match[0]).byteLength;
		facets.push({
			index: {
				byteStart: prefixBytes,
				byteEnd: prefixBytes + matchBytes,
			},
			features: [
				{ $type: "app.bsky.richtext.facet#link", uri: match[0] },
			],
		});
	}
	return facets;
}
