# Changelog

All notable changes to `dxcare-web-slide` are documented here. v0.2.0 is a ground-up rewrite of the v0.1.x plugin, living on the same GitHub repo; v0.1.x entries at the bottom describe the pre-rewrite shape.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow SemVer. v0.2 breaks v0.1 trigger names and scaffolding — see README §Upgrading. The `0.x` line signals the interface is still open for adjustment; v1.0 will stabilize once real users exercise it.

## [Unreleased]

### Planned for v0.4+
- `MIGRATION.md` edge-case 확장 — custom theme CSS · per-deck assets folder · version-hub migration · PDF export API differences
- Plugin-internal `package.json` lockfile for CI cache
- 차트 ECharts 옵션 (복잡 데이터 시각화), Mermaid 다이어그램 보조

---

## [0.3.10] — 2026-06-10

> 단독 HTML 내장 플레이어의 내비게이션 패리티 픽스.

### Fixed
- **마우스 휠 내비게이션 누락** — `html-export.js` 내장 미니 플레이어에 navigation.js와 동일한 휠 핸들러 추가 (deltaY 누적, 임계 60, 200ms 유휴 리셋 — 물리 스크롤 1회 = 슬라이드 1장). 같은 패리티 갭이던 **슬라이드 표면 클릭→다음 장**(버튼·링크·컨트롤 제외)과 **카운터 클릭→첫 슬라이드**도 함께 보강. 실제 휠/클릭 입력으로 양방향 전환 검증.

---

## [0.3.9] — 2026-06-10

> **단독 HTML 내보내기.** 서버 기동 없이 `file://`로 더블클릭해 열 수 있는 단일 HTML 파일 다운로드 — 오프라인 시연·이메일 전달용.

### Added
- `_shared/js/html-export.js` — 덱 컨트롤 바에 `H` 버튼 추가 (`data-action="html"`). 같은 출처 CSS(base/diagrams/a11y/print/theme)를 `<style>`로 인라인, `<img>`·favicon은 data URI 임베드, `<슬러그>-standalone.html`로 저장.
- **내장 미니 플레이어** — `slide-core.js`는 ES 모듈이라 `file://`에서 CORS로 차단되므로, 내보내기 파일에는 일반 인라인 스크립트로 핵심 동작을 재구현: `data-active` 활성화 모델(entry reveal 동작), 키보드(←/→/Space/Home/End/T)·버튼·닷·스와이프 내비, 테마 토글, 진행바, 해시 딥링크.
- `pptx.js`의 `imgToDataUrl` export — HTML exporter와 공유.

### Notes / trade-off
- 웹폰트(Pretendard·세리프) CDN `<link>`는 유지 — 온라인이면 동일 렌더, 완전 오프라인이면 시스템 폰트로 graceful 대체. 임베드 시 파일이 수 MB로 커져 의도적으로 제외 (현재 ~1MB).
- PDF/PPTX 버튼은 CDN 의존이라 내보내기 파일에서는 제외.

---

## [0.3.8] — 2026-06-10

> PPTX 내보내기 **콘텐츠 fit**. 화면 디자인의 칼럼 여백·수직 센터링 공백을 걷어내고, 콘텐츠가 16:9 슬라이드를 꽉 채우도록 균일 확대.

### Changed
- `_shared/js/pptx.js` — 슬라이드별 2-패스 변환: ① 실제 emit될 요소들의 경계 박스 측정 → ② 박스가 가장자리 여백 0.35in을 남기고 슬라이드를 채우도록 균일 확대(폰트/자간/테두리/코너 반경 동일 비율, 상한 2×). 오프셋은 원본 슬라이드 중심을 유지하는 값을 우선해(가운데 정렬 푸터 등 디자인 기준점 보존) 여백 범위로 클램프.
- 텍스트 측정·배치를 블록 rect 대신 **실제 그려진 텍스트의 타이트 박스**(Range) 기준으로 변경 — 빈 칼럼 폭을 포함한 전폭 블록이 (1) fit 확대를 막고 (2) 확대 후 텍스트 박스가 슬라이드 밖으로 넘쳐 가운데/오른쪽 정렬을 어긋나게 하던 문제 해결.

---

## [0.3.7] — 2026-06-10

> **편집 가능한 PPTX 내보내기.** PDF의 래스터 캡처와 달리, 슬라이드 DOM을 PowerPoint 네이티브 객체로 변환 — 다운로드 후 PowerPoint/Keynote에서 텍스트·도형을 그대로 수정할 수 있다.

### Added
- `_shared/js/pptx.js` — PptxGenJS(CDN) 기반 PPTX exporter. 덱 컨트롤 바에 `P`(다크)/`P☀`(라이트) 버튼 추가 (`data-action="pptx"`).
  - 텍스트 → 실제 텍스트 박스. per-run 폰트/크기/색/굵기/자간 보존 — 인라인 `<small>`/`<em>`/`<strong>`은 런 분리, `<br>`은 줄바꿈, `text-transform`은 텍스트에 직접 적용
  - 배경/테두리를 가진 요소(카드·비교표 셀 등) → `rect`/`roundRect` 도형 (border-radius → rectRadius, rgba alpha → transparency)
  - `<img>` → 그림 개체 (cross-origin taint는 건너뛰고 export 계속)
  - **항상 16:9 고정** (10in × 5.625in, PowerPoint 표준 와이드) — 추출은 데스크톱/모바일 공통으로 1920×1080 히든 iframe에서 수행해 브라우저 창 비율과 무관하게 결과가 결정적. 테마도 iframe에만 적용되어 메인 화면이 깜빡이지 않음
- `pdf.js` 공용 헬퍼 export — `buildOverlay` / `prepareMobileIframe` / `sleep` / `deckFileBase` (파일명 규칙을 PDF·PPTX가 공유)
- `_templates/index.html` — pptxgenjs@3.12.0 CDN + PPTX 버튼 2개 + `initPptxButton()` 배선

### Fixed (구현 과정에서 잡은 함정 — 회귀 방지용 기록)
- 테마 전환 transition 도중 `getComputedStyle`을 읽으면 중간 보간색이 캡처됨 → iframe에 테마를 사전 적용하고 전역 `transition: none` 주입으로 원천 차단
- `pdf-capture`의 `.slide { position: static }`은 슬라이드 높이를 콘텐츠 높이로 붕괴시킴 → PPTX 경로는 iframe에서 `pdf-capture`를 해제해 absolute 레이아웃(뷰포트 크기·수직 센터링) 보존

### Design trade-off
- 그라데이션·글로우·박스섀도·pseudo-element 장식은 의도적으로 드롭 — 편집성이 목표. 픽셀 충실도가 필요하면 기존 PDF 버튼 또는 `pnpm export-pdf` 사용.

---

## [0.3.6] — 2026-06-04

> 브랜드 로고 **역할별** 활용 + 풀세트 동봉. 코너 마크 하나에 그치지 않고 표지 hero·favicon 까지 자동.

### Added
- **로고 역할 매니페스트 (mark / hero / favicon)** — `brand.json` 의 `roles` 가 역할→파일을 선언하고 `create-slide` 가 역할별로 배선한다: **mark**(코너 워터마크, `.brand-mark`), **hero**(표지 슬라이드 로고, `.hero-mark` — 제목 위, 크게), **favicon**(`<link rel="icon">`). mark·hero 는 테마별(`on-dark`/`on-light`) 자동 스왑, favicon 은 단일(`any`). 각 역할 파일을 deck `assets/` 로 복사해 배포 평탄화에도 self-contained. 역할/파일 없으면 graceful(빈 슬롯).
- **DXCare 로고 풀세트 동봉** — symbol·inline·stacked·wordmark(EN)·wordmark(KR) × 색상(color/white/violetbg, EN 은 black/white/blue/violet) 16종을 `brand-assets/dxcare/` 에 lockup-색상 네이밍으로. 역할에 다른 변형을 쓰려면 `brand.json` 파일명만 교체. 기본 매핑: mark=inline, hero=stacked, favicon=symbol.
- **flat 컨벤션 폴백 유지** — `roles` 없는 브랜드는 `logo-on-dark`/`logo-on-light` 두 파일이 mark 로만 들어간다(간단 브랜드용).

### Fixed
- hero 로고가 `.slide-content` flex column 의 `align-items:stretch` 로 콘텐츠 폭 전체로 늘어나 왜곡되던 문제 — `.hero-mark { align-self: flex-start }` 로 intrinsic 비율 유지(양 테마 Chromium 렌더로 확인).

### Verified
- create-slide 단위 테스트 16개(역할 매니페스트 mark/hero/favicon 배선 + 부분 매니페스트 graceful + flat 폴백 + svg우선 + none) + 샌드박스 e2e(init 풀세트 복사 → `new --brand dxcare` → 3역할 배선) + **양 테마 실제 렌더로 코너 mark·표지 hero 시각 확인**.

---

## [0.3.5] — 2026-06-04

> 브랜드 로고 자동 적용. 새 deck 이 회사 로고를 테마별 코너 마크로 자동 보유 — 플러그인 내장 브랜드 라이브러리에서, 셋업 없이.

### Added
- **브랜드 에셋 라이브러리 + 자동 로고 배선** — 플러그인이 `brand-assets/<brand>/` 라이브러리를 동봉(기본 `dxcare`: `logo-on-dark.png`·`logo-on-light.png`·`brand.json`)하고 `init` 이 프로젝트로 복사. `new` 가 deck 생성 시 브랜드를 골라(1개면 자동, 여러 개면 `AskUserQuestion`, "로고 없이"도 선택지) 해당 로고를 `slides/<slug>/assets/` 로 복사 + `index.html` 의 테마별 코너 마크(`.logo-dark`/`.logo-light`)에 배선한다. svg 우선·png fallback, 한쪽만 있어도 graceful, 둘 다 없으면 로고 없는 deck. 배경 기준 네이밍(`logo-on-dark` = 어두운 배경용=밝은 로고)이라 deck 테마와 1:1. deck `assets/` 사본이라 평탄화 배포(`bundle`)도 self-contained.
- **브랜드 추가/제거** — `brand-assets/<name>/` 폴더 + `brand.json`(`{"name","default"}`) 추가/삭제로 관리. 자세한 규칙은 `brand-assets/README.md`.

### Changed
- `new` 스킬 confirm 단계가 멀티-deck 레이아웃을 명시 — 각 deck 은 자기 `references`/`skeleton`/테마를 가진 독립 하위폴더이고, 슬라이드를 더 만들 땐 폴더를 새로 만들지 않고 `new` 만 반복(같은 프로젝트의 `slides/` 아래 나란히 쌓임). 기존 sibling deck 이 있으면 목록을 보여준다.

### Verified
- create-slide 단위 테스트 14개(브랜드 복사·svg우선·explicit brand·`none`·라이브러리 부재 graceful) + 샌드박스 e2e(init→new --brand dxcare→deck assets 배선) + **양 테마 실제 Chromium 렌더로 코너 로고 시각 확인**(다크=흰 로고 가시, 라이트=컬러 로고 가시).

---

## [0.3.4] — 2026-06-04

> 온보딩 첫인상 픽스. 갓 scaffold 한 레포에서 대시보드 root(`/`)가 환경변수 미설정 시 날것 500 을 뱉던 문제 해결.

### Fixed
- **대시보드 root 500 → 설정 안내** — `DASHBOARD_SECRET`/`DASHBOARD_PASSWORD` 미설정 시 middleware 가 raw `Internal server error`(500) 대신 self-contained 안내 페이지(200, dark/light 대응)를 반환한다. "대시보드는 배포용 비밀번호 게이트이고, 로컬 deck 은 `/slides/<slug>/` 에서 바로 열리며, `.env.local` 에 두 변수를 넣으면 켜진다"를 안내. 게이트가 **두 변수 모두** 있을 때만 작동하게 바꿔, secret 만 설정됐을 때 `/api/login` 이 뱉던 부차 500 도 제거. 설정 완료 시(양쪽 변수) 기존대로 `/login` 리다이렉트 — 3상태(미설정 / 양쪽 / secret만) 라이브 검증.

### Changed
- `init` 스킬 post-init 안내가 `# preview dashboard at http://localhost:3000` → `http://localhost:3000/slides/<slug>/` (root 은 배포용 게이트임을 명시). 신규 deck 미리보기를 처음부터 올바른 경로로 안내.

### Notes
- 리포가 플러그인 surface 만 추적하도록 정리 — dxcare-agile 워크플로우 파일(`BACKLOG.md`/`proposals/`/`docs/handoff/`/`dxcare-agile.config.yaml`)은 dev-time 작업환경이라 untrack + gitignore(디스크엔 유지, 히스토리 무변). 설치본·기능엔 영향 없음.

---

## [0.3.3] — 2026-06-04

> deck 평탄화 + 멀티-호스트 공유. Vercel 종속·preview SSO 공유불가에서 벗어나, 어느 정적 호스트로든 올리거나 계정 없이 즉시 터널 공유.

### Added
- **host-agnostic 평탄화 `pnpm bundle <slug>` (B-020)** — deck 을 `dist/<slug>/` flat 폴더로. 루트절대 `/_shared/` 참조를 **각 파일 위치 기준 상대경로로 재작성** → 루트 서빙이든 GitHub project Pages `/<repo>/` 서브경로든 작동(절대경로는 서브경로서 깨지고 `<base href>` 로도 못 고침). rich deck 은 `_shared/` 0참조라 passthrough.
- **멀티-호스트 배포 `pnpm deploy-static --slug <slug> --host vercel|ghpages|cfpages` (B-020)** — 평탄화 후 선택 호스트 배포 + 호스트별 URL 파싱. deploy 스킬이 임시(cloudflared 터널, 계정 0) / 영구(3택)를 `AskUserQuestion` 으로 분기 + 접근제어 경고.
- snippet: `bundle`/`deploy-static` script + `playwright`/`pdf-lib`/`gh-pages` optionalDependencies. scaffold-gitignore: `dist/`.

### Fixed / Notes
- **e2e 실측 정정** — (1) Vercel CLI 출력 URL 파싱이 `Preview: …vercel.app [4s]` 접두/접미를 못 잡던 버그 수정(전역 정규식). (2) "정적 배포는 SSO 무관 공유"는 **거짓** — 팀 Deployment Protection 은 정적 배포도 401 로 막음(`_vercel_sso_nonce` 실측). Vercel 외부 공유 = prod 링크 직접 공유 또는 Protection 해제/bypass 토큰. GitHub Pages·Cloudflare Pages 는 기본 공개라 "그냥 공유"엔 마찰 적음.
- bundle 은 실 rich deck(value-up-vision 16슬라이드) + skeleton fixture 서브경로 렌더로 검증. GitHub/CF 배포 경로는 로직완성 + parseUrl 단위테스트, 첫 실사용 시 인증·URL 확정.

---

## [0.3.2] — 2026-06-03

> 생성 품질 가드 + "화면 그대로" PDF. 경쟁 도구 리서치(Slidev/reveal/Gamma/Claude Design)에서 도출한 두 가지.

### Added
- **WYSIWYG PDF export `pnpm export-pdf` (B-019)** — `--slug <slug> [--theme light|dark] [--scale 2] [--out]`. Playwright `page.screenshot()`(실제 Chromium 컴포지터)로 슬라이드별 캡처 → `pdf-lib` 16:9 조립. box-shadow·blur·gradient·glassmorphism 가 화면과 픽셀 동일. 내장 정적 서버(repoRoot, path-traversal 가드)로 `/_shared/` 해결, 슬라이드 직접 활성화(absolute-fade·scroll-snap 양 모드). `playwright`+`pdf-lib` optionalDependencies(dev-time — shipped deck 무변, self-contained 유지).
- **AI slop 안티패턴 가드 (B-018)** — `skills/new/SKILL.md` 생성-side 금지목록(장식 emoji·gradient 남용·rounded+left-border 클리셰·data slop·filler·placeholder SVG·균일 회색 grid·폰트 fallback) + `slide-reviewer` §8 리뷰-side 정적 스캔(경고 등급, §7/§7-C 만 production 블로킹).

### Changed
- README PDF 섹션 — 기존 html2canvas in-browser 버튼(빠름)과 신규 `export-pdf`(WYSIWYG, dev-time)를 용도별로 분리 문서화.

### Notes
- 벡터 PDF(브라우저 print 엔진)는 평가 후 기각 — box-shadow/blur 를 드롭/변형(`proposals/B-019-context.md`). html2canvas 는 렌더링 재구현이라 color-mix·backdrop-filter 에 구멍 → "보이는대로"엔 실엔진 screenshot 만 신뢰 가능.
- named-layout(리서치 후보)은 보류 — 반쪽 도입 시 freeform 보다 품질 저하 우려.

---

## [0.3.1] — 2026-06-02

> 테마 시각 선택 UX. deck 작성 시 16 preset 을 갤러리로 보고 터미널에서 고른다 — 이름만으론 못 고르던 첫 단계 UX 해소.

### Added
- **테마 시각 선택 UX (B-016)** — `dxcare-web-slide:new` 가 theme 미지정 시 갤러리(`_templates/theme-examples/index.html`)를 `file://` 로 띄우고(claude-in-chrome 가용 시, 시각 참고용), 실제 선택은 터미널 `AskUserQuestion`(카테고리 묶음 + 1줄 blurb). 브라우저 못 띄우는 환경은 선택지만으로 fallback(3분기).
- **갤러리 16 preset 완성** — base 4종(corporate/warm/minimal/keynote-dark) 카드 + 8장 샘플 추가(기존 트렌드 12 + base 4 = 16), 헤더 카운트 `cards.length` 자동.
- **`theme-catalog.mjs` 단일 출처(SSOT)** — 16 preset json 의 `category`/`description`/`mood` 를 읽어 AskUserQuestion 선택지 · `themes-reference.md` · new 안내에 공급(`--format=md`). 하드코딩 분류 제거 → drift 봉인.
- preset json 16개에 `category`(investor/tech/education/creative/basic) + `description` + `mood` 필드. `ci-validate-presets` 가 누락 차단.

### Fixed
- **`new` 스킬 구식 테마 안내** — `corporate/warm/minimal` 3개만 안내하고 "그 밖이면 stop" 하던 가드를 16 preset 흐름으로 갱신.
- **`themes-reference.md` 3번째 색 SSOT 폐기** — 구형 367줄 손-문서(12종·`--bg-primary` 변수)를 json 토큰 기반 16종 생성 문서로 교체.
- **갤러리 샘플 light 테마 secondary label 대비 (B-016 base4 + B-017)** — light `--text2`(muted)가 흰 카드 위 2.4~2.9:1 로 WCAG 1.4.3 미달이던 결함을 concrete hex darken 으로 ≥4.5:1 로 수정(base4 + corporate-slate·electric-ink). 브라우저 양 테마 실측 게이트(B-010).

### Verification
- 단위 테스트 신규: `theme-catalog` · `themes-reference`(drift 가드) · `create-slide` 회귀(비-base preset 수용 + 미존재 reject). 브라우저 실측: 갤러리 16 카드 + 샘플 dark/light 카드 대비 전부 ≥4.5:1. planning-tenacity 2R(CRITICAL 0) + tenacity-verifier PASS.

---

## [0.3.0] — 2026-06-02

> Rich Deck 품질 정합 (D1~D8) + 데이터 차트 모듈. `docs/UPGRADE-TO-STANDARD.md` 명세 기반 — 단순 skeleton 슬라이드뿐 아니라 리치 커스텀 deck 을 골드 스탠다드 품질로 산출.

### Added
- **Rich Deck 모드 1급 지원 (D8)** — self-contained scroll-snap deck 을 dev route 가 그대로 서빙. `_shared/css/tokens.css` 분리로 rich deck 이 구조 규칙 없이 디자인 토큰만 opt-in 상속. `lib/deck-mode.ts` 모드 감지 + `docs/RICH-DECKS.md`.
- **데이터 차트 opt-in 모듈 (Chart.js@4.4)** — 막대/선/파이/도넛, theme 토큰 연동(다크/라이트 토글 시 재채색), PDF 호환, canvas↔DOM 어댑터 3(themechange 이벤트·hex→rgba·픽셀 대비). `_shared/js/charts.js` + `docs/CHARTS.md`.
- **풀 내비게이션 + 진입 모션 (D3·D6)** — Up/Down/휠/클릭/세로터치/nav dots/카운터 점프 + `.slide-content` fade-up stagger reveal(`prefers-reduced-motion` 존중).
- **도식 9패턴 (D4)** — `diagrams.css` 레이어 스택/플로우·사이클/3열 그리드/비교표/gain 스트립/boundary-tag/데이터 테이블/pull-quote/role-crux. 일관 radius·border·accent.
- **`keynote-dark` 프리셋 (D7)** — 순수 블랙 + 밝은 블루 accent. deck 로고 다크/라이트 자동 스왑.
- **slide-reviewer §7/§7-C 게이트** — 양 테마 카드(getComputedStyle)·차트(canvas getImageData 픽셀) 대비를 실제 렌더로 실측. 정적 grep 한계 차단.
- **`--migrate-config` 옵션** — 구버전 consumer 의 stale config(trailingSlash 등) 옵트인 갱신(`.dxcare-slide-backup/` 백업). `MIGRATION.md`.
- legacy preset 12개 accent 키 정합 + `theme.css` accent→rgba tint 파생.

### Fixed
- **Pretendard Variable 실제 로드 (D1)** — scaffold 가 폰트를 참조만 하고 로드 안 하던 결함 + preset font family 정합. 한/영 antialiasing.
- **bound stage 중앙 정렬 (D2)** — 대형 화면 좌측 쏠림 해소(`max-width:min(1200px,90vw)`).
- **다크 테마 도식 카드 가시성** — `:root` var()-간접 alias 가 라이트값으로 고정돼 다크에서 흰배경+흰텍스트로 안 보이던 결함을 `[data-theme=dark]` 재정의로 해소.
- plugin manifest 설치 거부 — `.claude-plugin/plugin.json` + `skills/<name>/SKILL.md` 구조 정합.
- `officeparser` cross-section 중복(init), `theme-css.test` strict tsc TS18048 4건.
- vitest/vite/esbuild 보안 advisory (dependabot).

### Changed
- 테마 토큰을 `tokens.css` 로 분리(구조-free) — base.css 는 `@import` + 구조 규칙.

---

## [0.2.4] — 2026-04-21

### Fixed
- **officeparser v6 API rename silently killed every PDF/DOCX/PPTX extraction.** `import('officeparser').parseOfficeAsync` stopped existing in v6; the symbol is now `parseOffice`. The in-suite tests injected `parseOfficeAsync` as a mock so they passed, while real usage threw `parse is not a function` and reported every office file as `skipped` in `pnpm extract-refs`. Switches to `parseOffice`.
- **officeparser v6 returns a structured node tree, not a string.** After fixing the rename, every file tripped `text.trim is not a function` because v6 hands back `{ content: [{ type: 'page', children: [{ type: 'paragraph', text }] }] }`. Adds a `flattenOfficeTree()` walker that collapses the tree into markdown-compatible text (paragraphs keep their own `.text` to preserve line integrity; pages/slides separate with a blank line). Regression test injects a synthetic v6 tree and asserts leaf text reaches the output.
- **`pnpm dev` skipped the meta aggregator**, so decks scaffolded mid-session stayed invisible in the password-gated dashboard until a `prebuild`. Chains `node scripts/aggregate-meta.js` into the `dev` script inside `templates/package-snippet.json`.
- **`trailingSlash: false` broke relative asset resolution.** Next.js's default trailing-slash behavior 308-redirected `/slides/<slug>/` to `/slides/<slug>`, making the browser resolve `./theme.css` against `/slides/` and return 404 for every theme except the ones that happened to look OK under unstyled defaults. `templates/repo/config/next.config.js` now sets `trailingSlash: true`.

Discovery method: post-v0.2.3 dogfood verification from a consumer repo (`~/Strategy`). Code review, CI, and two adversarial reviewers had all passed v0.2.3; only end-to-end browser + CLI exercise surfaced the blockers. Full verification trace lives in `docs/handoff/2026-04-20-v0.2.4-release-and-strategy-migration.md`.

---

## [0.2.3] — 2026-04-20

### Fixed
- **PDF export died silently on `color-mix()`.** html2canvas (via jspdf) can't parse `color-mix()`, so the entire PDF pipeline short-circuited with no error surfaced to the user. `_shared/css/base.css` replaces `color-mix()` usages with explicit `rgba()` equivalents so the canvas rasterizer keeps working across themes.
- **PDF filename fell back to the literal `slides-`** when the deck title did not contain a `V\d+` version marker. Derives the filename from `document.title` directly so every deck gets a readable file instead of an opaque prefix.

## [0.2.2] — 2026-04-20

### Fixed
- **Duplicate `initTheme()` / `initPdfButton()` wiring.** Both `slide-core.js` and inline HTML scripts were calling `initTheme()`, so the second registration canceled the first theme-toggle handler — the T key and `[data-action="theme"]` button silently stopped responding. Same pattern for the PDF button. Made both initializers idempotent and removed the duplicate inline call in `_templates/index.html`.
- **Skeleton theme interpolation.** `_templates/skeleton.md` hardcoded `theme: corporate` regardless of the `--theme` flag passed to `create-slide`. Introduces a `{{THEME}}` placeholder that `scripts/create-slide.ts` substitutes at scaffold time.

---

## [0.2.1] — 2026-04-20

### Fixed
- **CLI entry guard on symlinked paths.** `bin/init.mjs` and all five bundled consumer scripts (`create-slide`, `snapshot-milestone`, `deploy`, `generate-theme-css`, `extract-references`) silently failed when invoked from a symlinked path. On macOS `/tmp` → `/private/tmp` caused `process.argv[1]` to differ from `fileURLToPath(import.meta.url)`, so the entry guard `argv[1] === __filename` never matched. Canonicalize `argv[1]` through `realpathSync` (with a graceful fallback) before comparing. Regression test spawns a subprocess from a symlinked tmpdir and asserts JSON output. Suite: 15 → 16 tests.

---

## [0.2.0] — 2026-04-20

Ground-up rewrite. Replaces every file in the v0.1.x plugin with a new scaffolding pipeline, test harness, portability model, and documentation surface. Six development phases (4A → 4F) squashed into this release.

### Added — Scaffolding and workflow
- `bin/init.mjs` — bootstraps any directory into a dxcare-web-slide-compatible repo. SHA-256 hash-diffs on overwrite, `--dry-run`, `--force` with per-file backup to `.dxcare-slide-backup/`, package.json non-destructive merge with conflict reporting.
- `bin/locate.mjs` — walk-up project-root resolver with `$CLAUDE_PROJECT_DIR` env override. Skills use it to stay portable across consumer repos.
- Five skill bundles (`init`, `new`, `work`, `milestone`, `deploy`) — natural-language triggers in Korean and English, classified intents, guardrails, SecondBrain MCP integration (graceful when absent).
- `scripts/create-slide.ts` / `snapshot-milestone.ts` / `deploy.ts` / `generate-theme-css.ts` / `extract-references.ts` — deterministic CLIs invoked from the skills via `pnpm`. All TDD.
- Auto-milestone snapshots before every re-render (`milestones/<date>-auto-HHMMSS/`) — mandatory rollback path per the design spec.

### Added — Visual system
- 15 theme presets (3 base + 12 production-validated from `dxcare-web-slide@0.1.0`): `apple-keynote`, `midnight-jewel`, `corporate-slate`, `neon-terminal`, `electric-ink`, `cyber-gradient`, `warm-earth`, `soft-botanical`, `paper-editorial`, `bento-pastel`, `retro-wave`, `stormy-night`, plus `corporate`, `warm`, `minimal`. Each carries `description` + `mood` metadata.
- `_templates/theme-examples/*.html` — 13 inspiration decks with README disclaiming the HTML is not the canonical preview (JSON presets are).
- `scripts/lib/theme-css.ts` + `pnpm generate-theme --slug <slug>` — renders `theme.css` from `theme.json` (preset + optional overrides). Group-aware prefixing: `color` group unprefixed (`--bg`, `--fg`), `font`/`radius`/`motion` prefixed (`--font-heading`, `--radius-md`).
- `_shared/js/theme-toggle.js` — `initTheme()` + `setTheme()` with `T` keyboard hotkey and `[data-action="theme"]` button handler.
- `_shared/js/pdf.js` — `generatePDF(theme)` + `initPdfButton()`. html2canvas + jspdf from CDN. Mobile renders via hidden 1920×1080 iframe to preserve desktop layout. Ported from the v0.1.x production path.
- `_shared/css/base.css` + `_shared/css/diagrams.css` — design-system tokens (clamp-based typography, spacing, radius, motion) and a diagram catalog (flow / comparison / timeline / card-grid / icon-stack / quote).

### Added — References pipeline
- `scripts/lib/references-extract.ts` + `pnpm extract-refs --slug <slug>` — walks `slides/<slug>/references/` (non-recursive), supports `.pdf .pptx .docx .md .txt`, writes `_extracted/<basename>.md` + `_index.md` manifest.
- `officeparser@^6.1.0` as an **optional** dependency — consumers who only use `.md`/`.txt` skip the heavy install.

### Added — Dev and release surface
- `README.md` — quickstart, 5-skill workflow table, content-layer design, 15 preset gallery, PDF + references sections, init flags, upgrading from v0.1 table, troubleshooting, credits.
- `LICENSE` — MIT (Copyright 2026 DXCare).
- `.github/workflows/test.yml` — two jobs: (a) **sanity** (plugin.json structure, skill frontmatter, preset schema, `locate.mjs` error-path, `init.mjs --dry-run` contract) and (b) **bundled-suite** (bootstrap a tmp consumer via `init.mjs`, then `pnpm install && pnpm test`).
- `scripts/ci-validate-plugin-json.mjs` + `scripts/ci-validate-presets.mjs` — factored-out CI validators; resolve inputs relative to their own location.
- `package.json` + `vitest.config.ts` — plugin-internal dev harness. `pnpm test` at the repo root runs 15 specs against `bin/init.mjs`; consumer-repo tests run inside the bootstrapped tree.
- `templates/scaffold-gitignore` — ships as `.gitignore` in every new consumer repo. Includes `.dxcare-slide-backup/`, Next.js + Vercel ignores.

### Breaking
- All v0.1.x `/slide:*` trigger names replaced with `dxcare-web-slide:*`. See README §Upgrading for the mapping. Internal backup directory kept as `.dxcare-slide-backup/` (short, name-neutral).

### Test posture
- 15 plugin-internal specs (init.mjs hash-diff / backup / force / dry-run / gitignore / merge / conflict).
- Consumer repo receives a further bundled suite (lib helpers, scripts helpers, auth, meta-aggregator). Post-`pnpm install && pnpm test`: ~68 passing.
- CSS cascade checker catches dangling `var(--x)` references.

---

## Pre-release development history

The v0.2.0 rewrite was developed in six phases (April 2026) on Strategy's local branch before being extracted into this standalone repo:

| Phase | Focus |
|-------|-------|
| 4A | Portability — `project-root.ts` walk-up + `bin/locate.mjs` bundled locator + skill markdown refactor (18 hardcoded `cd ~/Strategy` lines eliminated). |
| 4B | `dxcare-web-slide:init` bootstrap — `bin/init.mjs` + bundled `templates/repo/` + non-destructive `package.json` merge. |
| 4C | Carry-over — `theme.css` regeneration + `references/*` auto-extraction. |
| 4E-LEGACY | Ported the four production-validated assets from v0.1.x (PDF generator, 12 themes, diagram catalog, dark/light toggle runtime). |
| CSS-fix | Unified three incompatible CSS variable schemas; verified via Playwright. |
| 4F | Release packaging — README, LICENSE, CHANGELOG, CI, safe-overwrite hardening after two rounds of adversarial review. |

Detailed per-phase verification notes live in Strategy's `docs/superpowers/plans/2026-04-20-plan4*.md`.

---

## Pre-rewrite (v0.1.x — same repo, different code)

The v0.1.x plugin line that lived on this repo before the v0.2.0 rewrite provided: multi-source input, 12 theme gallery (HTML previews), dark/light toggle, PDF download (html2canvas + jsPDF), version-hub index, SEO block, multi-platform deployment (Vercel / Netlify / GH Pages / local). None of its trigger names (`/slide:*`) survive into v0.2.0; see the README §Upgrading table for the mapping. The v0.1.x line was never tagged on GitHub.
