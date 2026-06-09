import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export class ProjectRootNotFoundError extends Error {
  constructor(startDir: string) {
    super(
      `Could not locate DXCare-slide project root from "${startDir}". ` +
        `Expected to find a directory containing both "slides/" and "_shared/" somewhere up the tree.`,
    );
    this.name = 'ProjectRootNotFoundError';
  }
}

/**
 * True iff `dir` contains both `slides/` and `_shared/` as subdirectories.
 * The dual-marker rule makes accidental matches very unlikely — a lone
 * `slides/` could exist in unrelated contexts (marketing assets, etc.),
 * but the `_shared/` sibling is specific to this monorepo convention.
 */
export function hasSlidesMarker(dir: string): boolean {
  return isDir(join(dir, 'slides')) && isDir(join(dir, '_shared'));
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Resolve the DXCare-slide project root.
 *
 * Resolution order:
 *   1. If `CLAUDE_PROJECT_DIR` env var is set AND that path has the markers → use it.
 *   2. Otherwise walk up from `startDir` (default `process.cwd()`) looking for markers.
 *   3. If no match before filesystem root → throw {@link ProjectRootNotFoundError}.
 *
 * An invalid `CLAUDE_PROJECT_DIR` (missing, not a dir, or unmarked) silently falls
 * through to walk-up rather than erroring — Claude Code may set the env var to a
 * parent workspace that is not itself a slides repo.
 */
export function resolveProjectRoot(startDir: string = process.cwd()): string {
  const envOverride = process.env.CLAUDE_PROJECT_DIR;
  if (envOverride && isDir(envOverride) && hasSlidesMarker(envOverride)) {
    return resolve(envOverride);
  }

  let current = resolve(startDir);
  while (true) {
    if (hasSlidesMarker(current)) return current;
    const parent = dirname(current);
    if (parent === current) throw new ProjectRootNotFoundError(startDir);
    current = parent;
  }
}
