import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSnapshot } from '../snapshot-milestone.js';

describe('runSnapshot', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sn-'));
    const d = join(root, 'slides', 'demo');
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'index.html'), '<html>v1</html>');
    writeFileSync(join(d, 'skeleton.md'), '---\ntitle: x\n---\n# Slide 1: A\n');
    writeFileSync(join(d, 'meta.json'), '{"slug":"demo","milestones":[]}');
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('defaults date to today when absent', async () => {
    const r = await runSnapshot({ repoRoot: root, slug: 'demo', label: 'auto' });
    expect(r.path).toMatch(/^slides\/demo\/milestones\/\d{4}-\d{2}-\d{2}-auto$/);
  });

  it('accepts explicit date', async () => {
    const r = await runSnapshot({ repoRoot: root, slug: 'demo', label: 'kickoff', date: '2026-05-01' });
    expect(r.path).toBe('slides/demo/milestones/2026-05-01-kickoff');
    expect(existsSync(join(root, r.path, 'note.md'))).toBe(true);
  });
});
