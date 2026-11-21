---
id: 261121_002_spec-shots-states
date: 2026-11-21
task: spec-shots-states
epic: 2611-template-bootstrap
status: pending
related-code:
  [apps/web/e2e, .github/scripts/ship-gate.mjs, .github/scripts/spec-pages.mjs]
spec: []
adr: pending
review: pending
acceptance:
  - page 사양에 상태별 스크린샷 선언 가능 · CI 가 같은 목록을 검사
  - current-spec.md 규칙 갱신
links: [261121_001_monorepo-bootstrap, 리뷰 F 확인 필요]
---

# 상태별 사양 스크린샷

## 목표

`spec:shots` 는 viewport 당 화면 1장만 찍는다. 데이터 화면의 loading / empty / error 상태 이미지를 남길 방법이 없다 (적대적 리뷰 확인 필요 항목).

## 범위

- in: frontmatter 로 상태 목록 + mock 주입 방식 정의, CI 계약(ship-gate)과 같은 파서 유지
- out: 시각 회귀 비교(diff)

## Acceptance

- [ ] page 사양에 상태별 스크린샷 선언 가능 · CI 가 같은 목록을 검사
- [ ] current-spec.md 규칙 갱신

## 체크리스트

- [ ] 구현
- [ ] 출고 게이트 (/ship-task)

## 메모

<!-- 진행 중 자유 기록. 출고(ship-task) 시 이 섹션은 삭제하고 본문을
     ## 최종 사양 / ## 예외 케이스 / ## 결정 / ## 검증 으로 압축한다 -->
