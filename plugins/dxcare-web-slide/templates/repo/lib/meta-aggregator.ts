import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface SlideSummary {
  slug: string;
  title: string;
  audience: string;
  audience_org: string;
  meeting_date: string | null;
  status: 'draft' | 'in-review' | 'delivered' | 'archived';
  private: boolean;
  milestone_count: number;
  has_index: boolean;
  has_skeleton: boolean;
}

export function aggregateSlides(repoRoot: string): SlideSummary[] {
  const slidesDir = join(repoRoot, 'slides');
  if (!existsSync(slidesDir)) return [];

  const entries = readdirSync(slidesDir, { withFileTypes: true });
  const summaries: SlideSummary[] = [];

  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const slug = e.name;
    const slideDir = join(slidesDir, slug);
    const metaPath = join(slideDir, 'meta.json');
    if (!existsSync(metaPath)) continue;

    let meta: any;
    try {
      meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    } catch {
      continue;
    }

    summaries.push({
      slug: meta.slug ?? slug,
      title: meta.title ?? slug,
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
