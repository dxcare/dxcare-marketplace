import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultRepo = join(__dirname, '..', '..');

const RESERVED = new Set(['login', 'api', 'dashboard', 'slides', 'public', 'admin', '_shared', '_templates']);

export function suggestSlug(title: string): string {
  let s = title
    .toLowerCase()
    .replace(/[_+]/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (s.length > 40) s = s.slice(0, 40).replace(/-+$/, '');
  if (!s) s = `slide-${Math.floor(1000 + Math.random() * 9000)}`;
  return s;
}

export function isReserved(slug: string): boolean {
  return RESERVED.has(slug);
}

/**
 * Check whether `slug` already exists under `<repoRoot>/slides/`.
 * Accepts an explicit repo root for tests and cross-repo usage;
 * falls back to the script's own installation root.
 */
export async function isCollision(slug: string, repoRoot: string = defaultRepo): Promise<boolean> {
  return existsSync(join(repoRoot, 'slides', slug));
}
