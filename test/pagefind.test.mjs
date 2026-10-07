import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const generatedDirectory = '.zeropress-wxr';
const nativeAdapter = '// Built-in ZeroPress search\n';
const nativeIndex = JSON.stringify([{ title: 'A synthetic page', url: '/article/' }]);

async function fixture(t, { enabled = true, themeSearch = true, empty = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'starter-pagefind-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of ['scripts', 'theme', generatedDirectory, 'dist/_zeropress']) {
    await mkdir(join(root, directory), { recursive: true });
  }
  await copyFile(new URL('../scripts/replace-search-with-pagefind.mjs', import.meta.url), join(root, 'scripts/replace-search-with-pagefind.mjs'));
  await writeFile(join(root, 'theme/theme.json'), JSON.stringify({ features: { search: themeSearch } }));
  await writeFile(join(root, generatedDirectory, 'zeropress-preview-data.json'), JSON.stringify({ site: { search: { enabled } } }));
  await writeFile(join(root, 'dist/_zeropress/search.json'), empty ? '[]' : nativeIndex);
  await writeFile(join(root, 'dist/_zeropress/search.js'), nativeAdapter);
  await writeFile(join(root, 'dist/_zeropress/search_pagefind.js'), '// Pagefind adapter\n');
  return root;
}

function replaceSearch(root) {
  return exec(process.execPath, ['scripts/replace-search-with-pagefind.mjs'], {
    cwd: root, timeout: 10_000, env: { ...process.env, NO_COLOR: '1' },
  });
}

for (const [setting, options] of [['site', { enabled: false }], ['theme', { themeSearch: false }]]) {
  test(`skips Pagefind when search is disabled in the ${setting}`, async (t) => {
    const root = await fixture(t, options);
    await rm(join(root, 'dist'), { recursive: true });
    const result = await replaceSearch(root);
    assert.match(result.stdout, /Search is disabled; skipping replacement/);
  });
}

test('keeps empty native search so unmarked HTML is not accidentally indexed', async (t) => {
  const root = await fixture(t, { empty: true });
  await writeFile(join(root, 'dist/index.html'), '<h1>Unlisted content</h1>');
  const result = await replaceSearch(root);
  assert.match(result.stdout, /No searchable posts or pages/);
  assert.equal(await readFile(join(root, 'dist/_zeropress/search.js'), 'utf8'), nativeAdapter);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'dist/_zeropress/search.json'), 'utf8')), []);
});

for (const file of ['search.json', 'search.js', 'search_pagefind.js']) {
  test(`asks for a rebuild when ${file} is missing`, async (t) => {
    const root = await fixture(t);
    await rm(join(root, 'dist/_zeropress', file));
    await assert.rejects(replaceSearch(root), error => {
      assert.equal(error.code, 1);
      assert.ok(error.stderr.includes(`Missing dist/_zeropress/${file}`));
      assert.match(error.stderr, /Run npm run build/);
      return true;
    });
  });
}

for (const failure of ['createIndex', 'addDirectory', 'writeFiles']) {
  test(`preserves native search and closes Pagefind after ${failure} fails`, async (t) => {
    const root = await fixture(t);
    const service = join(root, 'node_modules/pagefind');
    await mkdir(service, { recursive: true });
    await writeFile(join(service, 'package.json'), JSON.stringify({ type: 'module', exports: './index.js' }));
    await writeFile(join(service, 'index.js'), `
      import { writeFile } from 'node:fs/promises';
      const result = phase => ({ errors: phase === ${JSON.stringify(failure)} ? ['Synthetic index error'] : [] });
      export async function createIndex() {
        return { ...result('createIndex'), index: {
          addDirectory: async () => result('addDirectory'),
          writeFiles: async () => result('writeFiles'),
        } };
      }
      export async function close() { await writeFile('closed.txt', 'yes'); }
    `);
    await assert.rejects(replaceSearch(root), error => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /Synthetic index error/);
      return true;
    });
    assert.equal(await readFile(join(root, 'closed.txt'), 'utf8'), 'yes');
    assert.equal(await readFile(join(root, 'dist/_zeropress/search.js'), 'utf8'), nativeAdapter);
    assert.equal(await readFile(join(root, 'dist/_zeropress/search.json'), 'utf8'), nativeIndex);
  });
}
