import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMilestone } from '../milestone-io.js';

describe('createMilestone', () => {
  let root: string;
  let slideDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ms-'));
    slideDir = join(root, 'slides', 'demo');
    mkdirSync(slideDir, { recursive: true });
    writeFileSync(join(slideDir, 'index.html'), '<html>v1</html>');
    writeFileSync(join(slideDir, 'skeleton.md'), '---\ntitle: x\n---\n# Slide 1: A\n');
    writeFileSync(join(slideDir, 'meta.json'), JSON.stringify({ slug: 'demo', milestones: [] }));
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('creates directory with copied html + skeleton + note', async () => {
    const result = await createMilestone({ repoRoot: root, slug: 'demo', label: 'kickoff', date: '2026-05-01' });
    const msDir = join(slideDir, 'milestones', '2026-05-01-kickoff');
    expect(existsSync(join(msDir, 'index.html'))).toBe(true);
    expect(existsSync(join(msDir, 'skeleton.md'))).toBe(true);
    expect(existsSync(join(msDir, 'note.md'))).toBe(true);
    expect(readFileSync(join(msDir, 'index.html'), 'utf8')).toBe('<html>v1</html>');
    expect(result.path).toBe('slides/demo/milestones/2026-05-01-kickoff');
  });

  it('appends to meta.json.milestones', async () => {
    await createMilestone({ repoRoot: root, slug: 'demo', label: 'kickoff', date: '2026-05-01' });
    const meta = JSON.parse(readFileSync(join(slideDir, 'meta.json'), 'utf8'));
    expect(meta.milestones).toHaveLength(1);
    expect(meta.milestones[0]).toMatchObject({ date: '2026-05-01', label: 'kickoff' });
  });

  it('throws if slide dir missing', async () => {
    await expect(createMilestone({ repoRoot: root, slug: 'absent', label: 'x', date: '2026-05-01' }))
      .rejects.toThrow(/slide directory/i);
  });

  it('throws if milestone label collides', async () => {
    await createMilestone({ repoRoot: root, slug: 'demo', label: 'kickoff', date: '2026-05-01' });
    await expect(createMilestone({ repoRoot: root, slug: 'demo', label: 'kickoff', date: '2026-05-01' }))
      .rejects.toThrow(/already exists/i);
  });
});
