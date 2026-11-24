import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { wordpressExport } from './fixtures.mjs';

// Synthetic complete records, including metadata and forward media references.
export async function writeBundle(root, options = {}) {
  const xml = wordpressExport(options);
  const records = [...xml.matchAll(/<(wp:author|wp:category|wp:tag|wp:term|item)>[\s\S]*?<\/\1>/g)];
  const header = xml.slice(0, records[0].index).replace(/<pubDate>.*?<\/pubDate>/, '');
  const sha = (value) => createHash('sha256').update(value).digest('hex');
  const base = await readFile(join(root, 'wxr-import-base.json'));
  const manifest = { format: 'zeropress-wxr-bundle', format_version: 1, wxr_version: '1.2',
    generated_at: '2026-09-20T09:00:00Z', data_hash: 'a'.repeat(64),
    base: { path: 'wxr-import-base.json', bytes: base.length, sha256: sha(base) }, parts: [] };
  const pending = join(root, 'pending-parts');
  await mkdir(pending);
  const counts = { 'wp:author': 'authors', 'wp:category': 'categories', 'wp:tag': 'tags', 'wp:term': 'terms', item: 'items' };
  for (let i = 0; i < records.length; i += 3) {
    const group = records.slice(i, i + 3);
    const bytes = Buffer.from(header + group.map((r) => r[0]).join('\n') + '</channel></rss>');
    const hash = sha(bytes), name = `p-${hash}.xml`;
    const inventory = { authors: 0, categories: 0, tags: 0, terms: 0, items: 0 };
    for (const record of group) inventory[counts[record[1]]]++;
    await writeFile(join(pending, name), bytes);
    manifest.parts.push({ path: `wordpress-export.parts/${name}`, bytes: bytes.length, sha256: hash, records: inventory });
  }
  await rm(join(root, 'wordpress-export.parts'), { recursive: true, force: true });
  await rename(pending, join(root, 'wordpress-export.parts'));
  await writeFile(join(root, 'pending-manifest.json'), JSON.stringify(manifest));
  await rename(join(root, 'pending-manifest.json'), join(root, 'wordpress-export.manifest.json'));
  return manifest;
}
