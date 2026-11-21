# What is this PR?

<!-- 제목 = Conventional Commits (예: feat(web): add ...) — type 라벨 자동 부착 -->
<!-- 무엇이 바뀌었나 1문장 + 주요 로직 요약. 리스크 / 배포 영향(env, DB, Dockerfile)도 여기 -->

## Links

- task: `agent-work/<epic>/done/<id>.md`
- spec: `docs/specs/<kind>/<entity>.md`
- adr: `docs/adr/NNNN-<slug>.md` | none

## Why PR?

- [ ] 새로운 기능 추가
- [ ] 리팩토링
- [ ] 버그 수정
- [ ] 문서 수정
- [ ] 빌드 부분 패키지 매니저 수정 및 라이브러리 업데이트
- [ ] 코드 스타일 수정 (prettier)
- [ ] 테스트 추가, 테스트 리팩토링
- [ ] UI 수정

## Changes

<!-- commits:start (자동 생성 — 이 블록은 push 마다 덮어씀) -->

_커밋 목록은 PR 생성 / push 시 자동으로 채워집니다._

<!-- commits:end -->

## Ship gate

- [ ] 로컬 검증 — `pnpm check-types` · `pnpm lint` · `pnpm test`
- [ ] 적대적 리뷰 통과 — task `review: passed`
- [ ] 작업 기록 압축 — `## 최종 사양` · `## 예외 케이스` · `## 결정` · `## 검증`
- [ ] ADR 작성 또는 `adr: none — 사유`
- [ ] 현재 사양 갱신 (`docs/specs/`)
- [ ] 스크린샷 + 사용 설명서 갱신 (`pnpm spec:shots`)
- [ ] `pnpm ship:check` green
