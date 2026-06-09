# Brand assets — deck 로고 라이브러리

이 폴더의 브랜드 로고가 새 deck 에 자동으로 들어갑니다. `dxcare-web-slide:new`
가 deck 을 만들 때 브랜드를 골라(여러 개면 물어봄, 하나면 그대로) 그 브랜드의 로고를
`slides/<slug>/assets/` 로 복사하고 deck 에 **역할별로** 배선합니다.

> 기본 라이브러리는 비어 있습니다. 브랜드를 추가하기 전에는 deck 이 **로고 없이**
> 생성됩니다(graceful). 아래 가이드대로 회사/팀 로고를 넣으면 그때부터 배선됩니다.

## 역할 (roles) — 같은 브랜드, 다른 활용

| 역할 | 쓰임 | deck 위치 | 테마 |
|------|------|-----------|------|
| `mark`    | 코너 워터마크 (은은) | 모든 슬라이드 좌하단 (`.brand-mark`) | 다크/라이트 자동 스왑 |
| `hero`    | 표지 로고 (크게)     | 1번(표지) 슬라이드 제목 위 (`.hero-mark`) | 다크/라이트 자동 스왑 |
| `favicon` | 브라우저 탭 아이콘    | `<link rel="icon">` | 단일 |

`brand.json` 의 `roles` 가 역할 → 파일을 선언합니다. 배경 기준 네이밍 (`on-dark` =
어두운 배경 위에 얹는 = 밝은 로고) 이라 deck 테마와 1:1 매칭됩니다.

```json
{
  "name": "DXCare",
  "default": true,
  "roles": {
    "mark":    { "on-dark": "inline-white.png",  "on-light": "inline-color.png" },
    "hero":    { "on-dark": "stacked-white.png", "on-light": "stacked-color.png" },
    "favicon": { "any": "symbol-color.png" }
  }
}
```

- 역할은 선택입니다 — 선언한 역할만 배선되고, 없는 역할은 비웁니다 (graceful).
- `favicon` 은 테마 스왑이 없어 `any` 한 파일을 씁니다.
- `roles` 가 없는 브랜드는 **flat 컨벤션**으로 폴백: `logo-on-dark.{svg,png}` /
  `logo-on-light.{svg,png}` 두 파일이 `mark` 로만 들어갑니다 (간단한 브랜드용).
- `svg` 우선 · `png` 폴백. 한쪽 테마만 있어도 그 슬롯만 채웁니다.

## 브랜드 추가 / 제거

- **추가**: `brand-assets/<브랜드명>/` 폴더 + 로고 파일 + `brand.json`(`{"name","roles"}` 또는 flat 파일만) 을 넣으면 `new` 가 다음부터 선택지로 띄웁니다.
- **기본 지정**: 한 브랜드의 `brand.json` 에 `"default": true` 를 주면 `new` 가 묻지 않고 그걸 씁니다.
- **제거**: 폴더를 지우면 됩니다. 모두 지우면 deck 은 로고 없이 만들어집니다.

> 라이브러리는 프로젝트(폴더)당 1벌 (`init` 이 복사). 같은 프로젝트의 모든 deck 이 공유하되, 각 deck 은 만들 때 고른 로고의 **사본**을 자기 `assets/` 에 가져가므로 배포(평탄화) 시에도 self-contained 합니다.
