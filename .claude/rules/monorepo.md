# Monorepo

패키지를 넘나드는 수정 · 새 패키지 · 의존성 추가 시. pnpm 11 workspace + Turborepo.

## Layout

```
apps/
  web/                       Next.js 앱 (package "web")
packages/
  ui/                        @repo/ui — 공유 React 컴포넌트 (JIT: TS 소스 그대로 export, 빌드 없음)
  config/{typescript,eslint,prettier}
docker/  docs/  agent-work/  scripts/
```

## Import 방향

```
ui ──► apps/web        config/* ──► devDependency only
```

- `packages/*` 는 `apps/*` 를 import 하지 않는다. 패키지 간 = workspace 이름 + exports 경로 (`@repo/ui/components/button`) — 상대 경로 · `src/` deep import 금지.
- JIT 패키지는 앱이 트랜스파일 — `transpilePackages` + Tailwind `@source` 필수 ([nextjs.md](nextjs.md)).

## 알아둘 것

- turbo **strict env mode** — `turbo.json` `globalEnv` 에 없는 환경 변수는 태스크에 전달되지 않는다.
- pnpm 11 은 미승인 빌드 스크립트를 설치 오류로 처리 → `pnpm-workspace.yaml` `allowBuilds` 에 명시.
- lockfile = 루트 `pnpm-lock.yaml` 하나. `npm` / `yarn` 쓰지 않는다.
- `pnpm format` 은 md 포함 — docs / agent-work 도 prettier 대상.

## 명령

| 작업          | 명령                                                           |
| ------------- | -------------------------------------------------------------- |
| 개발 서버     | `pnpm dev:web` (http://localhost:3000)                         |
| 빌드 / 실행   | `pnpm build` / `pnpm start`                                    |
| 검사          | `pnpm check-types` · `pnpm lint` · `pnpm test`                 |
| 사양 스크린샷 | `pnpm spec:shots` (`SPEC_PAGE=<slug>` 한 페이지)               |
| 의존성 추가   | `pnpm --filter web add <dep>` · 루트 도구 `pnpm add -wD <dep>` |

## 새 패키지

`packages/<name>/` · `name: "@repo/<name>"` · `private: true` · `exports` 로 공개 경로 명시 · `@repo/typescript-config/react-library.json` 확장 · `lint` / `check-types` 스크립트. 앱에 의존 (`pnpm --filter web add @repo/<name>@workspace:*`) + `transpilePackages` · `@source` 추가. 공개 컴포넌트 사양 = `docs/specs/components/`.
