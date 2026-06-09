#!/usr/bin/env node
// CI helper — validate the plugin manifest + auto-discovery layout.
// The manifest lives at .claude-plugin/plugin.json. Skills and agents are
// auto-discovered from skills/<name>/SKILL.md and agents/*.md, so the
// manifest must NOT declare skills/agents/commands/hooks — declaring them
// (especially as file-path arrays) is what Claude Code rejects on install
// with "Validation errors: agents: Invalid input, skills: Invalid input".
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const pkgPath =
  process.env.PLUGIN_JSON_PATH ?? join(root, '.claude-plugin', 'plugin.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

if (!pkg.name || !pkg.version) {
  console.error('FAIL: plugin.json missing name/version');
  process.exit(1);
}

// Regression guard: these are auto-discovered and must be absent from the
// manifest. Their presence is the original install failure.
for (const field of ['skills', 'agents', 'commands', 'hooks']) {
  if (field in pkg) {
    console.error(
      `FAIL: plugin.json must not declare "${field}" — it is auto-discovered; remove the field`,
    );
    process.exit(1);
  }
}

// Every skill must be a directory containing SKILL.md.
const skillsDir = join(root, 'skills');
let skillCount = 0;
if (existsSync(skillsDir)) {
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!existsSync(join(skillsDir, entry.name, 'SKILL.md'))) {
      console.error(`FAIL: skills/${entry.name}/ is missing SKILL.md`);
      process.exit(1);
    }
    skillCount++;
  }
}
if (skillCount === 0) {
  console.error('FAIL: no skills found at skills/<name>/SKILL.md');
  process.exit(1);
}

console.log(
  `plugin.json OK: ${pkg.name}@${pkg.version} — ${skillCount} skills (auto-discovered)`,
);
