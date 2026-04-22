export interface OAuth1Config {
	consumerKey: string;
	consumerSecret: string;
	accessToken: string;
	accessTokenSecret: string;
}

export async function buildOAuth1Header(
	method: string,
	url: string,
	config: OAuth1Config,
	extraParams: Record<string, string> = {},
): Promise<string> {
	const oauthParams: Record<string, string> = {
		oauth_consumer_key: config.consumerKey,
		oauth_token: config.accessToken,
		oauth_signature_method: "HMAC-SHA1",
		oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
		oauth_nonce: generateNonce(),
		oauth_version: "1.0",
	};

	const parsedUrl = new URL(url);
	const queryParams: Record<string, string> = {};
	parsedUrl.searchParams.forEach((v, k) => {
		queryParams[k] = v;
	});
	const allParams = { ...oauthParams, ...queryParams, ...extraParams };

	const paramString = Object.keys(allParams)
		.sort()
		.map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
		.join("&");

	const baseUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;
	const baseString = [
		method.toUpperCase(),
		percentEncode(baseUrl),
		percentEncode(paramString),
	].join("&");

	const signingKey = `${percentEncode(config.consumerSecret)}&${percentEncode(config.accessTokenSecret)}`;
	oauthParams.oauth_signature = await hmacSha1(signingKey, baseString);

	return (
		"OAuth " +
		Object.keys(oauthParams)
			.sort()
			.map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
			.join(", ")
	);
}

function percentEncode(s: string): string {
	return encodeURIComponent(s)
		.replace(/!/g, "%21")
		.replace(/\*/g, "%2A")
		.replace(/'/g, "%27")
		.replace(/\(/g, "%28")
		.replace(/\)/g, "%29");
}

function generateNonce(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

async function hmacSha1(key: string, message: string): Promise<string> {
	const enc = new TextEncoder();
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		enc.encode(key),
		{ name: "HMAC", hash: "SHA-1" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
	const bytes = new Uint8Array(sig);
	let binary = "";
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}
