# DXCare Marketplace

DXCare 팀용 Claude Code 플러그인 마켓플레이스.

## 설치

```bash
# 1) 마켓플레이스 추가
claude plugin marketplace add dxcare/dxcare-marketplace

# 2) 플러그인 설치
claude plugin install dxcare-web-slide@dxcare
```

## 수록 플러그인

| 플러그인 | 설명 |
|----------|------|
| `dxcare-web-slide` | HTML 웹 프레젠테이션 생성·관리·배포 플러그인. 자연어 스킬 5종(init/new/work/milestone/deploy), 16개 테마 프리셋, 데이터 차트, PDF 내보내기, 멀티-호스트 배포. |

## 구조

```
dxcare-marketplace/
├─ .claude-plugin/
│  └─ marketplace.json        # 마켓플레이스 정의 (name: dxcare)
└─ plugins/
   └─ dxcare-web-slide/       # 번들 플러그인 소스
```

플러그인은 마켓플레이스 repo 안에 번들되어 있어 별도 repo 관리가 필요 없습니다.
