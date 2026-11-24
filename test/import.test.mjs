import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fixture, command } from './helpers.mjs';
import { writeBundle } from './bundle-fixtures.mjs';

async function snapshot(root, paths) {
  const files = {};
  async function visit(path) {
    const absolute = join(root, path);
    if ((await stat(absolute)).isDirectory()) {
      for (const name of (await readdir(absolute)).sort()) await visit(join(path, name));
    } else {
      files[path] = createHash('sha256').update(await readFile(absolute)).digest('hex');
    }
  }
  for (const path of paths) await visit(path);
  return files;
}

for (const format of ['xml', 'bundle']) {
  test(`rejects extra import arguments without changing ${format} inputs or previous output`, async (t) => {
    const root = await fixture(t);
    const inputs = ['wxr-import-base.json', 'wxr-import-base.override.json'];
    if (format === 'bundle') {
      await writeBundle(root);
      await rm(join(root, 'wordpress-export.xml'));
      inputs.push('wordpress-export.manifest.json', 'wordpress-export.parts');
    } else {
      inputs.push('wordpress-export.xml');
    }
    const initial = await command(root, ['run', 'build:site']).done;
    assert.equal(initial.code, 0, initial.output);
    const paths = [...inputs, '.zeropress-wxr', 'dist'];
    const before = await snapshot(root, paths);

    for (const args of [['--max-body-bytes', '1'], ['--output', 'unexpected.json'], ['unexpected.xml']]) {
      const result = await command(root, ['run', 'import', '--', ...args]).done;
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, /npm run import does not accept additional arguments/);
      assert.match(result.output, /Use zeropress-wxr-import directly for custom options/);
      assert.doesNotMatch(result.output, /Converted WXR/);
      assert.deepEqual(await snapshot(root, paths), before);
    }
  });
}
