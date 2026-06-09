# Diagram Patterns Guide

슬라이드에 도식화가 필요할 때 이 패턴을 참조한다.
모든 도식은 테마 CSS 변수(`--accent`, `--text-primary`, `--card-bg` 등)를 사용해야 한다.

---

## 1. 프로세스 플로우 (CSS Flexbox)

```html
<div class="flow-diagram">
    <div class="flow-step">
        <div class="flow-number">1</div>
        <div class="flow-label">Input</div>
        <div class="flow-desc">데이터 수집</div>
    </div>
    <div class="flow-arrow">→</div>
    <div class="flow-step">
        <div class="flow-number">2</div>
        <div class="flow-label">Process</div>
        <div class="flow-desc">분석 & 변환</div>
    </div>
    <div class="flow-arrow">→</div>
    <div class="flow-step">
        <div class="flow-number">3</div>
        <div class="flow-label">Output</div>
        <div class="flow-desc">결과 도출</div>
    </div>
</div>
```

## 2. 비교표 (CSS Grid)

```html
<div class="comparison-grid">
    <div class="comp-header comp-before">Before</div>
    <div class="comp-header comp-after">After</div>
    <div class="comp-item comp-before">기존 방식 설명</div>
    <div class="comp-item comp-after">개선된 방식 설명</div>
    <div class="comp-item comp-before">수치 A</div>
    <div class="comp-item comp-after highlight">수치 B (향상)</div>
</div>
```

## 3. 타임라인 (CSS + Pseudo Elements)

```html
<div class="timeline">
    <div class="timeline-item">
        <div class="timeline-marker"></div>
        <div class="timeline-date">2024 Q1</div>
        <div class="timeline-content">
            <h4>Phase 1</h4>
            <p>파일럿 프로그램 시작</p>
        </div>
    </div>
    <div class="timeline-item">
        <div class="timeline-marker active"></div>
        <div class="timeline-date">2025 Q1</div>
        <div class="timeline-content">
            <h4>Phase 2</h4>
            <p>전국 확장</p>
        </div>
    </div>
</div>
```

## 4. 아키텍처 다이어그램 (Inline SVG)

```html
<svg viewBox="0 0 800 300" class="arch-diagram">
    <!-- 박스 -->
    <rect x="50" y="30" width="180" height="70" rx="10"
          fill="var(--card-bg)" stroke="var(--accent)" stroke-width="1.5"/>
    <text x="140" y="70" text-anchor="middle"
          fill="var(--text-primary)" font-size="14" font-weight="600">Frontend</text>

    <!-- 화살표 -->
    <line x1="230" y1="65" x2="320" y2="65"
          stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arrow)"/>

    <rect x="320" y="30" width="180" height="70" rx="10"
          fill="var(--card-bg)" stroke="var(--accent)" stroke-width="1.5"/>
    <text x="410" y="70" text-anchor="middle"
          fill="var(--text-primary)" font-size="14" font-weight="600">API Gateway</text>

    <!-- 화살표 마커 정의 -->
    <defs>
        <marker id="arrow" markerWidth="10" markerHeight="7"
                refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="var(--accent)"/>
        </marker>
    </defs>
</svg>
```

## 5. 데이터 카드 그리드

```html
<div class="data-cards">
    <div class="data-card">
        <div class="data-value">$4.3M</div>
        <div class="data-label">연간 매출</div>
        <div class="data-change positive">+23.5%</div>
    </div>
    <div class="data-card">
        <div class="data-value">15.2%</div>
        <div class="data-label">EBITDA 마진</div>
        <div class="data-change positive">+5.1pp</div>
    </div>
</div>
```

## 6. 순환 다이어그램 (SVG Circle)

```html
<svg viewBox="0 0 400 400" class="cycle-diagram">
    <!-- 중앙 원 -->
    <circle cx="200" cy="200" r="50" fill="var(--accent)" opacity="0.15"/>
    <text x="200" y="205" text-anchor="middle"
          fill="var(--accent)" font-size="14" font-weight="700">Core</text>

    <!-- 외부 노드 (120도 간격) -->
    <circle cx="200" cy="80" r="40" fill="var(--card-bg)" stroke="var(--card-border)"/>
    <text x="200" y="85" text-anchor="middle" fill="var(--text-primary)" font-size="11">Node A</text>

    <!-- 연결선 (arc path) -->
    <path d="M 200 120 L 200 150" stroke="var(--accent)" stroke-width="1.5"
          marker-end="url(#arrow)"/>
</svg>
```

## 7. Mermaid (CDN 필요 시)

Mermaid 사용 시 HTML에 추가:
```html
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>mermaid.initialize({ theme: 'dark', themeVariables: { primaryColor: 'var(--accent)' } });</script>
```

```html
<div class="mermaid">
graph TD
    A[사용자 입력] --> B{분석}
    B -->|텍스트| C[NLP 처리]
    B -->|이미지| D[CV 처리]
    C --> E[결과]
    D --> E
</div>
```

---

## 선택 가이드

| 도식 유형 | 권장 방식 | 이유 |
|-----------|----------|------|
| 2-5단계 프로세스 | CSS Flexbox (#1) | 간결, 반응형 |
| Before/After 비교 | CSS Grid (#2) | 정렬 깔끔 |
| 시간순 로드맵 | Timeline (#3) | 시각적 임팩트 |
| 시스템 구조도 | Inline SVG (#4) | 자유도 높음 |
| KPI/수치 강조 | Data Cards (#5) | 한눈에 파악 |
| 순환/반복 구조 | SVG Circle (#6) | 정확한 배치 |
| 복잡한 의존성 | Mermaid (#7) | 자동 레이아웃 |
