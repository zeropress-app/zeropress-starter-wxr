import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { fixture, build, command, readPublication } from './helpers.mjs';
import { wordpressExport, sample } from './fixtures.mjs';

test('starter preserves a single 5 MiB body through import, build and Pagefind', async t => {
  const root = await fixture(t);
  const original = await readFile(join(root, 'wordpress-export.xml'), 'utf8');
  const bodyBytes = 5 * 1024 * 1024;
  const start = '<p>capacitytoken ';
  const end = ' endofbodytoken</p>';
  const paddingBytes = bodyBytes - Buffer.byteLength(start + end);
  const content = start + 'example '.repeat(Math.ceil(paddingBytes / 8)).slice(0, paddingBytes) + end;
  assert.equal(Buffer.byteLength(content), bodyBytes);
  const large = original.replace(/<content:encoded>[\s\S]*?<\/content:encoded>/, '<content:encoded><![CDATA[' + content + ']]></content:encoded>');
  assert.notEqual(large, original);
  await writeFile(join(root, 'wordpress-export.xml'), large);
  const result = await build(root);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /CONTENT_BODY_LARGE/);
  const data = await readPublication(root);
  assert.equal(data.content.posts.find(p => p.public_id === 101).content, content);
  assert.ok((await readFile(join(root, 'dist/try-your-export/index.html'), 'utf8')).includes(content));
  await readFile(join(root, 'dist/_zeropress/pagefind/pagefind.js'));
  assert.equal(await readFile(join(root, 'wordpress-export.xml'), 'utf8'), large);
  for (const name of await readdir(join(root, 'dist'), { recursive: true })) assert.doesNotMatch(name, /wordpress-export|wxr-import-base|zeropress-preview-data/);
});

test('converts WordPress content offline and preserves original media, links, and comment IDs', async (t) => {
  const root = await fixture(t);
  const source = await readFile(join(root, 'wordpress-export.xml'), 'utf8');
  await writeFile(join(root, 'public/download.txt'), 'A public download.');
  const result = await build(root);
  assert.equal(result.code, 0, result.output);
  assert.equal((result.output.match(/Converted WXR to ZeroPress preview-data successfully/g) || []).length, 1);
  const html = await readFile(join(root, 'dist/try-your-export/index.html'), 'utf8');
  assert.match(html, /href="https:\/\/wordpress\.example\/blog\/original\/\?ref=trial#reading"/);
  assert.match(html, /src="https:\/\/wordpress\.example\/blog\/wp-content\/uploads\/2026\/09\/example\.jpg"/);
  assert.match(html, /data-zp-comments-api-base-url="https:\/\/wordpress\.example\/blog\/wp-json\/wp\/v2"/);
  assert.match(html, /data-zp-comments-target-public-id="101"/);
  const page = await readFile(join(root, 'dist/about/index.html'), 'utf8');
  assert.match(page, /data-zp-comments-target-type="page"/);
  assert.match(page, /data-zp-comments-target-public-id="201"/);
  const data = await readPublication(root);
  assert.equal(data.content.posts.length, 8);
  assert.equal(data.site.comments.provider, 'wordpress');
  assert.equal(data.site.url, '');
  assert.match(html, /class="article-featured-image" src="https:\/\/wordpress\.example\/blog\/wp-content\/uploads\/2026\/09\/example\.jpg"/);
  assert.doesNotMatch(html, /data-zp-comments-source/);
  const adapter = await readFile(join(root, 'dist/_zeropress/search.js'), 'utf8');
  assert.equal(adapter, await readFile(join(root, 'dist/_zeropress/search_pagefind.js'), 'utf8'));
  await readFile(join(root, 'dist/_zeropress/pagefind/pagefind.js'));
  await assert.rejects(readFile(join(root, 'dist/_zeropress/search.json')), { code: 'ENOENT' });
  assert.equal(await readFile(join(root, 'dist/download.txt'), 'utf8'), 'A public download.');
  assert.equal(await readFile(join(root, 'wordpress-export.xml'), 'utf8'), source);
  assert.match(await readFile(join(root, 'dist/robots.txt'), 'utf8'), /Disallow: \//);
  for (const path of await readdir(join(root, 'dist'), { recursive: true })) {
    assert.ok(!path.startsWith('.zeropress-wxr') && path !== 'wordpress-export.xml' && path !== 'wxr-import-base.json' && path !== 'wxr-import-base.override.json', `Private source file was published: ${path}`);
    assert.ok(!path.endsWith('.jpg'), `WordPress media was downloaded: ${path}`);
    if (path.endsWith('.html')) {
      const document = await readFile(join(root, 'dist', path), 'utf8');
      assert.doesNotMatch(document, /PRIVATE-DRAFT-CONTENT|PROTECTED-CONTENT|PRIVATE-EXPORTED-COMMENT|private@example\.com|synthetic-password/);
    }
  }
});

test('keeps the previous site on malformed exports and replaces old routes after a valid update', async (t) => {
  const root = await fixture(t);
  assert.equal((await build(root)).code, 0);
  const previous = await readFile(join(root, 'dist/index.html'), 'utf8');
  await writeFile(join(root, 'wordpress-export.xml'), '<rss><channel>');
  const failed = await build(root);
  assert.notEqual(failed.code, 0, failed.output);
  assert.doesNotMatch(failed.output, /Built ZeroPress site successfully|\[Pagefind\] Generating/);
  assert.equal(await readFile(join(root, 'dist/index.html'), 'utf8'), previous);
  await writeFile(join(root, 'wordpress-export.xml'), wordpressExport({ slug: 'new-export' }));
  const updated = await build(root);
  assert.equal(updated.code, 0, updated.output);
  assert.match(await readFile(join(root, 'dist/index.html'), 'utf8'), /href="\/new-export\/"/);
  await readFile(join(root, 'dist/new-export/index.html'));
  await assert.rejects(readFile(join(root, 'dist/try-your-export/index.html')), { code: 'ENOENT' });
});

test('keeps user overrides across base replacements and disables comments without an endpoint', async (t) => {
  const root = await fixture(t);
  const baseFile = join(root, 'wxr-import-base.json');
  const overrideFile = join(root, 'wxr-import-base.override.json');
  const originalBase = await readFile(baseFile, 'utf8');
  const originalXml = await readFile(join(root, 'wordpress-export.xml'), 'utf8');
  const override = JSON.stringify({
    site: { title: 'Persistent site', posts_per_page: 3 },
    comments: { enabled: false },
    custom_css: { content: '.site-title { letter-spacing: 0.03125em; }' },
  });
  await writeFile(overrideFile, override);
  let result = await build(root);
  assert.equal(result.code, 0, result.output);
  let data = await readPublication(root);
  assert.equal(data.site.title, 'Persistent site');
  assert.equal(data.site.posts_per_page, 3);
  assert.equal(Object.hasOwn(data.site, 'comments'), false);
  assert.equal(data.custom_css.content, JSON.parse(override).custom_css.content);
  const article = await readFile(join(root, 'dist/try-your-export/index.html'), 'utf8');
  assert.doesNotMatch(article, /data-zp-comments-target-public-id/);
  const files = await readdir(join(root, 'dist'), { recursive: true });
  const styles = await Promise.all(files.filter(file => file.endsWith('.css')).map(file => readFile(join(root, 'dist', file), 'utf8')));
  assert.ok([article, ...styles].some(text => text.includes('0.03125em')), 'Custom CSS was not published');
  assert.equal(files.includes('wxr-import-base.override.json'), false);
  await readFile(join(root, 'dist/page/3/index.html'));
  assert.equal(await readFile(baseFile, 'utf8'), originalBase);
  assert.equal(await readFile(join(root, 'wordpress-export.xml'), 'utf8'), originalXml);
  assert.equal(await readFile(overrideFile, 'utf8'), override);

  const replacementBase = JSON.parse(originalBase);
  replacementBase.site.title = 'WordPress title';
  replacementBase.site.posts_per_page = 7;
  await writeFile(baseFile, JSON.stringify(replacementBase));
  result = await build(root);
  assert.equal(result.code, 0, result.output);
  data = await readPublication(root);
  assert.equal(data.site.title, 'Persistent site');
  assert.equal(data.site.posts_per_page, 3);
  assert.equal(await readFile(overrideFile, 'utf8'), override);

  await writeFile(overrideFile, '{}');
  result = await build(root);
  assert.equal(result.code, 0, result.output);
  data = await readPublication(root);
  assert.equal(data.site.title, 'WordPress title');
  assert.equal(data.site.posts_per_page, 7);
  assert.equal(data.site.comments.enabled, true);
});

test('renders rich WXR content, nested menus, and Blog widgets offline', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'wordpress-export.xml'), sample);
  const result = await build(root);
  assert.equal(result.code, 0, result.output);
  assert.match(await readFile(join(root, 'dist/index.html'), 'utf8'), /Try ZeroPress/);
  assert.match(await readFile(join(root, 'dist/about/index.html'), 'utf8'), /About this preview/);
  const home = await readFile(join(root, 'dist/index.html'), 'utf8');
  assert.match(home, /widget-card--recent-posts/);
  assert.match(home, /widget-card--categories/);
  assert.match(home, /widget-card--tags/);
  assert.match(home, /widget-card--archives/);
  assert.match(home, /site-nav__submenu--nested/);
  assert.match(home, /data-cmdk-open/);
  assert.match(home, /href="\/page\/2\/"/);
  const data = await readPublication(root);
  const visitMenu = async (items) => {
    for (const item of items) {
      await readFile(join(root, 'dist', item.url.slice(1), 'index.html'));
      await visitMenu(item.children);
    }
  };
  await visitMenu(data.menus.primary.items);
  await visitMenu(data.menus.footer.items);
  await readFile(join(root, 'dist/page/2/index.html'));
  const article = await readFile(join(root, 'dist/notes-on-typography/index.html'), 'utf8');
  assert.match(article, /<table>/);
  assert.match(article, /<figcaption>/);
  assert.match(article, /<pre/);
  assert.match(article, /<h2>Give the text room<\/h2>/);
  assert.match(article, /data-pagefind-meta="title"/);
  assert.match(article, /Alex Morgan/);
  const colophon = await readFile(join(root, 'dist/about/colophon/index.html'), 'utf8');
  assert.match(colophon, /type-study\.svg/);
  for (const file of ['demo/reading-desk.svg', 'demo/type-study.svg']) {
    assert.deepEqual(await readFile(join(root, 'dist', file)), await readFile(join(root, 'public', file)));
  }
});


test('builds and indexes the existing publication without importing WXR again', async (t) => {
  const root = await fixture(t);
  const imported = await command(root, ['run', 'import']).done;
  assert.equal(imported.code, 0, imported.output);
  const manifestPath = join(root, '.zeropress-wxr/zeropress-preview-data.manifest.json');
  const manifest = await readFile(manifestPath);
  await rm(join(root, 'wordpress-export.xml'));

  const { stdout, stderr } = await promisify(execFile)(process.execPath,
    ['scripts/build-site.mjs', '--skip-search-index', '--pagefind'], {
      cwd: root,
      env: {
        ...process.env, CI: 'true', NO_COLOR: '1',
        NODE_OPTIONS: `--import=${new URL('./no-network.mjs', import.meta.url).href}`,
      },
      timeout: 30_000,
    });
  assert.match(stdout, /Built ZeroPress site successfully/);
  assert.doesNotMatch(stdout + stderr, /Converted WXR/);
  assert.deepEqual(await readFile(manifestPath), manifest);
  assert.match(await readFile(join(root, 'dist/try-your-export/index.html'), 'utf8'), /Your WordPress content/);
  await readFile(join(root, 'dist/_zeropress/pagefind/pagefind.js'));
  await assert.rejects(readFile(join(root, 'dist/_zeropress/search.json')), { code: 'ENOENT' });
});

test('skips native indexing in production and lets Pagefind index the actual HTML', async (t) => {
  const root = await fixture(t);
  // Inspect native skip output before the separate Pagefind replacement.
  const site = await command(root, ['run', 'build:site', '--', '--skip-search-index']).done;
  assert.equal(site.code, 0, site.output);
  assert.equal((site.output.match(/Converted WXR to ZeroPress preview-data successfully/g) || []).length, 1);
  assert.equal((site.output.match(/NATIVE_SEARCH_INDEX_SKIPPED/g) || []).length, 1);
  const searchDirectory = join(root, 'dist/_zeropress');
  assert.deepEqual(JSON.parse(await readFile(join(searchDirectory, 'search.json'), 'utf8')), [{
    id: 'zeropress:search-omitted', type: 'page', title: '', url: '/', excerpt: '',
    headings: [], categories: [], tags: [], published_at_iso: '', updated_at_iso: '', content_text: '',
  }]);
  await assert.rejects(readFile(join(searchDirectory, 'pagefind/pagefind-entry.json')), { code: 'ENOENT' });

  const indexed = await command(root, ['run', 'search:replace-with-pagefind']).done;
  assert.equal(indexed.code, 0, indexed.output);
  const entry = JSON.parse(await readFile(join(searchDirectory, 'pagefind/pagefind-entry.json'), 'utf8'));
  const data = await readPublication(root);
  assert.equal(Object.values(entry.languages).reduce((count, language) => count + language.page_count, 0),
    data.content.posts.length + data.content.pages.length);
  assert.equal(await readFile(join(searchDirectory, 'search.js'), 'utf8'),
    await readFile(join(searchDirectory, 'search_pagefind.js'), 'utf8'));
  await assert.rejects(readFile(join(searchDirectory, 'search.json')), { code: 'ENOENT' });
});

test('Pagefind uses the captured build header after the manifest changes', async (t) => {
  const root = await fixture(t);
  const site = await command(root, ['run', 'build:site', '--', '--skip-search-index']).done;
  assert.equal(site.code, 0, site.output);
  const file = join(root, '.zeropress-wxr/zeropress-preview-data.manifest.json');
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  const header = structuredClone(manifest.data);
  manifest.data.site.search = { enabled: false };
  await writeFile(file, JSON.stringify(manifest));
  // A completed build needs its header, not another read of its source bodies.
  await rm(join(root, '.zeropress-wxr', manifest.generation), { recursive: true });
  const { replaceSearchWithPagefind } = await import(pathToFileURL(join(root, 'scripts/replace-search-with-pagefind.mjs')));
  await replaceSearchWithPagefind(header);
  await readFile(join(root, 'dist/_zeropress/pagefind/pagefind.js'));
  await assert.rejects(readFile(join(root, 'dist/_zeropress/search.json')), { code: 'ENOENT' });
});

for (const setting of ['site', 'theme']) {
  test(`builds without search artifacts when search is disabled in the ${setting}`, async (t) => {
    const root = await fixture(t);
    const file = join(root, setting === 'site' ? 'wxr-import-base.json' : 'theme/theme.json');
    const config = JSON.parse(await readFile(file, 'utf8'));
    if (setting === 'site') config.site.search.enabled = false;
    else config.features.search = false;
    await writeFile(file, JSON.stringify(config));
    const result = await build(root);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Search is disabled; skipping replacement/);
    assert.doesNotMatch(result.output, /NATIVE_SEARCH_INDEX_/);
    for (const name of ['search.json', 'search.js', 'search_pagefind.js', 'pagefind/pagefind.js']) {
      await assert.rejects(readFile(join(root, 'dist/_zeropress', name)), { code: 'ENOENT' });
    }
    assert.match(await readFile(join(root, 'dist/try-your-export/index.html'), 'utf8'), /Your WordPress content/);
  });
}

test('adapts the Blog sidebar to a replacement export with no menus', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'wordpress-export.xml'), `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"
      xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
      <channel><title>Orchard notebook</title><link>https://orchard.example/</link><language>en-US</language>
        <pubDate>Sun, 20 Sep 2026 09:00:00 +0000</pubDate>
        <wp:wxr_version>1.2</wp:wxr_version>
        <wp:author><wp:author_id>9</wp:author_id><wp:author_login>gardener</wp:author_login><wp:author_display_name>Sam Gardener</wp:author_display_name></wp:author>
        <item><title>The autumn harvest</title><link>https://orchard.example/harvest/</link><dc:creator>gardener</dc:creator>
          <content:encoded><![CDATA[<h2>A day in the orchard</h2><p>The pears are ready.</p>]]></content:encoded>
          <wp:post_id>901</wp:post_id><wp:post_name>harvest</wp:post_name><wp:post_type>post</wp:post_type>
          <wp:post_date_gmt>2026-09-01 09:00:00</wp:post_date_gmt><wp:post_modified_gmt>2026-09-01 09:00:00</wp:post_modified_gmt><wp:status>publish</wp:status><wp:comment_status>closed</wp:comment_status>
          <category domain="category" nicename="gardening">Gardening</category>
        </item>
      </channel>
    </rss>`);
  const result = await build(root);
  assert.equal(result.code, 0, result.output);
  const home = await readFile(join(root, 'dist/index.html'), 'utf8');
  assert.match(home, /Orchard notebook/);
  assert.match(home, /The autumn harvest/);
  assert.match(home, /Gardening/);
  assert.match(home, /widget-card--recent-posts/);
  assert.match(home, /widget-card--archives/);
  const href = /<h2><a href="([^"]+)">The autumn harvest<\/a>/.exec(home)?.[1];
  assert.ok(href, 'The imported post has a listing link');
  const file = href.endsWith('/') ? `${href}index.html` : href;
  const article = await readFile(join(root, 'dist', file.slice(1)), 'utf8');
  assert.match(article, /Sam Gardener/);
  assert.match(article, /The pears are ready/);
  const data = await readPublication(root);
  assert.deepEqual(data.content.posts.map(post => post.public_id), [901]);
  await readFile(join(root, 'dist/_zeropress/pagefind/pagefind.js'));
});

test('keeps an empty native index when an export has no published content', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'wordpress-export.xml'), sample.replaceAll('<![CDATA[publish]]>', '<![CDATA[draft]]>'));
  const result = await build(root);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /No searchable posts or pages/);
  assert.doesNotMatch(result.output, /NATIVE_SEARCH_INDEX_/);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'dist/_zeropress/search.json'), 'utf8')), []);
  await assert.rejects(readFile(join(root, 'dist/_zeropress/pagefind/pagefind.js')), { code: 'ENOENT' });
});
