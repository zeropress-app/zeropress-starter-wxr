import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { runBuildFromSource, openPreviewDataSource } from '@zeropress/build';
import { replaceSearchWithPagefind } from './replace-search-with-pagefind.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = new Set(process.argv.slice(2));
const allowed = new Set(['--pagefind']);
let source;
try {
  for (const arg of args) if (!allowed.has(arg)) throw new Error(`Unknown build option: ${arg}`);
  const started = performance.now();
  source = await openPreviewDataSource(fileURLToPath(new URL('../.zeropress-wxr/zeropress-preview-data.manifest.json', import.meta.url)));
  // Capture one publication generation for both rendering and Pagefind decisions.
  const header = source.header;
  const result = await runBuildFromSource(`${root}/theme`, source, `${root}/dist`, {
    publicDir: `${root}/public`, projectRoot: root, emptyOutDir: true,
  });
  for (const warning of result.warnings) console.warn(`[${warning.code}] ${warning.message}`);
  console.log(`Built ZeroPress site successfully\nFiles: ${result.files.length}\nElapsed: ${Math.round(performance.now() - started)}ms`);
  if (args.has('--pagefind')) await replaceSearchWithPagefind(header);
} catch (error) {
  console.error(error.message || String(error));
  process.exitCode = 1;
} finally { await source?.close(); }
