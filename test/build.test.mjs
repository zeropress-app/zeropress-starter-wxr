import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture, build } from './helpers.mjs';
import { wordpressExport, sample } from './fixtures.mjs';

test('converts WordPress content offline and preserves original media, links, and comment IDs', async (t) => {
  const root = await fixture(t);
  const source = await readFile(join(root, 'wordpress-export.xml'), 'utf8');
  await writeFile(join(root, 'public/download.txt'), 'A public download.');
  const result = await build(root);
  assert.equal(result.code, 0, result.output);
  const html = await readFile(join(root, 'dist/try-your-export/index.html'), 'utf8');
  assert.match(html, /href="https:\/\/wordpress\.example\/blog\/original\/\?ref=trial#reading"/);
  assert.match(html, /src="https:\/\/wordpress\.example\/blog\/wp-content\/uploads\/2026\/09\/example\.jpg"/);
  assert.match(html, /data-zp-comments-api-base-url="https:\/\/wordpress\.example\/blog\/wp-json\/wp\/v2"/);
  assert.match(html, /data-zp-comments-target-public-id="101"/);
  const page = await readFile(join(root, 'dist/about/index.html'), 'utf8');
  assert.match(page, /data-zp-comments-target-type="page"/);
  assert.match(page, /data-zp-comments-target-public-id="201"/);
  const data = JSON.parse(await readFile(join(root, '.zeropress-wxr/zeropress-preview-data.json'), 'utf8'));
  assert.equal(data.content.posts.length, 8);
  assert.equal(data.site.comments.provider, 'wordpress');
  assert.equal(data.site.url, '');
  assert.match(html, /class="article-featured-image" src="https:\/\/wordpress\.example\/blog\/wp-content\/uploads\/2026\/09\/example\.jpg"/);
  assert.match(html, /data-zp-comments-source/);
  const adapter = await readFile(join(root, 'dist/_zeropress/search.js'), 'utf8');
  assert.equal(adapter, await readFile(join(root, 'dist/_zeropress/search_pagefind.js'), 'utf8'));
  await readFile(join(root, 'dist/_zeropress/pagefind/pagefind.js'));
  await assert.rejects(readFile(join(root, 'dist/_zeropress/search.json')), { code: 'ENOENT' });
  assert.equal(await readFile(join(root, 'dist/download.txt'), 'utf8'), 'A public download.');
  assert.equal(await readFile(join(root, 'wordpress-export.xml'), 'utf8'), source);
  assert.match(await readFile(join(root, 'dist/robots.txt'), 'utf8'), /Disallow: \//);
  for (const path of await readdir(join(root, 'dist'), { recursive: true })) {
    assert.ok(!path.startsWith('.zeropress-wxr') && path !== 'wordpress-export.xml' && path !== 'wxr-import-base.json', `Private source file was published: ${path}`);
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
  assert.equal(await readFile(join(root, 'dist/index.html'), 'utf8'), previous);
  await writeFile(join(root, 'wordpress-export.xml'), wordpressExport({ slug: 'new-export' }));
  const updated = await build(root);
  assert.equal(updated.code, 0, updated.output);
  assert.match(await readFile(join(root, 'dist/index.html'), 'utf8'), /href="\/new-export\/"/);
  await readFile(join(root, 'dist/new-export/index.html'));
  await assert.rejects(readFile(join(root, 'dist/try-your-export/index.html')), { code: 'ENOENT' });
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
  const data = JSON.parse(await readFile(join(root, '.zeropress-wxr/zeropress-preview-data.json'), 'utf8'));
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


test('builds successfully when search is disabled in the import base', async (t) => {
  const root = await fixture(t);
  const file = join(root, 'wxr-import-base.json');
  const base = JSON.parse(await readFile(file, 'utf8'));
  base.site.search.enabled = false;
  await writeFile(file, JSON.stringify(base));
  const result = await build(root);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /Search is disabled; skipping replacement/);
  assert.match(await readFile(join(root, 'dist/try-your-export/index.html'), 'utf8'), /Your WordPress content/);
});

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
  const data = JSON.parse(await readFile(join(root, '.zeropress-wxr/zeropress-preview-data.json'), 'utf8'));
  assert.deepEqual(data.content.posts.map(post => post.public_id), [901]);
  await readFile(join(root, 'dist/_zeropress/pagefind/pagefind.js'));
});

test('keeps an empty native index when an export has no published content', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'wordpress-export.xml'), sample.replaceAll('<![CDATA[publish]]>', '<![CDATA[draft]]>'));
  const result = await build(root);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /No searchable posts or pages/);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'dist/_zeropress/search.json'), 'utf8')), []);
});
