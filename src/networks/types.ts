export type PlatformId = "bluesky" | "mastodon" | "x";

export interface ShareRequest {
	text: string;
	url: string;
	image?: {
		bytes: Uint8Array;
		contentType: string;
		alt: string;
	};
}

export interface ShareResult {
	externalId: string;
	url: string;
}

export interface NetworkAdapter {
	readonly id: PlatformId;
	readonly charLimit: number;
	postStatus(req: ShareRequest): Promise<ShareResult>;
	testConnection(): Promise<void>;
}
