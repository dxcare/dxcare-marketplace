/**
 * deploy-static — 평탄화한 deck(`dist/<slug>/`)을 정적 호스트에 배포.
 *
 * deck 을 `bundle.ts` 로 host-agnostic flat 폴더로 만든 뒤, 선택한 호스트에 올린다.
 * 세 호스트 모두 같은 정적 산출물을 받는다(동적 Next 앱은 로컬 관리용으로 존속).
 *
 *   pnpm deploy-static --slug <slug> --host vercel|ghpages|cfpages [--project <name>] [--prod]
 *
 * 전제(호스트별, 첫 배포 시 1회):
 *   vercel  — `vercel login` (이미 쓰던 계정). ⚠️ 팀 Deployment Protection 은 정적
 *             배포도 막는다(401 SSO) — 외부 공유하려면 Settings 에서 Protection 해제 또는
 *             bypass 토큰 필요. "그냥 공개 링크"는 ghpages/cfpages(기본 공개)가 마찰 적음.
 *   cfpages — `npx wrangler login` 또는 CLOUDFLARE_ACCOUNT_ID + API 토큰. (무료·상업·무제한)
 *   ghpages — `gh auth login` 또는 git push 권한. origin = GitHub repo. Pages 활성화 필요(1회).
 *
 * 각 호스트 CLI 호출 결과는 사용자 환경/계정에 의존 — 첫 배포로 인증·URL 형식을 확정한다.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Host = 'vercel' | 'ghpages' | 'cfpages';

export interface Args { slug: string; host: Host; project: string; prod: boolean; }

export function parseArgs(argv: string[]): Args {
  const m = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      m.set(k, argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? 'true' : argv[i + 1]);
    }
  }
  const slug = m.get('slug') ?? '';
  const host = m.get('host') as Host;
  if (!slug) { console.error('deploy-static: --slug required'); process.exit(2); }
  if (!['vercel', 'ghpages', 'cfpages'].includes(host)) {
    console.error('deploy-static: --host must be vercel | ghpages | cfpages'); process.exit(2);
  }
  return { slug, host, project: m.get('project') ?? slug, prod: m.has('prod') };
}

/** wrangler/vercel stdout 에서 배포 URL 추출 (호스트별 형식 상이 — 단일 .pop() 금지). */
export function parseUrl(host: Host, stdout: string, owner?: string, repo?: string): string {
  if (host === 'vercel') {
    // vercel CLI 출력 = "Preview: https://<...>.vercel.app [4s]" + 말미 JSON({deployment.url}).
    // 줄-앵커(^https) 금지 — 접두("Preview:")/접미("[4s]")가 붙는다. 전역 추출.
    return stdout.match(/https:\/\/[a-z0-9][a-z0-9-]*\.vercel\.app\b/i)?.[0] ?? '';
  }
  if (host === 'cfpages') {
    return stdout.match(/https:\/\/[a-z0-9][a-z0-9.-]*\.pages\.dev\b/i)?.[0] ?? '';
  }
  // ghpages — gh-pages 는 URL 을 출력하지 않음 → repo 정보로 구성.
  if (owner && repo) return `https://${owner}.github.io/${repo}/`;
  return '';
}

function run(cmd: string, cmdArgs: string[], cwd: string) {
  return spawnSync(cmd, cmdArgs, { cwd, encoding: 'utf8' });
}

async function main() {
  const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
  const { slug, host, project, prod } = parseArgs(process.argv.slice(2));

  // 1) 평탄화 (항상 fresh — stale 방지)
  const bundle = run('pnpm', ['bundle', '--slug', slug], repo);
  if (bundle.status !== 0) {
    console.error(JSON.stringify({ error: 'bundle_failed', stderr: bundle.stderr }));
    process.exit(3);
  }
  const dist = join(repo, 'dist', slug);
  if (!existsSync(dist)) { console.error(JSON.stringify({ error: 'dist_missing', dist })); process.exit(3); }

  // 2) 호스트별 배포
  let res; let url = '';
  if (host === 'vercel') {
    res = run('vercel', ['deploy', dist, '--yes', ...(prod ? ['--prod'] : [])], repo);
    if (res.status !== 0) return fail('vercel', res, 'vercel login 필요?');
    url = parseUrl('vercel', res.stdout);
  } else if (host === 'cfpages') {
    res = run('npx', ['--yes', 'wrangler', 'pages', 'deploy', dist, '--project-name', project], repo);
    if (res.status !== 0) return fail('cfpages', res, 'npx wrangler login 또는 CLOUDFLARE_ACCOUNT_ID 필요?');
    url = parseUrl('cfpages', res.stdout + (res.stderr ?? ''));
  } else {
    // ghpages — gh-pages 패키지로 dist 를 gh-pages 브랜치 루트에 push
    res = run('npx', ['--yes', 'gh-pages', '-d', dist, '-t', 'true'], repo);
    if (res.status !== 0) return fail('ghpages', res, 'git push 권한 / gh auth 필요? Pages 활성화는 repo Settings→Pages(gh-pages branch) 1회.');
    const remote = run('git', ['remote', 'get-url', 'origin'], repo).stdout.trim();
    const mm = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    url = parseUrl('ghpages', '', mm?.[1], mm?.[2]);
  }

  console.log(JSON.stringify({ host, slug, url, dist, prod }, null, 2));
}

function fail(host: string, res: { status: number | null; stderr?: string }, hint: string): never {
  console.error(JSON.stringify({ error: `${host}_failed`, hint, stderr: res.stderr?.slice(0, 800) }));
  process.exit(5);
}

const __filename = fileURLToPath(import.meta.url);
const __argv1 = process.argv[1] ? (() => { try { return realpathSync(process.argv[1]); } catch { return process.argv[1]; } })() : '';
if (__argv1 === __filename) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
