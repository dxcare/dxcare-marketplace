import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveProjectRoot,
  hasSlidesMarker,
  ProjectRootNotFoundError,
} from '../project-root.js';

let tmpRoot: string;
let originalEnv: string | undefined;

beforeEach(() => {
  tmpRoot = realpathSync(mkdtempSync(join(tmpdir(), 'dxcare-slide-root-')));
  originalEnv = process.env.CLAUDE_PROJECT_DIR;
  delete process.env.CLAUDE_PROJECT_DIR;
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  if (originalEnv === undefined) delete process.env.CLAUDE_PROJECT_DIR;
  else process.env.CLAUDE_PROJECT_DIR = originalEnv;
});

describe('hasSlidesMarker', () => {
  it('returns true when both slides/ and _shared/ exist', () => {
    mkdirSync(join(tmpRoot, 'slides'));
    mkdirSync(join(tmpRoot, '_shared'));
    expect(hasSlidesMarker(tmpRoot)).toBe(true);
  });

  it('returns false when only slides/ exists', () => {
    mkdirSync(join(tmpRoot, 'slides'));
    expect(hasSlidesMarker(tmpRoot)).toBe(false);
  });

  it('returns false when only _shared/ exists', () => {
    mkdirSync(join(tmpRoot, '_shared'));
    expect(hasSlidesMarker(tmpRoot)).toBe(false);
  });

  it('returns false when neither exists', () => {
    expect(hasSlidesMarker(tmpRoot)).toBe(false);
  });

  it('returns false when marker is a file, not a directory', () => {
    mkdirSync(join(tmpRoot, 'slides'));
    // _shared as a file should not count
    require('node:fs').writeFileSync(join(tmpRoot, '_shared'), '');
    expect(hasSlidesMarker(tmpRoot)).toBe(false);
  });
});

describe('resolveProjectRoot', () => {
  it('returns tmpRoot when called from tmpRoot with markers', () => {
    mkdirSync(join(tmpRoot, 'slides'));
    mkdirSync(join(tmpRoot, '_shared'));
    expect(resolveProjectRoot(tmpRoot)).toBe(tmpRoot);
  });

  it('walks up from nested subdir to find markers', () => {
    mkdirSync(join(tmpRoot, 'slides'));
    mkdirSync(join(tmpRoot, '_shared'));
    const nested = join(tmpRoot, 'slides', 'foo', 'bar');
    mkdirSync(nested, { recursive: true });
    expect(resolveProjectRoot(nested)).toBe(tmpRoot);
  });

  it('throws ProjectRootNotFoundError when no marker found up to filesystem root', () => {
    // tmpRoot has no markers
    expect(() => resolveProjectRoot(tmpRoot)).toThrow(ProjectRootNotFoundError);
  });

  it('prefers CLAUDE_PROJECT_DIR env when set to valid marked dir', () => {
    mkdirSync(join(tmpRoot, 'slides'));
    mkdirSync(join(tmpRoot, '_shared'));
    process.env.CLAUDE_PROJECT_DIR = tmpRoot;
    // Even called from a totally unrelated tmp dir, env wins
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'dxcare-slide-other-')));
    try {
      expect(resolveProjectRoot(elsewhere)).toBe(tmpRoot);
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it('falls through to walk-up when CLAUDE_PROJECT_DIR is invalid path', () => {
    mkdirSync(join(tmpRoot, 'slides'));
    mkdirSync(join(tmpRoot, '_shared'));
    process.env.CLAUDE_PROJECT_DIR = '/nonexistent/path/that/does/not/exist';
    expect(resolveProjectRoot(tmpRoot)).toBe(tmpRoot);
  });

  it('falls through to walk-up when CLAUDE_PROJECT_DIR exists but lacks markers', () => {
    mkdirSync(join(tmpRoot, 'slides'));
    mkdirSync(join(tmpRoot, '_shared'));
    const bogus = realpathSync(mkdtempSync(join(tmpdir(), 'dxcare-slide-bogus-')));
    try {
      process.env.CLAUDE_PROJECT_DIR = bogus;
      expect(resolveProjectRoot(tmpRoot)).toBe(tmpRoot);
    } finally {
      rmSync(bogus, { recursive: true, force: true });
    }
  });

  it('defaults startDir to process.cwd() when omitted', () => {
    mkdirSync(join(tmpRoot, 'slides'));
    mkdirSync(join(tmpRoot, '_shared'));
    const originalCwd = process.cwd();
    try {
      process.chdir(tmpRoot);
      expect(resolveProjectRoot()).toBe(tmpRoot);
    } finally {
      process.chdir(originalCwd);
    }
  });
});
