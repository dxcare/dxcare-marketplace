#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getGitState } from './lib/git-safety.js';

export interface Args { prod: boolean; }

export function parseArgs(argv: string[]): Args {
  return { prod: argv.some((a) => a === '--prod' || a === '--production') };
}

export function chooseMode(a: Args): string[] {
  return a.prod ? ['--prod'] : [];
}

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const repo = join(dirname(__filename), '..');
  const args = parseArgs(process.argv.slice(2));

  const gitState = getGitState(repo);
  if (!gitState.clean) {
    console.error(JSON.stringify({ error: 'git_dirty', state: gitState }, null, 2));
    process.exit(2);
  }

  const test = spawnSync('pnpm', ['test'], { cwd: repo, stdio: 'inherit' });
  if (test.status !== 0) {
    console.error(JSON.stringify({ error: 'tests_failed' }));
    process.exit(3);
  }

  const build = spawnSync('pnpm', ['build'], { cwd: repo, stdio: 'inherit' });
  if (build.status !== 0) {
    console.error(JSON.stringify({ error: 'build_failed' }));
    process.exit(4);
  }

  const vercelArgs = chooseMode(args);
  const vercel = spawnSync('vercel', vercelArgs, { cwd: repo, encoding: 'utf8' });
  if (vercel.status !== 0) {
    console.error(JSON.stringify({ error: 'vercel_failed', stderr: vercel.stderr }));
    process.exit(5);
  }
  const url = vercel.stdout.split('\n').filter(Boolean).pop() ?? '';
  console.log(JSON.stringify({ mode: args.prod ? 'prod' : 'preview', url, tests_passed: true, git_clean: true }, null, 2));
}

const __filename = fileURLToPath(import.meta.url);
const __argv1 = process.argv[1] ? (() => { try { return realpathSync(process.argv[1]); } catch { return process.argv[1]; } })() : '';
if (__argv1 === __filename) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
