#!/usr/bin/env tsx
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractReferences } from './lib/references-extract.js';

const __filename = fileURLToPath(import.meta.url);
const __argv1 = process.argv[1] ? (() => { try { return realpathSync(process.argv[1]); } catch { return process.argv[1]; } })() : '';
if (__argv1 === __filename) {
  const args = Object.fromEntries(
    process.argv.slice(2).reduce<string[][]>((acc, v, i, a) => {
      if (v.startsWith('--')) acc.push([v.slice(2), a[i + 1] ?? '']);
      return acc;
    }, [])
  );
  const slug = args.slug ?? '';
  if (!slug) {
    console.error('Usage: tsx scripts/extract-references.ts --slug <slug>');
    process.exit(1);
  }
  const repoRoot = join(dirname(__filename), '..');
  extractReferences({ repoRoot, slug })
    .then((r) => {
      console.log(JSON.stringify({
        slug,
        extracted: r.extracted.map((e) => ({ source: e.source, output: e.output, bytes: e.bytes })),
        skipped: r.skipped,
      }, null, 2));
    })
    .catch((e) => {
      console.error((e as Error).message);
      process.exit(2);
    });
}
