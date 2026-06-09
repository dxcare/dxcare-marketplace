import { NextResponse, type NextRequest } from 'next/server';
import { verifySession, SESSION_COOKIE } from '@/lib/auth';

export const config = {
  matcher: ['/', '/dashboard/:path*'],
};

// Shown when the dashboard is unconfigured (DASHBOARD_SECRET or DASHBOARD_PASSWORD
// missing). The dashboard is a deploy-time password gate over the deck *index* —
// individual decks under /slides/<slug>/ are always open and need no setup. So
// instead of a raw 500, explain how to turn the gate on and where the decks
// already are. Keep this self-contained (Edge runtime: no fs, no app CSS).
const SETUP_HINT = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DXCare Slides — 대시보드 설정 필요</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         font: 16px/1.6 Pretendard, system-ui, sans-serif;
         background: #f7f7f5; color: #1a1a1a; padding: 2rem; }
  @media (prefers-color-scheme: dark) { body { background: #121212; color: #ededed; } }
  main { max-width: 34rem; }
  h1 { font-size: 1.4rem; margin: 0 0 .75rem; }
  p { margin: 0 0 1rem; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  pre { background: rgba(127,127,127,.12); padding: .9rem 1rem; border-radius: .6rem;
        overflow-x: auto; font-size: .85rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .muted { opacity: .7; font-size: .9rem; }
</style>
</head>
<body>
<main>
  <h1>대시보드는 배포용 비밀번호 게이트입니다</h1>
  <p>이 화면(<code>/</code>)은 deck 전체 목록을 한곳에서 보는 대시보드로,
     <strong>배포 시 아무나 목록을 못 보게</strong> 비밀번호로 잠급니다.
     아직 <code>DASHBOARD_SECRET</code>·<code>DASHBOARD_PASSWORD</code>가
     설정되지 않아 잠겨 있습니다.</p>
  <p>로컬 작업에는 대시보드가 필요 없습니다 — 만든 deck은 바로 열 수 있습니다:</p>
  <pre>http://localhost:3000/slides/&lt;deck-slug&gt;/</pre>
  <p class="muted">대시보드를 켜려면 <code>.env.local</code>에 다음을 추가하세요:</p>
  <pre>DASHBOARD_SECRET=&lt;랜덤 문자열 · 예: openssl rand -hex 32&gt;
DASHBOARD_PASSWORD=&lt;원하는 비밀번호&gt;</pre>
</main>
</body>
</html>`;

export async function middleware(req: NextRequest) {
  const secret = process.env.DASHBOARD_SECRET;
  const password = process.env.DASHBOARD_PASSWORD;

  // The gate needs both halves: a secret to sign sessions and a password to
  // check against. Missing either => the login flow can't succeed, so show the
  // setup hint rather than failing (raw 500 here, or a 500 from /api/login).
  if (!secret || !password) {
    return new NextResponse(SETUP_HINT, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie) {
    const payload = await verifySession(cookie, secret);
    if (payload) return NextResponse.next();
  }

  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('redirect', req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}
