# agent-work/

Task 추적 + 출고 게이트. 규칙 본문 → [.claude/rules/agent-work.md](../.claude/rules/agent-work.md).

> 목적 = **현재 사양과 흐름을 남긴다.** task 는 과정이 아니라 결과(최종 사양 · 예외 케이스 · 결정 · 검증)를 남기고,
> 사양 본문은 [docs/specs/](../docs/specs/README.md), 결정은 [docs/adr/](../docs/adr/README.md) 에 둔다.

## 구조

```
agent-work/
  <epic>/            YYMM-<slug> — README.md (목표 / 배경 / 작업 표 / 백로그 / 회고)
    pending/         계획 확정, 착수 전
    progress/        진행 중
    done/            출고 게이트 통과 + 커밋 (최종)
    drop/            폐기 (사유)
  misc/              에픽 미소속 단발 작업
  manual-task/       사람만 할 수 있는 작업 (status flip, 파일 이동 없음)
  archive/<epic>/    종료 에픽
  _templates/        task.md · epic.md · manual-task.md
```

## Lifecycle

```
pnpm task:new <epic|misc> <slug>
        │
pending ─► progress ─► [출고 게이트] ─► done ─► (에픽 종료) archive/<epic>/
   │           │
   └───────────┴──────► drop
```

출고 게이트 (`/ship-task` 스킬, 순서 고정):

| #   | 단계                   | 산출물                                                           |
| --- | ---------------------- | ---------------------------------------------------------------- |
| 1   | 로컬 검증              | check-types · lint · test (· build) green                        |
| 2   | **적대적 리뷰 (필수)** | finding 판정 → `review: passed`                                  |
| 3   | 작업 기록 압축         | `## 최종 사양` · `## 예외 케이스` · `## 결정` · `## 검증`        |
| 4   | ADR                    | `docs/adr/NNNN-*.md` 또는 `adr: none — 사유`                     |
| 5   | 현재 사양 갱신         | `docs/specs/**` (FE page = 스크린샷 + 사용 설명서)               |
| 6   | 출고 커밋              | 코드 + task + spec + ADR 한 커밋, footer `Refs` / `Spec` / `ADR` |

- 배포(sandbox / prod) 확인은 단계에 없다. done = 커밋 시점.
- `pnpm ship:check` = stage 된 done task 의 출고 게이트 + ADR 번호 중복 (CI 와 같은 검증기). CI 는 커밋 메시지 규칙(type · footer)을 더 본다.

## 명령

| 명령                                       | 역할                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| `pnpm task:new <epic\|misc> <slug> [제목]` | pending task 생성 (새 에픽이면 README 도)                                  |
| `pnpm task:status`                         | 열린 task + manual-task 목록 (세션 시작)                                   |
| `pnpm adr:new <slug> [제목]`               | 다음 번호 ADR 생성                                                         |
| `pnpm ship:check [--all] [--worktree]`     | stage 된(전체) done task 출고 게이트 + ADR 번호 중복 — 기본 git index 기준 |
