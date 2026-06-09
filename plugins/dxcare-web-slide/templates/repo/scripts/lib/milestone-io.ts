import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface MilestoneInput {
  repoRoot: string;
  slug: string;
  label: string;
  date: string; // YYYY-MM-DD
}

export interface MilestoneResult {
  path: string; // relative to repo
  absPath: string;
}

const LABEL_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function createMilestone(input: MilestoneInput): Promise<MilestoneResult> {
  const { repoRoot, slug, label, date } = input;
  if (!LABEL_RE.test(label)) throw new Error(`invalid milestone label "${label}" (must match ${LABEL_RE})`);
  if (!DATE_RE.test(date)) throw new Error(`invalid date "${date}" (must be YYYY-MM-DD)`);

  const slideDir = join(repoRoot, 'slides', slug);
  if (!existsSync(slideDir)) throw new Error(`slide directory not found: ${slideDir}`);

  const rel = `slides/${slug}/milestones/${date}-${label}`;
  const msDir = join(repoRoot, rel);
  if (existsSync(msDir)) throw new Error(`milestone already exists: ${rel}`);

  mkdirSync(msDir, { recursive: true });

  const copies = ['index.html', 'skeleton.md'];
  for (const f of copies) {
    const src = join(slideDir, f);
    if (existsSync(src)) copyFileSync(src, join(msDir, f));
  }
  writeFileSync(join(msDir, 'note.md'), `# Milestone ${date}-${label}\n\n_(fill in: what meeting / event / audience feedback)_\n`);

  const metaPath = join(slideDir, 'meta.json');
  if (existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    meta.milestones = Array.isArray(meta.milestones) ? meta.milestones : [];
    meta.milestones.push({ date, label, path: rel });
    writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
  }

  return { path: rel, absPath: msDir };
}
