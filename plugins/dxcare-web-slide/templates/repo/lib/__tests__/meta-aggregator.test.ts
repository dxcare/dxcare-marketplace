import { describe, it, expect } from 'vitest';
import { aggregateSlides } from '../meta-aggregator.js';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function setup(entries: Array<{ slug: string; meta: object; hasIndex?: boolean }>): string {
  const root = mkdtempSync(join(tmpdir(), 'agg-'));
  const slidesDir = join(root, 'slides');
  mkdirSync(slidesDir);
  for (const e of entries) {
    const d = join(slidesDir, e.slug);
    mkdirSync(d);
    writeFileSync(join(d, 'meta.json'), JSON.stringify(e.meta));
    if (e.hasIndex !== false) writeFileSync(join(d, 'index.html'), '<html></html>');
  }
  return root;
}

describe('aggregateSlides', () => {
  it('returns summaries with all required fields', () => {
    const root = setup([
      {
        slug: 'pharma-ax',
        meta: { slug: 'pharma-ax', title: 'Pharma Ax', audience: 'Execs', audience_org: 'Pharma', meeting_date: '2026-04-01', status: 'delivered', private: false, features: {}, milestones: [{ label: 'v1', date: null, path: 'milestones/v1/' }] },
      },
      { slug: 'nevada', meta: { slug: 'nevada', title: 'Nevada', audience: '', audience_org: '', meeting_date: null, status: 'draft', private: false, features: {}, milestones: [] }, hasIndex: false },
    ]);
    const result = aggregateSlides(root);
    expect(result).toHaveLength(2);
    const pharma = result.find((s) => s.slug === 'pharma-ax')!;
    expect(pharma.title).toBe('Pharma Ax');
    expect(pharma.audience).toBe('Execs');
    expect(pharma.meeting_date).toBe('2026-04-01');
    expect(pharma.status).toBe('delivered');
    expect(pharma.milestone_count).toBe(1);
    expect(pharma.has_index).toBe(true);
    const nevada = result.find((s) => s.slug === 'nevada')!;
    expect(nevada.has_index).toBe(false);
    expect(nevada.milestone_count).toBe(0);
    rmSync(root, { recursive: true, force: true });
  });

  it('sorts by meeting_date descending, nulls last', () => {
    const root = setup([
      { slug: 'a', meta: { slug: 'a', title: 'A', audience: '', audience_org: '', meeting_date: '2026-01-01', status: 'draft', private: false, features: {}, milestones: [] } },
      { slug: 'b', meta: { slug: 'b', title: 'B', audience: '', audience_org: '', meeting_date: null, status: 'draft', private: false, features: {}, milestones: [] } },
      { slug: 'c', meta: { slug: 'c', title: 'C', audience: '', audience_org: '', meeting_date: '2026-05-01', status: 'draft', private: false, features: {}, milestones: [] } },
    ]);
    const result = aggregateSlides(root);
    expect(result.map((s) => s.slug)).toEqual(['c', 'a', 'b']);
    rmSync(root, { recursive: true, force: true });
  });

  it('ignores directories without meta.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'agg-empty-'));
    mkdirSync(join(root, 'slides'));
    mkdirSync(join(root, 'slides', 'empty'));
    const result = aggregateSlides(root);
    expect(result).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });
});
