import { describe, it, expect } from 'vitest';
import { parseUrl, parseArgs } from '../deploy-static.ts';

describe('deploy-static parseUrl — 호스트별 URL 파싱 (단일 .pop 재사용 금지)', () => {
  it('vercel: 실제 출력(Preview: URL [4s] 접두·접미 + 말미 JSON)서 vercel.app 추출', () => {
    // 실 vercel CLI 출력 형식 — Inspect 줄엔 vercel.com, Preview 줄엔 *.vercel.app + [4s] 접미.
    const out = [
      'Retrieving project…',
      'Inspect: https://vercel.com/team/demo/7BCDU [1s]',
      'Preview: https://demo-kkbyubnun-team.vercel.app [4s]',
      'Completing...',
      '{',
      '  "deployment": { "url": "https://demo-kkbyubnun-team.vercel.app" }',
    ].join('\n');
    expect(parseUrl('vercel', out)).toBe('https://demo-kkbyubnun-team.vercel.app');
  });

  it('cfpages: 잡음 섞인 wrangler 출력서 pages.dev 추출', () => {
    const out = '✨ Success! Uploaded 12 files (3.21 sec)\n\n✨ Deployment complete! Take a peek over at https://abc123.my-deck.pages.dev\n';
    expect(parseUrl('cfpages', out)).toBe('https://abc123.my-deck.pages.dev');
  });

  it('ghpages: owner/repo 로 project Pages URL 구성', () => {
    expect(parseUrl('ghpages', '', 'dxcare', 'dxcare-web-slide')).toBe(
      'https://dxcare.github.io/dxcare-web-slide/',
    );
  });

  it('cfpages: pages.dev 없으면 빈 문자열', () => {
    expect(parseUrl('cfpages', 'error: not authenticated')).toBe('');
  });
});

describe('deploy-static parseArgs', () => {
  it('host enum + project 기본값=slug', () => {
    const a = parseArgs(['--slug', 'deck1', '--host', 'cfpages']);
    expect(a).toEqual({ slug: 'deck1', host: 'cfpages', project: 'deck1', prod: false });
  });
  it('--project / --prod 인식', () => {
    const a = parseArgs(['--slug', 'd', '--host', 'vercel', '--project', 'myproj', '--prod']);
    expect(a.project).toBe('myproj');
    expect(a.prod).toBe(true);
  });
});
