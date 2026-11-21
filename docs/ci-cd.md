# CI/CD

[README](../README.md) · [문서 목록](README.md)

**기본 = 커밋 단위 CI 만 켜져 있다.** 릴리스 태깅과 Docker 배포는 저장소 변수로 켜는 선택 기능.

| 계층                                   | 워크플로우                                                                                                                                                                      | 기본   | 켜는 법                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------- |
| 커밋 감사 + 검증                       | [ci.yml](../.github/workflows/ci.yml)                                                                                                                                           | **on** | —                                   |
| PR 본문 / 제목 / 라벨                  | [pr-automation.yml](../.github/workflows/pr-automation.yml)                                                                                                                     | **on** | —                                   |
| 릴리스 태그 (canary / stable / hotfix) | [sandbox-release](../.github/workflows/sandbox-release.yml) · [prod-release](../.github/workflows/prod-release.yml) · [hotfix-release](../.github/workflows/hotfix-release.yml) | off    | `RELEASE_ENABLED=true`              |
| Docker 배포 (GHCR + 훅)                | [\_deploy.yml](../.github/workflows/_deploy.yml)                                                                                                                                | off    | `DEPLOY_ENABLED=true` (+ 릴리스 on) |

변수 = GitHub **Settings → Secrets and variables → Actions → Variables**.

## 1. CI — 커밋 단위 (`ci.yml`)

모든 push / PR. secret 불필요.

| job              | 하는 일                                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Commit audit** | 이번 push / PR 의 커밋을 **하나씩** 감사 → 실행 Summary 에 표 (`commit · subject · Refs · Spec · ADR · ship · result`) |
| CI scripts test  | `.github/scripts/*.test.mjs` (릴리스 · PR 본문 · 감사 로직)                                                            |
| Verify           | `pnpm install --frozen-lockfile` → `check-types` → `lint` → `test` → `build`                                           |

커밋 감사 규칙 ([commit-audit.mjs](../.github/scripts/commit-audit.mjs) · [ship-gate.mjs](../.github/scripts/ship-gate.mjs)):

| 수준    | 조건                                                                                                                                                                                                                                                                                                                                    |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| error   | subject 가 Conventional Commits 아님 (`Revert "…"` 기본 형식 · squash 머지의 ` (#N)` 접미 허용)                                                                                                                                                                                                                                         |
| error   | `docs` / `ci` type 커밋이 배포 산출물을 변경 (삭제 · rename 포함) — 앱 / 패키지 `src` 코드 · `docker/` · `.dockerignore` · `package.json` · `tsconfig*.json` · lockfile · `turbo.json` · 앱 `*.config.*` · `public/` · `scripts/` · `packages/config/`. 릴리스 · 배포에서 빠지므로                                                      |
| error   | `docs/adr` 에 같은 번호 ADR 2개 — 커밋 tree 와 **PR 머지 결과**(base 에 먼저 들어간 번호와 충돌) 모두 검사                                                                                                                                                                                                                              |
| error   | `Spec:` footer 가 `docs/specs/**.md` 가 아니거나 파일 없음 · `ADR:` footer 가 `NNNN` / `none` 이 아니거나 파일 없음 (footer key 는 대소문자 구분, 여러 벌이면 전부 검사)                                                                                                                                                                |
| error   | done 으로 들어온 task (`archive/<epic>/done/` 으로 바로 옮긴 것 포함) 의 출고 게이트 위반 — `review: passed (날짜, rounds N)` 아님 · 4 섹션 누락 또는 빈 내용(빈 bullet · 헤더만 / 번호만 있는 표) · `adr` / `spec` 미기재 또는 사유 없는 none (`none — 사유` 그대로 포함) · 사양 / ADR 파일 없음 · page · component 사양 스크린샷 없음 |
| warning | 코드 변경 커밋(feat / fix / perf / refactor)에 `Refs:` 없음 · agent-work 갱신 없음 · `docs/specs` 갱신도 `Spec:` footer 도 없음 · 사양 `code` 경로가 바뀌었는데 그 사양이 커밋에 없음 (`Spec: pending                                                                                                                                   | none`이면 생략) · subject 72자 초과 · 이력 섹션 · prod 확인 항목 · 템플릿 자리 표시자 잔존 · 사양`refs` 가 이 task 가 아님 |
| skip    | 머지 커밋 · 저장소 첫 커밋 · `apps/*/package.json` 만 바꾼 release 커밋                                                                                                                                                                                                                                                                 |

CI 는 출고 결과물의 **존재 · 형식**을 본다. 사양 / ADR 이 이번 변경을 제대로 담았는지는 적대적 리뷰 몫이다 (사양 `refs` 가 다른 task 면 warning).

`COMMIT_AUDIT_STRICT=true` → warning 도 실패. 로컬 사전 검사: `pnpm ship:check` (git index = 다음 커밋 기준 — `git add` 후 실행), 범위 감사: `node .github/scripts/commit-audit.mjs --range main..HEAD`.

- 감사 범위: PR = base..head 전체 (매 push 마다 다시) · push = before..after. push 감사는 최선 노력 — force push · 기본 브랜치 첫 push 는 마지막 커밋만, 새 브랜치 첫 push 는 다른 원격 브랜치에 없는 커밋만 본다. **빠짐없는 감사는 PR run** (PR 경유 권장).
- push run 은 취소되지 않는다. PR run 은 새 push 가 이전 run 을 대체.
- **PR 안의 앞 커밋이 error 면 뒤에 고치는 커밋을 올려도 그 커밋은 계속 error** (커밋 단위 감사). 머지 전 자기 브랜치에서 `git rebase -i` 로 fixup → `git push --force-with-lease`. squash-merge 할 PR 이면 최종 squash 커밋이 기준이 되도록 해당 커밋을 정리.
- **squash 기본 메시지**: Settings → General → Pull Requests → "Default commit message" 를 **Default message**(커밋 메시지 목록) 로 — PR title 만 쓰면 `Refs` / `Spec` / `ADR` footer 가 사라진다.

## 2. PR 자동화 (`pr-automation.yml`)

- `## Changes` 의 commits 마커 블록 = 커밋 목록 (type 별 + 커밋 링크). push 마다 갱신.
- 제목 = `<docs/ci 가 아닌 첫 커밋 subject> +N` (직접 고친 제목은 유지). 손으로 `docs:` / `ci:` 제목을 쓰면 squash 커밋 type 이 그것이 되므로 머지 전 확인. `Why PR?` 체크박스 = 커밋 type 으로 자동 체크.
- 본문의 `` `경로.md` `` = head 커밋 고정 blob 링크로 변환 (task / spec / ADR 링크).
- 라벨 = 변경 경로 ([labeler.yml](../.github/labeler.yml)) + 제목 type (`type: feat` 등).

## 3. 릴리스 — 선택 (`RELEASE_ENABLED=true`)

develop / main 브랜치 흐름 전제. trunk(main 단일) 운영이면 꺼 둔다 (main push 마다 hotfix 태그가 생기므로).

```
feature PR ─► develop 머지 ─► [Sandbox Release] vX.Y.Z-canary.N pre-release (자동)
                                   │  수동 실행
                                   ▼
                            [Production Release] 최신 canary → vX.Y.Z + main force-with-lease
main 직접 PR 머지 (hotfix) ─► [Hotfix Release] patch 태그 + develop 역머지 (자동)
```

- 버전 정본 = git 태그. release 커밋이 `apps/*/package.json#version` 기록 (에이전트는 버전 수정 금지).
- 노트 = 직전 태그 이후 커밋을 type 별 분류. canary · stable 은 `docs` / `ci` 커밋뿐이면 발행 · 배포 생략 — 배포 산출물을 바꾸는 커밋은 `build` / `fix`. **hotfix 는 docs / ci 만이어도 patch 태그 발행** (main 단독 커밋을 태그로 고정).
- PR 자동 제목은 docs / ci 가 아닌 첫 커밋 subject — squash 커밋 type 이 코드 변경을 가리지 않게.
- Production Release 입력: `bump` (patch / minor / major) · `base` (비우면 최신 canary) · `skip_main_check`.
- main 에만 있는 커밋이 develop 에 없으면 Production Release 가 차단 → main → develop 역머지 후 재실행. 역머지했는데도 막히면 최신 canary 가 역머지 이전 커밋 → **Sandbox Release 를 develop 에서 수동 실행**해 새 canary 를 만든 뒤 재실행 (`skip_main_check` 는 핫픽스를 prod 에서 지운다).
- Production Release 재실행은 멱등 — base canary 가 이미 최신 stable 에 포함돼 있으면 중복 발행 없이 종료. 이때 deploy 도 생략되므로 부분 실패 복구 = GitHub Release 수동 생성 + **Actions → Deploy (reusable)** 로 그 태그 배포.
- Hotfix Release = `release` → (`deploy` ∥ `post`: canary 재태깅 · 역머지). `post` 실패는 배포를 막지 않고, "Re-run failed jobs" 로 복구. 역머지 충돌은 `backmerge/<tag>` 브랜치 PR — **merge commit 으로 머지** (squash 금지). PR 생성에는 Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests" 가 필요 (`github.token`). `github.token` 운영이면 역머지 후 Sandbox Release 를 자동 dispatch. release job 이 태그 push 뒤 실패하면 재실행은 skip → Deploy (reusable) 수동 배포 + 역머지 수동.
- Production Release 와 Hotfix Release 는 concurrency group 이 다르다 (대기 중 run 취소 방지). 동시에 돌면 main push 가 lease / non-fast-forward 로 실패 — 끝난 뒤 재실행.
- 토큰: 기본 `github.token`. 보호 브랜치 bypass 나 후속 워크플로우 트리거가 필요하면 `RELEASE_TOKEN` secret (PAT / App 토큰).

## 4. Docker 배포 — 선택 (`DEPLOY_ENABLED=true`)

릴리스가 태그를 만든 뒤 [\_deploy.yml](../.github/workflows/_deploy.yml) 호출:

1. 태그 checkout → `docker/<app>.Dockerfile` 빌드 (context = 저장소 루트, `turbo prune`).
2. `ghcr.io/<owner>/<repo>-<app>:<tag>` + `:<env>-latest` push (GITHUB_TOKEN).
3. environment secret `DEPLOY_WEBHOOK_URL` 이 있으면 POST `{ image, environment, app }` — 호스팅 재배포 훅.

| 설정                 | 위치                                    | 기본               |
| -------------------- | --------------------------------------- | ------------------ |
| `DEPLOY_APPS`        | variable (JSON 배열)                    | `["web"]`          |
| `DEPLOY_WEBHOOK_URL` | environment(`sandbox` / `prod`) secret  | 없음 = push 까지만 |
| 승인 게이트          | environment `prod` → required reviewers | 없음               |

수동 재배포 / 롤백: **Actions → Deploy (reusable) → Run workflow** (environment · tag).
로컬 이미지: `pnpm docker:build` → `docker run -p 3000:3000 web:local` (Dockerfile 이 `BUILD_STANDALONE=true` 로 standalone 빌드).

## 로컬 검증

```bash
pnpm check-types && pnpm lint && pnpm test && pnpm build
node --test ".github/scripts/*.test.mjs" "scripts/*.test.mjs"
pnpm ship:check
```
