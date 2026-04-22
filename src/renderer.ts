export interface RenderContext {
	title: string;
	url: string;
	excerpt: string;
	tags: string[];
}

export interface RenderOptions {
	template: string;
	appendHashtags: boolean;
	hashtagMaxCount: number;
	charLimit: number;
}

export function renderStatus(
	rc: RenderContext,
	opts: RenderOptions,
): string {
	const hashtagBlock = buildHashtagBlock(rc.tags, opts);

	const full = interpolate(opts.template, rc) + hashtagBlock;
	if (full.length <= opts.charLimit) return full;

	const withoutHashtags = interpolate(opts.template, rc);
	if (withoutHashtags.length <= opts.charLimit) return withoutHashtags;

	if (rc.excerpt) {
		const withoutExcerpt = interpolate(opts.template, { ...rc, excerpt: "" })
			.replace(/\n{3,}/g, "\n\n")
			.trim();
		if (withoutExcerpt.length <= opts.charLimit) return withoutExcerpt;
	}

	return hardTruncate(withoutHashtags, rc.url, opts.charLimit);
}

function interpolate(template: string, rc: RenderContext): string {
	return template
		.replace(/\{title\}/g, rc.title)
		.replace(/\{url\}/g, rc.url)
		.replace(/\{excerpt\}/g, rc.excerpt)
		.replace(
			/\{tags\}/g,
			rc.tags.map((t) => `#${sanitizeHashtag(t)}`).join(" "),
		);
}

function buildHashtagBlock(tags: string[], opts: RenderOptions): string {
	if (!opts.appendHashtags || tags.length === 0) return "";
	const clipped = tags.slice(0, opts.hashtagMaxCount);
	return "\n\n" + clipped.map((t) => `#${sanitizeHashtag(t)}`).join(" ");
}

function sanitizeHashtag(tag: string): string {
	return tag.replace(/[^a-zA-Z0-9_]/g, "");
}

function hardTruncate(text: string, url: string, limit: number): string {
	const ellipsis = "…";
	const urlIndex = text.lastIndexOf(url);
	if (urlIndex === -1) {
		return text.slice(0, Math.max(0, limit - ellipsis.length)) + ellipsis;
	}
	const tail = text.slice(urlIndex);
	if (tail.length >= limit) {
		return url.length <= limit ? url : url.slice(0, limit);
	}
	const available = limit - tail.length - ellipsis.length - 1;
	if (available <= 0) return tail.slice(-limit);
	const head = text.slice(0, urlIndex).trimEnd();
	return head.slice(0, available).trimEnd() + ellipsis + "\n\n" + tail.trimStart();
}
