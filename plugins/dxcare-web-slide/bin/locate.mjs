#!/usr/bin/env node
// dxcare-web-slide project-root locator — self-contained, no external deps.
// Duplicates logic of <repo>/scripts/lib/project-root.ts so skills can run
// before the target repo has cloned its own copy of scripts/.
//
// Usage (stdout): prints the resolved project root, or exits non-zero.
//   node <plugin>/bin/locate.mjs         → auto
//   node <plugin>/bin/locate.mjs <dir>   → walk-up from <dir>
//
// Resolution order:
//   1. $CLAUDE_PROJECT_DIR env var, if it has slides/ + _shared/ markers
//   2. Walk up from startDir (argv[2] or cwd) looking for the markers
//   3. Exit code 1 with error message on stderr if no match

import { statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

function hasMarkers(dir) {
  return isDir(`${dir}/slides`) && isDir(`${dir}/_shared`);
}

function resolveRoot(startDir) {
  const env = process.env.CLAUDE_PROJECT_DIR;
  if (env && isDir(env) && hasMarkers(env)) return resolve(env);

  let cur = resolve(startDir ?? process.cwd());
  while (true) {
    if (hasMarkers(cur)) return cur;
    const parent = dirname(cur);
    if (parent === cur) {
      throw new Error(
        `Could not locate dxcare-web-slide project root from "${startDir ?? process.cwd()}". ` +
        `Expected a directory containing both "slides/" and "_shared/".`
      );
    }
    cur = parent;
  }
}

try {
  const root = resolveRoot(process.argv[2]);
  process.stdout.write(root);
} catch (e) {
  process.stderr.write(e.message + '\n');
  process.exit(1);
}
