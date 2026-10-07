# ZeroPress WXR Starter

Try ZeroPress with an export from your WordPress site. Your posts and pages become
a static site using the Blog theme from `@zeropress/create-theme`; your images
and comments stay on WordPress.

The included sample has eight posts, two pages, two authors, nested menus,
category and monthly archives, tables, code, and small bundled illustrations.
Search, sidebar widgets, and light and dark colors are ready to use.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/zeropress-app/zeropress-starter-wxr/tree/latest)

## Try your WordPress content

1. Use the button to create a repository and deploy the included sample site.
   Keep the default commands: `npm run build` and `npm run deploy`.
2. In WordPress, open **Tools → Export**, choose **All content**, and download
   the WXR `.xml` file.
3. Replace `wordpress-export.xml` at the repository root with your export,
   keeping that filename. Commit and push to rebuild your site.

Choose a private repository if your export contains private data, such as
commenters' email addresses. The export itself is not served by the deployed site.

To refresh the site later, replace the same XML file with a new export and push.
Each build replaces the previous generated site, including removing old pages.

## What stays on WordPress

- Images are loaded from their existing URLs. No media files are downloaded or moved.
- Links in post and page content keep their original URLs. They can lead back
  to WordPress; the generated post lists and navigation open the static pages.
- Comments are read from the WordPress REST API using the original post or page
  ID. Submitted comments go to WordPress and follow its moderation settings.
  Comment records in the WXR file are not published.

Keep the original WordPress site and its media available. The comment API must
allow requests from your new site's origin. WordPress also needs to allow
[anonymous REST comments](https://developer.wordpress.org/reference/hooks/rest_allow_anonymous_comments/)
for visitors to submit from this site. If it refuses a request, the comment area
provides a link to the original page. No WordPress credentials are needed here.

The sample export has comments closed. Replacing it with an export containing
posts with open comments enables their comment areas automatically.

## Scope

Published posts, pages, categories, tags, and menus are imported. Drafts, private
content, and password-protected posts are excluded. WordPress plugins, shortcodes,
and PHP-powered features do not run in the static site.

This is a quick trial that continues to depend on WordPress. For a full move,
import your WXR into [ZeroPress Studio](https://github.com/zeropress-app/zeropress-studio)
and publish to a separate [Studio Starter](https://github.com/zeropress-app/zeropress-starter-studio)
repository.

## Local preview

Use Node.js 22.22.0 or later; `.node-version` selects Node.js 24.

```sh
npm ci
npm run dev
```

The preview rebuilds when `wordpress-export.xml`, `wxr-import-base.json`, `theme/`,
or `public/` changes. A failed import keeps the last successful preview.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Watch the export, rebuild, and serve locally |
| `npm run build` | Convert WXR, build the site in `dist/`, and replace search with Pagefind |
| `npm run preview` | Build and preview the deployment output, including Pagefind |
| `npm run deploy` | Deploy the existing `dist/` |
| `npm run deploy:dry-run` | Build and validate deployment without uploading |
| `npm test` | Check importing, page generation, and comments |
| `npm run format:wrangler` | Format `wrangler.jsonc` |

Site information and the comment API address are inferred from the export.
`wxr-import-base.json` disallows crawling by default and leaves the new site URL
empty, so no domain setup is required. Generated Preview Data is written to
`.zeropress-wxr/zeropress-preview-data.json`, outside the published files, and is
excluded from Git.

## Blog settings

`wxr-import-base.json` controls presentation without editing the imported
content. The defaults enable search and monthly archives and show five posts
per listing page. The title, description, language, authors, and content still
come from your WXR file.

The sidebar lists recent posts, categories, tags, and archives from each import.
No sample profile or sample article links are added to your own export. To hide
the sidebar widgets, add `"widgets": {}` at the top level of the base file. To
customize them, start with the `widgets` object in the generated
`.zeropress-wxr/zeropress-preview-data.json` and copy it into your base file.

The header displays the imported `primary` menu with up to three levels; the
footer displays one level. Deeper items remain in Preview Data but are omitted
from the rendered navigation with a build warning. Edit menus in WordPress and
export again. An export without menus still has the home link, search, and
content-based sidebar.

Edit `theme/` for layout and colors. Its WordPress comment adapter preserves
on-demand pagination, request timeouts, and a link to the original comment page.
The illustrations in `public/demo/` are only for the included sample articles;
you can remove them after replacing the sample export. User media URLs are
not rewritten or downloaded.

If you give the preview its own domain, set `site.url` in the base file to that
origin to enable canonical URLs and the sitemap. Crawling remains disabled
until you explicitly set `site.robots.allow_indexing` to `true`.

## Search

Local development uses ZeroPress's built-in search. Production builds use
[Pagefind](https://pagefind.app/) with the Blog theme's existing search dialog.
Use `npm run preview` to check Pagefind locally.

After WXR import and the site build, `postbuild` runs
`search:replace-with-pagefind`. It generates `dist/_zeropress/pagefind/`, replaces
`search.js` with the generated Pagefind adapter, and removes the unused
`search.json`. Pagefind is installed with the project; no search service or API
token is needed. If indexing fails, the build fails before adapter replacement.

Pagefind indexes the marked content of published posts and pages, excluding
navigation, sidebar text, and comments. Drafts and password-protected posts
are not published or indexed. Pagefind uses its own ranking and language handling.

Set `site.search.enabled` to `false` in `wxr-import-base.json` to disable search
and skip Pagefind. An export without searchable content keeps an empty native
index. To keep built-in search in production, remove `postbuild` from
`package.json` and rebuild. You can also remove `search:replace-with-pagefind`,
its script, and the Pagefind dependency if you no longer use them.

## License

MIT
