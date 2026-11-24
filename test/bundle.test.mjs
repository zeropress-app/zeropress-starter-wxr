import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture, command, readPublication, freePort, stop, waitFor } from './helpers.mjs';
import { writeBundle } from './bundle-fixtures.mjs';
import { wordpressExport } from './fixtures.mjs';

test('starter chooses exactly one WXR input and preserves complete single/bundle output', async t => {
  const root = await fixture(t);
  const single = await command(root, ['run', 'import']).done;
  assert.equal(single.code, 0, single.output);
  const expected = await readPublication(root);
  await writeBundle(root);
  const both = await command(root, ['run', 'import']).done;
  assert.notEqual(both.code, 0); assert.match(both.output, /Both WXR inputs exist/);
  assert.deepEqual(await readPublication(root), expected);
  await rm(join(root, 'wordpress-export.xml'));
  const split = await command(root, ['run', 'build:site']).done;
  assert.equal(split.code, 0, split.output);
  assert.deepEqual(await readPublication(root), expected);
  // A complete reverse transition must retain the same content and production search.
  await rm(join(root, 'wordpress-export.manifest.json'));
  await rm(join(root, 'wordpress-export.parts'), { recursive: true });
  await writeFile(join(root, 'wordpress-export.xml'), wordpressExport());
  const restored = await command(root, ['run', 'build']).done;
  assert.equal(restored.code, 0, restored.output);
  assert.deepEqual(await readPublication(root), expected);
  await readFile(join(root, 'dist/_zeropress/pagefind/pagefind.js'));
  await assert.rejects(readFile(join(root, 'dist/_zeropress/search.json')), { code: 'ENOENT' });
  const marker = await readFile(join(root, 'zeropress-wxr-input-v1.json'), 'utf8');
  assert.equal(marker, '{"format":"zeropress-wxr-input","version":1,"formats":["xml","bundle-v1"]}\n');
  for (const file of ['wordpress-export.manifest.json', 'wxr-import-base.json', 'zeropress-wxr-input-v1.json']) {
    await assert.rejects(() => readFile(join(root, 'dist', file)), { code: 'ENOENT' });
  }
});

test('dev watches newly created and replaced parts directories, retaining the last build on corruption', { timeout: 90_000 }, async t => {
  let dev;
  const root = await fixture(t, () => dev && stop(dev));
  const port = await freePort();
  dev = command(root, ['run', 'dev', '--', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', '0']);
  async function contains(text) {
    assert.equal(dev.child.exitCode, null, dev.output());
    try { return (await (await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) })).text()).includes(text); }
    catch { return false; }
  }
  await waitFor(() => contains('/try-your-export/'), 'Initial XML build failed.', dev.output);
  await rm(join(root, 'wordpress-export.xml'));
  const manifest = await writeBundle(root, { slug: 'split-site' });
  await waitFor(() => contains('/split-site/'), 'New bundle directory was not watched.', dev.output);
  const file = join(root, manifest.parts.at(-1).path);
  const valid = await readFile(file);
  const before = dev.output().length;
  await writeFile(file, 'corrupt');
  await waitFor(() => dev.output().slice(before).includes('The preview keeps the last successful build.'), 'Part corruption did not rebuild.', dev.output);
  assert.equal(await contains('/split-site/'), true);
  await writeFile(file, valid);
  await writeBundle(root, { slug: 'replaced-parts' });
  await waitFor(() => contains('/replaced-parts/'), 'Replaced parts directory did not recover.', dev.output);
  await rm(join(root, 'wordpress-export.manifest.json'));
  await rm(join(root, 'wordpress-export.parts'), { recursive: true });
  await writeFile(join(root, 'wordpress-export.xml'), wordpressExport({ slug: 'restored-single' }));
  await waitFor(() => contains('/restored-single/'), 'Returning to single XML did not rebuild.', dev.output);
});
