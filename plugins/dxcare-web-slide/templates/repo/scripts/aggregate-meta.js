#!/usr/bin/env node
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repo = join(__dirname, '..');
const slidesDir = join(repo, 'slides');
const outPath = join(repo, 'public', 'slides-meta.json');

function aggregate() {
  if (!existsSync(slidesDir)) return [];
  const entries = readdirSync(slidesDir, { withFileTypes: true });
  const summaries = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const slideDir = join(slidesDir, e.name);
    const metaPath = join(slideDir, 'meta.json');
    if (!existsSync(metaPath)) continue;
    let meta;
    try { meta = JSON.parse(readFileSync(metaPath, 'utf8')); } catch { continue; }
    summaries.push({
      slug: meta.slug ?? e.name,
      title: meta.title ?? e.name,
      audience: meta.audience ?? '',
      audience_org: meta.audience_org ?? '',
      meeting_date: meta.meeting_date ?? null,
      status: meta.status ?? 'draft',
      private: meta.private ?? false,
      milestone_count: Array.isArray(meta.milestones) ? meta.milestones.length : 0,
      has_index: existsSync(join(slideDir, 'index.html')),
      has_skeleton: existsSync(join(slideDir, 'skeleton.md')),
    });
  }
  summaries.sort((a, b) => {
    if (a.meeting_date && b.meeting_date) return b.meeting_date.localeCompare(a.meeting_date);
    if (a.meeting_date && !b.meeting_date) return -1;
    if (!a.meeting_date && b.meeting_date) return 1;
    return a.slug.localeCompare(b.slug);
  });
  return summaries;
}

const data = aggregate();
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({ generated_at: new Date().toISOString(), slides: data }, null, 2));
console.log(`aggregate-meta: wrote ${data.length} summaries to ${outPath}`);
