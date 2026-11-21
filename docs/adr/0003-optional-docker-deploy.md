# ADR-0003 — CI 기본 on, 릴리스 · Docker 배포는 opt-in

- **Status**: Accepted
- **Date**: 2026-11-21
- **Refs**: 261121_001_monorepo-bootstrap

## Context

develop → canary(sandbox) / 수동 stable(prod) / main hotfix 릴리스 흐름에 특정 클라우드 배포(예: AWS ECS)를 묶으면 프로젝트마다 계정 · 권한 · 레지스트리 준비가 먼저 필요하다.
템플릿에서 시작하는 프로젝트는 호스팅이 제각각이고(없을 수도 있고), 처음에는 trunk(main 단일)로 시작하는 경우가 많다.

## Decision

- `ci.yml`(커밋 감사 + 검증) · `pr-automation.yml` 은 설정 없이 항상 동작.
- 릴리스 태깅 3종은 `vars.RELEASE_ENABLED == 'true'` 일 때만, 배포는 추가로 `vars.DEPLOY_ENABLED == 'true'` 일 때만.
- 배포 = 클라우드 중립: `docker/<app>.Dockerfile` → GHCR push → (선택) `DEPLOY_WEBHOOK_URL` POST. 추가 secret 없이 `GITHUB_TOKEN` 으로 동작.
- 릴리스 토큰 = `RELEASE_TOKEN` secret 있으면 사용, 없으면 `github.token`.

## Alternatives

| 대안                                        | 기각 이유                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------- |
| 특정 클라우드 배포(AWS ECS 등)를 기본값으로 | 프로젝트마다 계정 · IAM · 레지스트리 준비 필요. 템플릿 기본값으로 과함                |
| 배포 워크플로우 제거                        | 컨테이너 배포가 필요해질 때 다시 만들어야 함. opt-in 이면 비용 0                      |
| release-please / semantic-release           | 기존 canary/stable/hotfix 규칙과 릴리스 노트 형식(release.mjs)을 이미 테스트까지 갖춤 |

## Consequences

- **긍정**: 새 저장소에서 push 즉시 CI 동작. 배포 대상은 변수 / 훅 URL 만 바꿔 교체.
- **부정**: `github.token` push 는 후속 워크플로우를 트리거하지 않는다 — hotfix 역머지 후 Sandbox Release 는 `workflow_dispatch` 로 직접 호출해 보완 (dispatch 는 허용됨). 보호 브랜치 bypass 가 필요하면 `RELEASE_TOKEN`.
- **후속**: 롤아웃 검증(헬스체크 대기)은 호스팅 측 책임. trunk 운영 시 RELEASE_ENABLED 는 끈다 (main push 마다 hotfix 태그 방지).
