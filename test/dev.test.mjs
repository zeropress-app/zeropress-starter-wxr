import assert from 'node:assert/strict';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture, command, freePort, stop, waitFor } from './helpers.mjs';
import { wordpressExport } from './fixtures.mjs';

test('watches atomic WXR and override replacements, and recovers from import errors', { timeout: 90_000 }, async (t) => {
  let dev;
  const root = await fixture(t, () => dev && stop(dev));
  const port = await freePort();
  dev = command(root, ['run', 'dev', '--', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', '0']);
  const origin = 'http://127.0.0.1:' + port;
  async function response(path) {
    try {
      const result = await fetch(origin + path, { signal: AbortSignal.timeout(1_000) });
      return { status: result.status, body: await result.text() };
    } catch { return { status: 0, body: '' }; }
  }
  async function contains(path, text) {
    assert.equal(dev.child.exitCode, null, dev.output());
    const result = await response(path);
    return result.status === 200 && result.body.includes(text);
  }
  await waitFor(() => contains('/', 'Try ZeroPress'), 'Local preview did not start.', dev.output);
  assert.equal((await response('/try-your-export/')).status, 200);
  const nativeSearch = await response('/_zeropress/search.json');
  assert.equal(nativeSearch.status, 200);
  assert.ok(JSON.parse(nativeSearch.body).some(item => item.url === '/try-your-export/'));
  assert.match((await response('/_zeropress/search.js')).body, /search\.json/);
  assert.equal((await response('/wordpress-export.xml')).status, 404);
  assert.equal((await response('/.zeropress-wxr/zeropress-preview-data.json')).status, 404);
  assert.equal((await response('/wxr-import-base.json')).status, 404);
  assert.equal((await response('/wxr-import-base.override.json')).status, 404);

  await writeFile(join(root, 'replacement.xml'), wordpressExport({ slug: 'updated' }));
  await rename(join(root, 'replacement.xml'), join(root, 'wordpress-export.xml'));
  await waitFor(() => contains('/', '/updated/'), 'The replaced export did not rebuild.', dev.output);
  // Wrangler can observe the new index before its asset routes finish reloading.
  await waitFor(async () => (await response('/updated/')).status === 200, 'The new route did not appear.', dev.output);
  await waitFor(async () => (await response('/try-your-export/')).status === 404, 'The old route was not removed.', dev.output);

  await writeFile(join(root, 'wordpress-export.xml'), '<rss><channel>');
  await waitFor(() => dev.output().includes('The preview keeps the last successful build.'), 'Import error was not reported.', dev.output);
  assert.equal(await contains('/', '/updated/'), true);
  await writeFile(join(root, 'wordpress-export.xml'), wordpressExport({ slug: 'recovered' }));
  await waitFor(() => contains('/', '/recovered/'), 'Preview did not recover.', dev.output);

  const base = JSON.parse(await readFile(join(root, 'wxr-import-base.json'), 'utf8'));
  base.site.title = 'Updated settings';
  await writeFile(join(root, 'wxr-import-base.json'), JSON.stringify(base));
  await waitFor(() => contains('/', 'Updated settings'), 'Import settings did not rebuild.', dev.output);

  const overrideFile = join(root, 'wxr-import-base.override.json');
  await writeFile(join(root, 'replacement.json'), JSON.stringify({ site: { title: 'Persistent title' }, comments: { enabled: false } }));
  await rename(join(root, 'replacement.json'), overrideFile);
  await waitFor(() => contains('/', 'Persistent title'), 'The replaced override did not rebuild.', dev.output);
  await waitFor(async () => {
    const post = await response('/recovered/');
    return post.status === 200 && !post.body.includes('data-zp-comments-target-public-id');
  }, 'The override did not disable comments in the post.', dev.output);

  const beforeFailure = dev.output().length;
  await writeFile(overrideFile, '{"site":{"posts_per_page":"8"}}');
  await waitFor(() => dev.output().slice(beforeFailure).includes('The preview keeps the last successful build.'), 'Invalid override did not report an error.', dev.output);
  assert.equal(await contains('/', 'Persistent title'), true);
  await writeFile(overrideFile, '{}');
  await waitFor(() => contains('/', 'Updated settings'), 'Preview did not recover after fixing the override.', dev.output);
  await stop(dev);
  await waitFor(async () => (await response('/')).status === 0, 'Local preview did not stop.', dev.output);
});
