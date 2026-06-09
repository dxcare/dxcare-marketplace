import { describe, it, expect } from 'vitest';
import { parsePorcelain } from '../git-safety.js';

describe('parsePorcelain', () => {
  it('returns clean state on empty output', () => {
    const s = parsePorcelain('');
    expect(s.clean).toBe(true);
    expect(s.modified).toEqual([]);
  });

  it('categorizes modified, staged, untracked', () => {
    const out = [
      ' M lib/foo.ts',
      'M  scripts/bar.ts',
      '?? new.txt',
      'A  added.ts',
    ].join('\n');
    const s = parsePorcelain(out);
    expect(s.clean).toBe(false);
    expect(s.modified).toEqual(['lib/foo.ts']);
    expect(s.staged).toEqual(['scripts/bar.ts', 'added.ts']);
    expect(s.untracked).toEqual(['new.txt']);
  });

  it('puts MM (staged + worktree modified) in both categories', () => {
    const s = parsePorcelain('MM dual.ts\n');
    expect(s.staged).toEqual(['dual.ts']);
    expect(s.modified).toEqual(['dual.ts']);
    expect(s.clean).toBe(false);
  });

  it('ignores malformed lines', () => {
    const s = parsePorcelain('x\n');
    expect(s.clean).toBe(true);
  });
});
