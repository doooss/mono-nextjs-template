---
id: 261121_003_release-flow-tests
date: 2026-11-21
task: release-flow-tests
epic: 2611-template-bootstrap
status: drop
dropped-at: 2026-11-21
drop-reason: 테스트 원칙 — 과도한 테스트 삭제. release.mjs 는 분기 있는 순수 함수 테스트로 충분
related-code: [.github/scripts/release.mjs]
spec: []
adr: pending
review: pending
acceptance:
  - 명령별 성공 / skip / 차단 시나리오 테스트 green
links: [261121_001_monorepo-bootstrap, 리뷰 K18]
---

# 릴리스 명령 흐름 통합 테스트

## 목표

release.mjs 의 canary / stable / hotfix 명령은 pure 함수만 테스트돼 있다. 재실행 · hotfix 후 · 역머지 시나리오를 임시 git 저장소로 검증 (적대적 리뷰 K18 일부 이월).

## 범위

- in: 임시 저장소 기반 명령 흐름 테스트 (canary 번호, stable 재실행 skip, hotfix 재태깅 계획, main 전용 커밋 차단)
- out: 실제 GitHub API 호출

## Acceptance

- [ ] 명령별 성공 / skip / 차단 시나리오 테스트 green

## 체크리스트

- [ ] 구현
- [ ] 출고 게이트 (/ship-task)

## 메모

<!-- 진행 중 자유 기록. 출고(ship-task) 시 이 섹션은 삭제하고 본문을
     ## 최종 사양 / ## 예외 케이스 / ## 결정 / ## 검증 으로 압축한다 -->
