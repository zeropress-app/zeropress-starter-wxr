import { spawn } from 'node:child_process';
import { lstat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export async function importWxr(root) {
  const present = async (name) => {
    try { await lstat(join(root, name)); return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  };
  const xml = await present('wordpress-export.xml');
  const bundle = await present('wordpress-export.manifest.json');
  if (xml === bundle) throw new Error(xml
    ? 'Both WXR inputs exist. Keep either wordpress-export.xml or the complete split export; remove the stale input in the same commit.'
    : 'No WordPress export found. Add wordpress-export.xml or a complete split export.');
  const bin = join(dirname(require.resolve('@zeropress/wxr-import/package.json')), 'bin/zeropress-wxr-import.js');
  await new Promise((done, reject) => {
    const child = spawn(process.execPath, [bin,
      '--input-format', bundle ? 'bundle' : 'xml', '--input', bundle ? 'wordpress-export.manifest.json' : 'wordpress-export.xml',
      '--base', 'wxr-import-base.json', '--override', 'wxr-import-base.override.json',
      '--output-format', 'chunks', '--output', '.zeropress-wxr/zeropress-preview-data.manifest.json',
    ], { cwd: root, stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? done() : reject(new Error(`WXR import failed (${code})`)));
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 2) {
      throw new Error('npm run import does not accept additional arguments. Use zeropress-wxr-import directly for custom options.');
    }
    await importWxr(fileURLToPath(new URL('../', import.meta.url)));
  }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
