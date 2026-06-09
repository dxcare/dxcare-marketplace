#!/usr/bin/env tsx
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMilestone } from './lib/milestone-io.js';

export interface SnapshotInput {
  repoRoot: string;
  slug: string;
  label: string;
  date?: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function runSnapshot(input: SnapshotInput) {
  const date = input.date ?? today();
  return createMilestone({ repoRoot: input.repoRoot, slug: input.slug, label: input.label, date });
}

const __filename = fileURLToPath(import.meta.url);
const __argv1 = process.argv[1] ? (() => { try { return realpathSync(process.argv[1]); } catch { return process.argv[1]; } })() : '';
if (__argv1 === __filename) {
  const args = Object.fromEntries(
    process.argv.slice(2).reduce<string[][]>((acc, v, i, a) => {
      if (v.startsWith('--')) acc.push([v.slice(2), a[i + 1] ?? '']);
      return acc;
    }, [])
  );
  const repoRoot = join(dirname(__filename), '..');
  runSnapshot({
    repoRoot,
    slug: args.slug ?? '',
    label: args.label ?? '',
    date: args.date,
  })
    .then((r) => { console.log(JSON.stringify(r, null, 2)); })
    .catch((e) => { console.error(e.message); process.exit(2); });
}
