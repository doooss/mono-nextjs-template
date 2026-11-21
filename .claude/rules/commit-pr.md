# Commit & PR

커밋 = 작업 기록 단위. 코드 + task + 사양 + ADR 을 한 커밋으로 묶는다. CI 가 커밋마다 감사한다 ([ci-cd](../../docs/ci-cd.md)).

## 메시지 — Conventional Commits

```
<type>(<scope>): <subject>

<본문 — 왜 바꿨나>

Refs: <task-id>
Spec: <docs/specs 경로, …> | pending | none
ADR: <NNNN, …> | none
```

- `type`: `feat` `fix` `perf` `refactor` `revert` `docs` `test` `build` `ci` `style` `chore`. `subject` = 영문 imperative, lowercase, ≤72자.
- `Refs` — 코드 변경 커밋(feat / fix / perf / refactor)에 쓴다 (없으면 CI warning).
- `Spec` / `ADR` — 출고 커밋에 쓴다. 중간 커밋은 `Spec: pending`. CI 는 가리키는 파일 · 형식만 검사 (key 대소문자 구분).
- 배포 산출물(src · Dockerfile · package.json · lockfile · 앱 설정 · public)을 바꾸는 커밋을 `docs` / `ci` 로 쓰면 CI error — 릴리스는 docs / ci 만 쌓이면 배포를 생략하기 때문.
- `BREAKING CHANGE:` → 릴리스 노트 최상단.

## 커밋 단위

- **출고 커밋** = task 를 done 으로 옮기는 커밋. 코드 · task · spec · ADR 전부 `git add` 후 `pnpm ship:check`.
- 중간 커밋 허용 (`Refs:` + `Spec: pending`). PR squash 로 합쳐도 된다 — footer 유지.
- CI 감사는 커밋 단위 — 머지 전 자기 feature 브랜치의 error 커밋은 fixup + `--force-with-lease` 로 정리.

## Branch · PR

| 흐름                               | 규칙                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| 기본 (trunk)                       | `main` 직접 또는 짧은 feature 브랜치 → PR (squash)                                     |
| 릴리스 on (`vars.RELEASE_ENABLED`) | `feature/* → develop` (canary) → Production Release (stable) / `main` 직접 PR = hotfix |

PR 제목 · 본문 `Changes` 는 `pr-automation.yml` 이 채운다. 본문 = [pull_request_template.md](../../.github/pull_request_template.md).

## Agent rules

1. 커밋 · 푸시는 사용자가 요청할 때만. 커밋 전 `git config user.email` 이 저장소 소유자 계정인지 확인.
2. `package.json#version` 은 올리지 않는다 — 릴리스 파이프라인이 기록.
3. `--no-verify` · 공유 브랜치 force push 금지. 비밀값을 메시지 / diff 에 넣지 않는다.
