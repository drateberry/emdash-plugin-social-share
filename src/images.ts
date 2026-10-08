import type { PluginContext } from "emdash";

export interface PostImage {
	bytes: Uint8Array<ArrayBuffer>;
	contentType: string;
	alt: string;
}

export async function fetchPostImage(
	ctx: PluginContext,
	content: Record<string, unknown>,
): Promise<PostImage | null> {
	const choice = await chooseShareableImage(ctx, content);
	if (!choice) return null;
	if (!ctx.http) {
		ctx.log.warn("[social-share] image fetch requires network:fetch");
		return null;
	}

	const absoluteUrl = resolveUrl(ctx, choice.src);
	const res = await fetchBytes(ctx, absoluteUrl);
	if (!res) return null;
	return {
		bytes: res.bytes,
		contentType: res.contentType,
		alt: choice.alt,
	};
}

async function chooseShareableImage(
	ctx: PluginContext,
	content: Record<string, unknown>,
): Promise<{ src: string; alt: string; source: string } | null> {
	const data = (content.data ?? {}) as Record<string, unknown>;
	const title = typeof data.title === "string" ? data.title : "";

	const seo = content.seo as { image?: unknown } | null | undefined;
	if (seo && typeof seo.image === "string" && seo.image) {
		const resolved = await resolveMediaRef(ctx, seo.image);
		if (resolved) {
			return { src: resolved.src, alt: title, source: "seo.image" };
		}
		ctx.log.warn(
			`[social-share] seo.image "${seo.image}" could not be resolved`,
		);
	}

	const fi = data.featured_image;
	if (typeof fi === "object" && fi !== null) {
		const obj = fi as Record<string, unknown>;
		const fieldAlt = typeof obj.alt === "string" ? obj.alt : "";

		const meta = obj.meta as Record<string, unknown> | undefined;
		if (meta && typeof meta.storageKey === "string" && meta.storageKey) {
			return {
				src: `/_emdash/api/media/file/${meta.storageKey}`,
				alt: fieldAlt,
				source: "featured_image.meta.storageKey",
			};
		}

		if (typeof obj.src === "string" && obj.src) {
			return { src: obj.src, alt: fieldAlt, source: "featured_image.src" };
		}

		if (typeof obj.id === "string" && obj.id) {
			const resolved = await resolveMediaRef(ctx, obj.id);
			if (resolved) {
				return {
					src: resolved.src,
					alt: fieldAlt,
					source: "featured_image.id",
				};
			}
			ctx.log.warn(
				`[social-share] featured_image.id "${obj.id}" could not be resolved`,
			);
		}
	}

	return null;
}

async function resolveMediaRef(
	ctx: PluginContext,
	ref: string,
): Promise<{ src: string } | null> {
	if (/^(https?:\/\/|\/)/.test(ref)) {
		return { src: ref };
	}
	if (!ctx.media) {
		ctx.log.warn(
			"[social-share] media lookup required but ctx.media is unavailable (need read:media)",
		);
		return null;
	}
	try {
		const item = await ctx.media.get(ref);
		if (item?.url) return { src: item.url };
		return null;
	} catch (error) {
		ctx.log.warn(`[social-share] ctx.media.get(${ref}) threw`, error);
		return null;
	}
}

async function fetchBytes(
	ctx: PluginContext,
	url: string,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; contentType: string } | null> {
	let response: Response | null = null;
	try {
		if (!ctx.http) return null;
		response = await ctx.http.fetch(url);
	} catch (error) {
		if (isSsrfBlock(error)) {
			try {
				response = await fetch(url);
			} catch (fallbackError) {
				ctx.log.warn(
					`[social-share] fetch failed for ${url}`,
					fallbackError,
				);
				return null;
			}
		} else {
			ctx.log.warn(`[social-share] image fetch threw for ${url}`, error);
			return null;
		}
	}
	if (!response.ok) {
		ctx.log.warn(`[social-share] image fetch failed ${response.status} ${url}`);
		return null;
	}
	const contentType =
		response.headers.get("Content-Type")?.split(";")[0]?.trim() ||
		guessTypeFromUrl(url) ||
		"application/octet-stream";
	const buffer = await response.arrayBuffer();
	return { bytes: new Uint8Array(buffer), contentType };
}

function isSsrfBlock(error: unknown): boolean {
	if (!error) return false;
	const cause = (error as { cause?: { code?: string } })?.cause;
	if (cause?.code === "SSRF_BLOCKED") return true;
	const message = error instanceof Error ? error.message : String(error);
	return (
		message.includes("SSRF") ||
		message.includes("blocked fetch") ||
		message.includes("internal hosts") ||
		message.includes("private IP")
	);
}

function resolveUrl(ctx: PluginContext, src: string): string {
	const base = (ctx.site && ctx.site.url) || "http://localhost:4321";
	try {
		if (/^https?:\/\//i.test(src)) return new URL(src).toString();
		return new URL(encodeURI(src), base).toString();
	} catch {
		return src;
	}
}

function guessTypeFromUrl(url: string): string | null {
	const lower = url.toLowerCase().split("?")[0];
	if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
	if (lower.endsWith(".png")) return "image/png";
	if (lower.endsWith(".webp")) return "image/webp";
	if (lower.endsWith(".gif")) return "image/gif";
	if (lower.endsWith(".avif")) return "image/avif";
	if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
	return null;
}

export function filenameFor(contentType: string): string {
	const ext = contentType.split("/")[1]?.replace(/\+.*/, "") || "bin";
	return `image.${ext}`;
}
