---
name: dxcare-web-slide:deploy
description: Publish a DXCare slide deck to a shareable web link. Offers a temporary account-free link (Cloudflare quick tunnel) or a persistent link on a chosen host (Vercel / GitHub Pages / Cloudflare Pages) via a flattened static bundle, plus the legacy dynamic-monorepo Vercel deploy. Use when the user wants to share or publish slides. Trigger keywords (Korean) — 배포, 올려, 공유, 링크, 프로덕션 반영, 실배포. Trigger keywords (English) — deploy, ship, share, publish, push live.
---

# dxcare-web-slide:deploy

Publish a deck to a shareable link. Three ways, by need:

| 방식 | 명령 | 계정 | 지속성 | 비고 |
|------|------|------|--------|------|
| **임시 공유** | cloudflared quick tunnel | **0** | ephemeral(맥 켜진 동안) | 변환 0, 즉시. "지금 잠깐 보여줘" |
| **영구 — 단일 deck** | `pnpm deploy-static --slug <slug> --host …` | 호스트별 | 영구 | 평탄화 후 Vercel/GitHub Pages/Cloudflare 택1 |
| **영구 — 동적 monorepo** | `pnpm deploy` (legacy) | Vercel | 영구 | 대시보드+auth+전체 slides, 동적 Next |

All bash blocks use:
```bash
ROOT=$(node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/dxcare-web-slide}/bin/locate.mjs")
cd "$ROOT"
```
If `locate.mjs` fails, surface the error and stop.

## Procedure

### 0. 공유 방식 결정 (AskUserQuestion)

요청에 호스트/방식이 명시돼 있지 않으면 물어본다:

```yaml
question: "어떻게 공유할까요?"
header: "공유 방식"
options:
  - label: "임시 링크 (계정 0, 즉시)"
    description: "cloudflared 터널 — 지금 잠깐 보여주기. 맥 켜진 동안만, URL 매번 바뀜."
  - label: "영구 — Cloudflare Pages"
    description: "무료·상업OK·대역폭무제한·한국 빠름. CF 계정 1회."
  - label: "영구 — GitHub Pages"
    description: "이미 GitHub 있으면 새 계정 0. 무료·영구. 항상 공개."
  - label: "영구 — Vercel"
    description: "이미 쓰던 곳. 정적 배포라 SSO 없이 공유 가능."
```

### A. 임시 링크 — cloudflared 터널 (계정 0)

전제: dev 서버 실행 중(`pnpm dev`, 보통 :3000). `cloudflared` 설치(`brew install cloudflared`, 미설치 시 안내).

```bash
cloudflared tunnel --url http://localhost:3000
```
출력된 `https://<랜덤>.trycloudflare.com` 을 사용자에게 전달. 안내: "맥 켜진 동안만 유효, URL 은 매 실행 바뀜. 접근 차단은 deck 의 자체 auth 로." (`~/.cloudflared/config.yaml` 존재 시 quick tunnel 이 안 뜸 → 임시 rename 안내.)

### B. 영구 — 단일 deck 정적 배포 (Vercel / GitHub Pages / Cloudflare)

평탄화(`bundle`) 후 선택 호스트로. 한 명령으로 처리:

```bash
ROOT=$(node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/dxcare-web-slide}/bin/locate.mjs")
cd "$ROOT"
pnpm deploy-static --slug <slug> --host vercel|ghpages|cfpages [--project <name>] [--prod]
```

이 스크립트가 `pnpm bundle <slug>`(host-agnostic flat 폴더 = `/_shared/` 절대경로를 상대로 재작성 → 루트·서브경로 둘 다 작동) 후 호스트에 올리고 `{host, slug, url}` JSON 을 출력한다.

**호스트별 1회 전제(첫 배포 시 인증 — 이때 실제 동작·URL 확정):**
- **cfpages** — `npx wrangler login` 또는 `CLOUDFLARE_ACCOUNT_ID` + API 토큰.
- **ghpages** — `gh auth login`(또는 git push 권한). 첫 배포 후 repo Settings→Pages 에서 source=`gh-pages` 브랜치 1회 활성화. URL = `https://<owner>.github.io/<repo>/`.
- **vercel** — `vercel login`(이미 쓰던 계정). ⚠️ **preview 배포는 팀 Deployment Protection 에 401 로 막힌다**(e2e 실측 — 정적이어도 `_vercel_sso_nonce` 게이트). 실사용 팁(Noel 운영): **prod 링크(`--prod`)를 직접 공유**하면 Protection 영향 적어 문제 없음. preview 를 외부 공유하려면 Settings→Deployment Protection 해제 또는 `?x-vercel-protection-bypass=<secret>` 토큰. "그냥 공개 링크"엔 ghpages/cfpages(기본 공개)가 마찰 더 적음.

### C. 영구 — 동적 monorepo (legacy `pnpm deploy`)

대시보드 + auth + 전체 slides 를 Vercel 동적으로(기존 흐름). 단일 deck 공유엔 B 가 더 간단.

```bash
pnpm deploy          # preview (⚠️ preview 는 Vercel SSO 보호 → 외부 공유 불가)
pnpm deploy --prod   # production
```

## 결과 처리

**B (`deploy-static`)** — stdout JSON `{host, slug, url}`:
- `url` 비어있지 않으면: "배포 완료 (<host>). URL: <url>" + 공개 접근 확인 `curl -sI <url>` 200 권장. ghpages 는 Pages 전파 수십초 지연 가능.
- `error: bundle_failed` (exit 3): bundle stderr 표시(미존재 slug / theme.css 부재 등).
- `error: <host>_failed` (exit 5): `hint` + stderr 표시 — 대개 호스트 미인증(위 전제 명령 안내).

**C (`pnpm deploy`)** — 기존 JSON: exit 2 git_dirty / 3 tests_failed / 4 build_failed / 5 vercel_failed.

## 접근제어 (중요)

정적 무료 호스트(GitHub Pages / 기본 CF Pages / 정적 Vercel)는 **기본 공개**. 추측불가 slug 는 보안이 아니다(링크 유출·검색). 민감 deck 은:
- 공유하지 않거나, 동적 monorepo(C)의 자체 auth 유지, 또는
- Cloudflare Access(이메일 OTP, 무료) / Netlify `_headers` Basic Auth 같은 호스트 접근제어.
deck 의 `noindex` 는 검색 차단일 뿐 접근 차단이 아님.

## Guardrails

- 호스트 CLI(`vercel`/`wrangler`/`gh`/`cloudflared`) 미설치·미인증이면 정확한 설치/로그인 명령을 안내하고 멈춘다 — 조용히 `npm i -g` 하지 않는다.
- legacy `pnpm deploy`(C)는 git 깨끗함·test·build 게이트를 우회하지 않는다.
- 첫 호스트 배포는 사용자 계정/네트워크에 의존 — 결과 URL 을 `curl` 로 확인 후 보고(claimed-but-broken 회피).
