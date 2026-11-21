---
name: ship-task
description: >
  agent-work task 를 출고(done)한다 — 로컬 검증 → 적대적 리뷰(필수) → 작업 기록 압축 →
  ADR → 현재 사양 갱신(FE 는 스크린샷 + 사용 설명서) → 출고 커밋 준비. 구현이 끝났을 때,
  "출고", "ship", "마무리", "done 처리", "작업 완료" 요청 시 사용.
---

# Ship Task (출고 게이트)

규칙 본문: [agent-work.md](../../rules/agent-work.md) (게이트 순서) · [adversarial-review.md](../../rules/adversarial-review.md) · [adr.md](../../rules/adr.md) · [current-spec.md](../../rules/current-spec.md) · [commit-pr.md](../../rules/commit-pr.md). 충돌 시 rule 우선.

순서를 바꾸지 않는다. 각 단계 결과를 task 파일에 반영하며 진행.

## 0. 대상 확정

- `pnpm task:status` → 대상 task (보통 `progress/` 의 것). 없으면 사용자에게 확인.
- diff 범위 결정: 브랜치면 `git diff <base>...HEAD` + working tree, 아니면 `git diff HEAD` (staged + unstaged + untracked 포함 여부 확인).

## 1. 로컬 검증

`pnpm check-types` · `pnpm lint` · `pnpm test` (필요 시 `pnpm build`). 실패 = 여기서 멈추고 수정. 결과 명령 / 요약은 `## 검증` 에 쓸 것.

## 2. 적대적 리뷰 (필수)

`Agent` 툴, `subagent_type: adversarial-reviewer`. 프롬프트에 **이것만** 넣는다:

```
리뷰 대상 diff: <git diff 명령 또는 범위>
task: <task 파일 경로> (목표 / 범위 / Acceptance 만 근거로)
현재 사양: <docs/specs/... 경로들> (없으면 "신규 — 사양 없음")
```

구현 설명 · 내 판단 · "확인해줘" 식 유도 문구 금지.

finding 마다 판정 (수용 / 반박+근거 / 이월+새 task). 수용 건 수정 → 1 단계 재실행 → **새** reviewer 로 재리뷰. 미해결 blocking 0 까지. 3 round 초과 시 사용자 에스컬레이션.

통과 → frontmatter `review: passed (YYYY-MM-DD, rounds N)`.

## 3. 작업 기록 압축

task 본문을 done 압축형으로 다시 쓴다 (과정 로그 · `## 메모` 삭제):

```markdown
## 최종 사양

<!-- 실제 구현된 동작 3~7줄. 상세는 사양 문서 링크 -->

## 예외 케이스

| #   | 케이스 | 판정 | 처리 · 근거 |
| --- | ------ | ---- | ----------- |

## 결정

<!-- [ADR-0007](../../../docs/adr/0007-x.md) 한 줄 요약 | none — 실제 사유 -->

## 검증

<!-- 실행한 명령 + 결과 (예: pnpm test ✅ 12 passed) -->
```

주석만 남기고 출고하면 CI 가 "섹션 비어 있음" 으로 막는다 — 실제 내용으로 채운다.

prod / sandbox 확인 항목 쓰지 않음.

## 4. ADR

결정이 있었나? (새 의존성 · 패턴 · 데이터 / API shape · 기각한 대안 · 리뷰에서 반박한 설계 선택)

- 있음 → `pnpm adr:new <slug> <제목>` → Context / Decision / Alternatives / Consequences 작성 → `docs/adr/README.md` 인덱스 한 줄 → frontmatter `adr: NNNN`.
- 없음 → `adr: none — <사유>`.

## 5. 현재 사양 갱신

- 영향 개체 문서를 **최종 상태로 덮어쓴다** (없으면 `docs/specs/_templates/` 에서 생성 + 인덱스 등록). 코드를 다시 읽고 쓴다.
- 리뷰에서 확정된 경계 동작 → 사양 `## 예외 케이스`. frontmatter `updated` / `refs` 갱신.
- **FE page · component**: `pnpm spec:shots:changed` (바뀐 코드의 사양 + 그것을 쓰는 화면, 지정은 `SPEC=<id>`) → 새 / 바뀐 `docs/specs/{pages,components}/assets/*.png` 를 직접 열어 확인 (깨짐 · 빈 화면 · 의도한 변화) → `## 화면` · `## 사용 설명서` · `## 상태` 갱신. 새 컴포넌트면 미리보기 `apps/web/src/app/spec/components/<name>/page.tsx` 먼저. page 는 `pnpm client-js --route <route>` → `## 클라이언트 JS` 갱신 — 전보다 커졌으면 원인 한 줄 (`pnpm analyze`).
- task frontmatter `spec: [경로…]` (사양 영향 없음 → `spec: none — 사유`).

## 6. 출고

1. task frontmatter `status: done`, `completed-at`, 파일 `git mv <epic>/progress/<id>.md <epic>/done/<id>.md`.
2. 출고 커밋에 들어갈 파일 전부 `git add` (코드 · task · spec · ADR · 스크린샷) → `pnpm ship:check` green. ship:check 는 **stage 된 내용**(= CI 가 볼 커밋)을 검사한다 — untracked ADR / 스크린샷은 "파일 없음" 으로 실패.
3. 사용자에게 보고: 리뷰 round 수 · 예외 케이스 요약 · ADR · 갱신한 사양 · 스크린샷 경로 · 제안 커밋 메시지:

```
<type>(<scope>): <subject>

<왜>

Refs: <task-id>
Spec: <경로들 | none>
ADR: <NNNN | none>
```

커밋은 사용자 요청 시에만. 에픽의 마지막 task 면 README 회고 갱신 + archive 이동 제안.
