#!/usr/bin/env node
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repo = join(__dirname, '..');
const src = join(repo, '_shared');
const dst = join(repo, 'public', '_shared');

if (!existsSync(src)) {
  console.error(`sync-shared: source missing: ${src}`);
  process.exit(1);
}

if (existsSync(dst)) rmSync(dst, { recursive: true, force: true });
mkdirSync(dirname(dst), { recursive: true });
cpSync(src, dst, { recursive: true });
console.log(`sync-shared: copied ${src} -> ${dst}`);
