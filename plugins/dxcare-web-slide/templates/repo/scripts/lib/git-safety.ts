import { spawnSync } from 'node:child_process';

export interface GitState {
  clean: boolean;
  modified: string[];
  staged: string[];
  untracked: string[];
}

export function parsePorcelain(out: string): GitState {
  const state: GitState = { clean: true, modified: [], staged: [], untracked: [] };
  const lines = out.split('\n').filter(Boolean);
  for (const line of lines) {
    if (line.length < 3) continue;
    const code = line.slice(0, 2);
    const path = line.slice(3);
    if (code === '??') {
      state.untracked.push(path);
      continue;
    }
    if (code[0] !== ' ' && code[0] !== '?') state.staged.push(path);
    if (code[1] !== ' ' && code[1] !== '?') state.modified.push(path);
  }
  state.clean = state.modified.length === 0 && state.staged.length === 0 && state.untracked.length === 0;
  return state;
}

export function getGitState(cwd: string): GitState {
  const result = spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git status failed: ${result.stderr}`);
  return parsePorcelain(result.stdout);
}
