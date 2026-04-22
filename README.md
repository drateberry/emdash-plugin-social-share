# @drateberry/emdash-plugin-social-share

Automatically share newly published [EmDash CMS](https://emdashcms.com/) posts to **Bluesky**, **Mastodon**, and **X** (Twitter), with optional featured-image attachment.

Publishing a post fires one post per enabled network. Each share is deduped via the plugin's own storage collection, so re-publishing a post won't double-post unless you explicitly ask for it.

## Features

- **Three networks** — Bluesky (AT Protocol), Mastodon (any instance), X (OAuth 1.0a user context).
- **Featured image attachment** — pulls from the post's SEO image (`content.seo.image`) if set, otherwise falls back to the `featured_image` field. Each network has its own size limit and the plugin skips attachment gracefully if the image is too large for a given platform.
- **Per-network toggles** — enable/disable each network independently, and toggle image attachment per network.
- **URL resolution** — reads the collection's `urlPattern` automatically. No plugin-side URL template to keep in sync.
- **Collection filter** — choose which collections auto-share (default: `posts`).
- **Template variables** — `{title}`, `{url}`, `{excerpt}`, `{tags}` with graceful truncation per platform's char limit.
- **Delivery log** — admin page shows every share attempt with status and timestamps.
- **Dedup** — won't double-post if you republish; uses a `shares` storage collection keyed by `postId + platform`.
- **Test buttons** — per-network "Test connection" in the settings page for fast credential validation.

## Install

```bash
npm install @drateberry/emdash-plugin-social-share
```

Register in `astro.config.mjs`:

```ts
import { socialSharePlugin } from "@drateberry/emdash-plugin-social-share";
import emdash from "emdash/astro";

export default defineConfig({
  integrations: [
    emdash({
      // ...your existing config
      plugins: [socialSharePlugin()],
    }),
  ],
});
```

Requires `emdash >=0.6.0`.

## Configure

Open the admin at `/_emdash/admin/plugins/social-share/settings` and:

1. Set which collections should auto-share (default: `posts`).
2. Edit the status template (default: `{title}\n\n{url}`).
3. Fill in credentials for each network you want to enable. See the sections below for how to obtain them.

### Bluesky

1. Go to [https://bsky.app/settings/app-passwords](https://bsky.app/settings/app-passwords).
2. Create an app password. Give it any name.
3. In the plugin settings, enable Bluesky, enter your handle (e.g. `yourname.bsky.social`), paste the app password.
4. Click **Test Bluesky connection** → green toast means you're good.

**Image limit:** 1 MB per image. Larger images are skipped (text-only post still goes out).

### Mastodon

1. Go to `https://{your-instance}/settings/applications` (e.g. `https://mastodon.social/settings/applications`).
2. Create a new application with at least `write:statuses` scope (and `read` if you want the test button to work).
3. Copy the **access token** (not the client secret).
4. In the plugin settings, enable Mastodon, enter your instance hostname (`mastodon.social` — we add the `https://` for you), paste the access token.
5. Click **Test Mastodon connection**.

**Image limit:** 10 MB per image.

### X (Twitter)

X's API is now pay-per-use (no minimum spend, as of 2026). You still need a developer account and an App configured for OAuth 1.0a user context — the Bearer Token alone can't post.

1. Create an App at [developer.x.com](https://developer.x.com).
2. In the App → **User authentication settings** → Set up:
   - Type: **OAuth 1.0a**
   - App permissions: **Read and Write** (critical; default is Read only)
   - Callback URL: any valid URL works (e.g. `http://localhost:4321/`) — we don't use the OAuth redirect flow
3. Go to **Keys and tokens**:
   - Copy the **API Key** and **API Key Secret** (under "Consumer Keys")
   - Under "Authentication Tokens", **Generate** Access Token and Secret, copy both
4. **Gotcha:** if you generated access tokens BEFORE setting permissions to Read+Write, regenerate them. Token scope is baked in at generation time.
5. Paste all four values into the plugin settings, enable X, test.

**Image limit:** 5 MB per image.

## How triggering works

- The plugin listens to the `content:afterPublish` hook, which fires when you click Publish in the admin.
- Each share attempt is recorded in a `shares` storage collection (indexed by `postId`, `platform`, `status`, `postedAt`).
- Before sharing to a platform, the plugin checks if it's already succeeded for this post — if so, it skips. So hitting Unpublish → Publish doesn't re-share.
- Errors are recorded too. Each platform is independent — if Bluesky posts and Mastodon fails, you get one success row and one failure row.

## Permissions

The plugin declares these capabilities:

| Capability | Why |
|---|---|
| `read:content` | Required by the `content:afterPublish` hook registration |
| `read:media` | Resolve media references on `featured_image` / `seo.image` fields |
| `network:fetch:any` | Post to arbitrary Mastodon instances and the Bluesky/X APIs |

## Known v0.1 limitations

- No retry with backoff — one attempt, then recorded as failure. Use the Share Log page to see what failed.
- No threading on overflow — posts longer than a platform's char limit are truncated (the URL is preserved).
- No hashtag support yet (template `{tags}` variable is a placeholder; taxonomy lookup not wired).
- No manual "Share now" button inline on content entries — all dispatch is via the `content:afterPublish` hook.
- No scheduled-post support — if `publishedAt` is in the future, the plugin doesn't auto-fire when that time arrives. Workaround: explicitly publish when you want to share.

These are all on the roadmap for v0.2+.

## Development

```bash
npm install
npm run build       # one-time build
npm run dev         # watch mode, rebuilds on save
npm run typecheck
```

## License

[0BSD](./LICENSE) — do whatever you want, no warranty.
