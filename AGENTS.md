# Agent guide

This is a standalone ZeroPress site built from WordPress content. Read
[README.md](README.md) for setup and commands, and inspect the current theme
before editing: this copy may already contain the site owner's customizations.
Content may come from an active WordPress site or a saved WXR export from a
closed site. Do not assume WordPress or ZeroPress Static is available or required.

## Work within this project

- Use the Node.js version in `.node-version` and install locked dependencies with
  `npm ci`. Work from this repository; no sibling checkout is required.
- For design requests, start with `theme/` and any needed site assets in `public/`.
  Change publishing inputs, build scripts, dependencies, or hosting configuration
  only when the requested work requires it, and explain the reason.
- Preserve existing content, URLs, and enabled features unless the user asks to
  change them. Customize the current theme rather than replacing the whole site
  with a freshly generated starter.

## Source files and generated output

| Path | Role |
| --- | --- |
| `theme/` | Editable templates, styles, and browser JavaScript |
| `public/` | Site assets copied to the published site; keep private files out |
| `wordpress-export.xml` | Single-file WordPress content input |
| `wordpress-export.manifest.json`, `wordpress-export.parts/` | Alternative split WXR content input; keep one complete generation together |
| `zeropress-wxr-input-v1.json` | Exact-byte starter capability marker; update only with compatible scripts and importer |
| `wxr-import-base.json` | Site and import settings input |
| `wxr-import-base.override.json` | User-owned partial settings applied over the base on every build |
| `.zeropress-wxr/` | Generated Preview Data; inspect it to understand the content, but edit its source instead |
| `dist/` | Generated site; changes here are replaced by the next build |

Identify how this copy receives content before editing the inputs:

- With ZeroPress Static connected, every publication replaces its WXR content inputs and base settings.
  Manage their content and settings in WordPress; do not put lasting design
  changes in them. Put persistent setting overrides in
  `wxr-import-base.override.json`, which plugin publications do not replace.
- With a manually managed export, the WXR and base file are maintained in this
  repository. Keep the saved WXR unchanged for design-only work; site and import
  settings can be edited in `wxr-import-base.json` when needed. Follow the
  [existing-export guide](README.md#publish-an-existing-export) for restoring public media and disabling
  comments when WordPress is unavailable. Do not require a WordPress reinstall
  for this workflow.

The import coordinator accepts exactly one of XML or a split manifest. Do not
restore an old XML alongside a manifest or edit plugin-owned parts/base independently.
Keep the marker paired with the compatible importer, coordinator and development
watcher; never advertise split support by copying the marker alone. See
[split WXR input](README.md#split-wxr-input) for migration and recovery.
Reject additional import arguments before starting conversion; never silently
drop a requested policy or input/output option.

Keep the override file present (`{}` means no changes). Its values take precedence
over later base updates; remove a property to restore control to WordPress or the
manual base. Ordinary settings merge recursively, while widgets, collections,
menu mappings, and arrays replace in full. Unknown keys warn; invalid known
values fail the build. Do not suppress those errors. Comments can be disabled
with `comments.enabled: false` without an API URL.

Keep design changes in `theme/` and needed assets in `public/`. Preserve the
input filenames and import/build flow for theme-only work.

## WordPress publishing and recovery

With ZeroPress Static 1.1.0, the processing method and WXR publishing format are
separate settings. Files processing on Linux/Unix supports single or split XML
and pause/continue. Memory processing supports single XML only, including with
Automatic; it is optional on Linux/Unix and mandatory on Windows/IIS. Its XML/base
total and each encoded upload must fit 8 MiB, with separate resource checks.
There is no automatic switch to Files. An existing split export requires explicit
Single XML selection and transition approval before Memory can publish it.

Check retained publication status before retrying. Finish or cancel unfinished
work before changing the method. An expired publication must be cancelled before
preparing again; expired preparation without a started job only needs re-preparation.
Use Continue publication only when offered for Files processing. Memory cannot
resume interrupted work. Verify uncertain final writes with Check publication
result before cancellation or another publication; never clear the journal or
repeat the final write to bypass uncertainty. Keep the
[recovery guide](README.md#if-preparation-or-publication-stops) aligned with these rules.

## Chunk build inputs

`npm run import` writes a manifest and immutable parts under `.zeropress-wxr/`.
Keep the import step explicit in the `build` and `build:site` package scripts.
`scripts/build-site.mjs` consumes existing generated input without running import.
It opens one generation for core and passes its header to Pagefind. Keep this
snapshot boundary and the private/public separation. Inspect
manifest `data` for site settings and follow collection descriptors for content;
do not concatenate all parts to call the legacy object API. Stop builds/previews
before deleting old generated input directories. Keep XML/base/override source
ownership and dev watcher recovery unchanged. Use published package dependencies
so this repository remains installable without sibling checkouts.

## Body admission policies

Default import/build commands warn from 256 KiB without a fixed body ceiling.
Preserve complete accepted content and existing format/resource checks, including
the single 5 MiB body regression. ZeroPress Static 1.1.0 has a separate 4 MiB
per-post/page body limit; do not impose it on manually managed exports.
Optional `--max-body-bytes` / API
`maxBodyBytes` must be set independently on importer and builder. Do not put it
in base/override JSON or assume npm wrappers forward it. This does not add
Base64/data-URL image support.

## Theme rules

The bundled theme uses Theme Runtime `0.7`. Read the linked contract when adding
template behavior; the helpers are not JavaScript expressions or a general-purpose
Mustache/Handlebars engine.

- Keep exactly one `{{slot:content}}` in `theme/layout.html`. Retain the page title
  and `{{meta.head_tags}}` so generated metadata continues to appear.
- Put shared scripts in partials, following `theme/partials/theme-init.html`;
  direct `<script>` tags in `layout.html` are not supported.
- Use the documented context for each template: for example, `post` in
  `post.html`, `page` in `page.html`, and `posts.items` in post listings.
  Missing fields can render blank even when validation passes, so check the
  rendered content. Use provided URLs instead of constructing them from slugs.
- Coordinate markup changes with the JavaScript that uses it. The existing
  theme uses `data-*` attributes for menus, search, theme switching, and comments.
  These hooks can change if their consumers change with them.
- When retaining search, keep its enabled-state checks, functional search UI,
  and Pagefind content/metadata markers. Preserve the exclusion of delisted
  content from search. Check the production search build as well as local dev.
- When retaining comments, keep `partials/comments-island.html`,
  `assets/comment.js`, and `assets/comment-data.js` working together. Avoid
  rewriting API transport or writing-policy behavior for a visual change.
- Check feature declarations in `theme/theme.json` when intentionally removing
  or replacing a feature. Keep template behavior and declarations consistent.

## Preview and verification

- `npm run dev`: watch sources and preview locally with built-in search.
- `npm run build:site`: import, validate, and build with native search. Dev uses
  this command without the production skip option or Pagefind hooks.
- `npm run build`: import, build with `--skip-search-index`, then run Pagefind
  when search is enabled and searchable content exists. The requested-skip
  warning is expected; Pagefind indexes HTML and removes the placeholder index.
- `npm run preview`: build and preview the deployment output, including Pagefind.
- `npm test`: run the repository's import, build, preview, search, and comment tests.
- `npm run check`: check Wrangler formatting, run tests, and build and validate
  deployment without uploading. It regenerates `dist/`.

Check the home page, representative posts and pages, menus, and pagination at
desktop and mobile widths. Check enabled search, comments, and light/dark modes.
Use the site's content to catch long titles, missing images, and empty lists.
Report any checks that could not be completed. Local validation does not require
publishing; run `npm run deploy` only when deployment is requested.

Keep the production skip option paired with Pagefind. Removing only `--pagefind`
leaves native search with no matches; remove `--skip-search-index` too when
intentionally switching production to native search. Native indexing warns at
2 MiB and is omitted at 5 MiB or more than 5,000 records. Search disabled in the
site or theme produces no search artifacts; zero searchable records retain
`[]` and skip Pagefind. Preserve these cases when changing build commands.

Some tests assert the original Blog theme's classes and markup. For a failure,
distinguish an intentional design/feature change from a regression. Update or
remove obsolete assertions when the requirement changes, while retaining checks
for functionality still in use. Do not delete the test suite or suppress an
unexplained failure just to make checks pass. Explain intentional test changes
when handing the work back to the user.

## References

- [Theme authoring guide](https://zeropress.dev/guides/theme-authoring/)
- [Theme Runtime v0.7](https://zeropress.dev/reference/theme-runtime/specs/v0.7/)
- [Preview Data v0.7](https://zeropress.dev/reference/preview-data/specs/v0.7/)

Use the contracts that match this project's theme and dependencies. An AI design
tool's standalone HTML or React output still needs to be adapted to these
templates and the site's actual content before it can be used here.
