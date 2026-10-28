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
| `wordpress-export.xml` | WordPress content input |
| `wxr-import-base.json` | Site and import settings input |
| `wxr-import-base.override.json` | User-owned partial settings applied over the base on every build |
| `.zeropress-wxr/` | Generated Preview Data; inspect it to understand the content, but edit its source instead |
| `dist/` | Generated site; changes here are replaced by the next build |

Identify how this copy receives content before editing the inputs:

- With ZeroPress Static connected, every publication replaces both input files.
  Manage their content and settings in WordPress; do not put lasting design
  changes in them. Put persistent setting overrides in
  `wxr-import-base.override.json`, which plugin publications do not replace.
- With a manually managed export, the WXR and base file are maintained in this
  repository. Keep the saved WXR unchanged for design-only work; site and import
  settings can be edited in `wxr-import-base.json` when needed. Follow the
  [existing-export guide](README.md#publish-an-existing-export) for restoring public media and disabling
  comments when WordPress is unavailable. Do not require a WordPress reinstall
  for this workflow.

Keep the override file present (`{}` means no changes). Its values take precedence
over later base updates; remove a property to restore control to WordPress or the
manual base. Ordinary settings merge recursively, while widgets, collections,
menu mappings, and arrays replace in full. Unknown keys warn; invalid known
values fail the build. Do not suppress those errors. Comments can be disabled
with `comments.enabled: false` without an API URL.

Keep design changes in `theme/` and needed assets in `public/`. Preserve the
input filenames and import/build flow for theme-only work.

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
- `npm run build`: import, validate, and build the site, then run Pagefind when
  search is enabled.
- `npm run preview`: build and preview the deployment output, including Pagefind.
- `npm test`: run the repository's import, build, preview, search, and comment tests.
- `npm run check`: check Wrangler formatting, run tests, and build and validate
  deployment without uploading. It regenerates `dist/`.

Check the home page, representative posts and pages, menus, and pagination at
desktop and mobile widths. Check enabled search, comments, and light/dark modes.
Use the site's content to catch long titles, missing images, and empty lists.
Report any checks that could not be completed. Local validation does not require
publishing; run `npm run deploy` only when deployment is requested.

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
