# Agent Work

Task 추적 + 출고 게이트. 폴더 → [agent-work/](../../agent-work/README.md).

task 파일은 과정 로그가 아니라 결과(최종 사양 · 예외 케이스 · 결정 · 검증)를 남긴다. 사양 본문은 [docs/specs/](../../docs/specs/README.md), 결정은 [docs/adr/](../../docs/adr/README.md).

## 구조

```
agent-work/
  <epic>/            YYMM-<slug>. README.md (목표 / 배경 / 상태 / 회고)
    pending/ progress/ done/ drop/
  misc/              에픽 미소속 단발 작업
  manual-task/       사람만 할 수 있는 작업 (계정 · 콘솔 · 결제 · DNS · 시크릿 발급)
  archive/<epic>/    종료 에픽
  _templates/        task.md · epic.md · manual-task.md
```

- 파일명 `YYMMDD_NNN_<slug>.md` — `pnpm task:new <epic|misc> <slug>`. 상태 이동 = `git mv` + frontmatter `status` (→ done 시 `completed-at`, → drop 시 `drop-reason`).
- **done = 출고 게이트 통과 + 커밋.** 배포(sandbox / prod) 확인은 작업 단계가 아니다 — 릴리스 파이프라인 몫 ([ci-cd](../../docs/ci-cd.md)).
- 에픽 종료(전 task done|drop) → README 회고 → `archive/<epic>/` 로 `git mv`.

```yaml
---
id: 261121_001_login # 파일명
status: pending # pending | progress | done | drop
related-code: [apps/web/src/app/login]
spec: [] # 갱신한 현재 사양 경로 | none — 사유
adr: pending # NNNN | none — 사유
review: pending # passed (YYYY-MM-DD, rounds N)
---
```

## 본문

작업 중은 자유 (템플릿: 목표 · 범위 · Acceptance · 메모). **done 은 4 섹션만** (CI 검사):

| 섹션             | 내용                                                       |
| ---------------- | ---------------------------------------------------------- |
| `## 최종 사양`   | 실제 구현된 동작. 짧게 — 상세는 spec 문서 링크             |
| `## 예외 케이스` | 적대적 리뷰 finding 표 (`#` / 케이스 / 판정 / 처리 · 근거) |
| `## 결정`        | ADR 링크 또는 none 사유                                    |
| `## 검증`        | 실행한 로컬 명령 + 결과                                    |

## 출고 게이트 — 순서 고정

절차 = [ship-task 스킬](../skills/ship-task/SKILL.md).

1. **로컬 검증** — `pnpm check-types` · `pnpm lint` · `pnpm test` (+ `build`) green.
2. **적대적 리뷰 (필수)** — [adversarial-review.md](adversarial-review.md). 미해결 blocking 0 → `review: passed (날짜, rounds N)`.
3. **작업 기록 압축** — 본문을 위 4 섹션으로. 리뷰 finding = `## 예외 케이스`.
4. **ADR** — 이번 커밋에서 내린 결정 ([adr.md](adr.md)). 없으면 `adr: none — 사유`.
5. **현재 사양 갱신** — 작업에서 바뀐 개체의 `docs/specs/` 를 최종 상태로 덮어쓰기. page · component 는 스크린샷(`pnpm spec:shots:changed`) + 사용 설명서 ([current-spec.md](current-spec.md)).
6. **커밋** — 코드 + task(done) + spec + ADR + 스크린샷 = 한 커밋, footer `Refs:` / `Spec:` / `ADR:` ([commit-pr.md](commit-pr.md)). 전부 `git add` 후 `pnpm ship:check` (stage 기준 = CI 기준).

CI 커밋 감사가 done 으로 들어온 task 마다 2~5 의 결과물(리뷰 passed · 4 섹션 · ADR / 사양 / 스크린샷 파일)을 검사한다 — 내용이 맞는지는 적대적 리뷰 몫.

## manual-task

코드로 자동화할 수 없는 사람 작업. 파일 이동 없이 `status: pending → in-progress → done`. 배포 후 확인 · prod 검증류는 만들지 않는다.

## Agent rules

1. 적대적 리뷰는 사소한 변경도 1 round. 사용자가 생략을 지시하면 `review: skipped — 사유` (CI 실패 — 사용자 판단).
2. task 갱신은 코드 변경과 같은 커밋.
3. secret 값은 기록하지 않는다 — key 이름 / 위치만.
