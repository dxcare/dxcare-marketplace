import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { suggestSlug, isReserved, isCollision } from '../slug-generator.js';

describe('suggestSlug', () => {
  it('lowercases and dashes English titles', () => {
    expect(suggestSlug('Pharma Ax Proposal')).toBe('pharma-ax-proposal');
  });

  it('drops Korean characters, keeps ASCII residue', () => {
    expect(suggestSlug('파마리서치 Ax')).toBe('ax');
  });

  it('falls back to `slide-<n>` when result is empty', () => {
    expect(suggestSlug('한글만')).toMatch(/^slide-\d{4}$/);
  });

  it('truncates to 40 chars max', () => {
    const long = 'a'.repeat(100);
    expect(suggestSlug(long).length).toBeLessThanOrEqual(40);
  });
});

describe('isReserved', () => {
  it('rejects known system slugs', () => {
    expect(isReserved('login')).toBe(true);
    expect(isReserved('api')).toBe(true);
    expect(isReserved('dashboard')).toBe(true);
    expect(isReserved('pharma-ax')).toBe(false);
  });
});

describe('isCollision', () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = mkdtempSync(join(tmpdir(), 'slug-col-'));
    mkdirSync(join(tmpRepo, 'slides', 'existing-slide'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpRepo, { recursive: true, force: true });
  });

  it('returns true when slides/<slug>/ exists under the given repo root', async () => {
    expect(await isCollision('existing-slide', tmpRepo)).toBe(true);
    expect(await isCollision('brand-new-never-seen', tmpRepo)).toBe(false);
  });
});
