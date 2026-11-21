# ADR-0001 — pnpm + Turborepo 모노레포 (`apps/web` + `@repo/*`)

- **Status**: Accepted
- **Date**: 2026-11-21
- **Refs**: 261121_001_monorepo-bootstrap

## Context

단일 create-next-app 프로젝트는 두 번째 앱(admin 등)이나 공유 UI 가 생길 때 컴포넌트와 설정을 복사하게 된다.
`apps/*` + `packages/*` 모노레포(pnpm + Turbo, `@repo/*`)는 여러 앱이 UI · 설정을 공유하는 검증된 구조다.

## Decision

- pnpm 11 workspace + Turborepo. 앱 `apps/web`, 공유 `packages/ui` · `packages/config/{typescript,eslint,prettier}`. scope = `@repo/*`.
- `@repo/ui` 는 **JIT 패키지** — TS 소스를 `exports` 로 직접 노출, 앱이 `transpilePackages` 로 트랜스파일 (빌드 단계 없음). Tailwind 는 `@source` 로 패키지 소스를 스캔.
- `output: 'standalone'` 은 `BUILD_STANDALONE=true` 일 때만 (Docker 빌드 전용).

## Alternatives

| 대안                              | 기각 이유                                                  |
| --------------------------------- | ---------------------------------------------------------- |
| 단일 앱 유지                      | 앱 추가 시 UI / 설정 복사                                  |
| UI 패키지 사전 빌드 (tsup → dist) | 빌드 · watch 단계 추가. Next 가 트랜스파일하므로 이득 적음 |
| Nx                                | 기능 과다. BE 템플릿과 같은 Turbo + pnpm 유지              |

## Consequences

- **긍정**: 앱 추가 = `apps/<name>` + `@repo/ui`. turbo 캐시로 CI 단축. BE 템플릿과 같은 명령 체계.
- **부정**: 새 UI 패키지마다 `transpilePackages` + `@source` 두 군데 등록 필요 (빠뜨리면 스타일 누락).
- **후속**: 공유 컴포넌트 공개 API 는 `docs/specs/components/` 에 현재 사양으로 유지.
