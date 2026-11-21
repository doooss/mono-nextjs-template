# Next.js

`apps/web` · `packages/ui` 코드에 적용.

## Stack

| 영역      | 선택                                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------- |
| Runtime   | Node 24 (engines ≥22) + pnpm 11 + Turborepo                                                               |
| Framework | Next.js 16 App Router + React 19                                                                          |
| Style     | Tailwind CSS 4 (`@source` 로 workspace UI 패키지 스캔) + Pretendard                                       |
| Language  | TypeScript 6 (`check-types` = `next typegen && tsc --noEmit`). TS 7 은 typescript-eslint 미지원           |
| Lint      | ESLint 9 flat (`@repo/eslint-config/next`). 10 은 eslint-config-next 의 import · jsx-a11y 플러그인 미지원 |
| Test      | Jest 30 (next/jest + jsdom + Testing Library) · Playwright (사양 스크린샷)                                |

## 구조 · 계층

```
apps/web/src/
  app/<route>/page.tsx      페이지 — 데이터 조립 + 화면 배치
  app/<route>/_components/  그 라우트 전용 컴포넌트
  components/               앱 공용 컴포넌트
  lib/                      순수 유틸 · API 클라이언트 (fetch + zod)
packages/ui/src/
  components/<name>.tsx     공유 UI (@repo/ui/components/<name>) — 도메인 모름, props 로만 동작
```

`page / layout` → feature 컴포넌트 → `@repo/ui`. 외부 API 는 `lib/` 에서 zod parse 후 사용.

## 규칙

- Server Component 기본. 상태 · 이벤트 · 브라우저 API 가 필요할 때만 `'use client'` (가능한 한 말단에).
- 데이터 의존 화면은 loading · empty · error 를 처리하고 현재 사양 `## 상태` 와 맞춘다.
- 인터랙티브 요소는 native element (`button`, `a`) + label 연결.
- 브라우저 노출 env 는 `NEXT_PUBLIC_*` 만. 비밀값을 클라이언트 번들에 넣지 않는다. 새 env 는 `turbo.json` `globalEnv` 에도 (strict env mode).
- 새 workspace UI 패키지 = `apps/web` 의존(`workspace:*`) + `next.config.ts` `transpilePackages` + `globals.css` `@source`.
- `output: 'standalone'` 은 `BUILD_STANDALONE=true` 일 때만 (Docker 빌드가 설정).
- 새 페이지 = `docs/specs/pages/<slug>.md` + 스크린샷. 새 공유 컴포넌트 = `docs/specs/components/<name>.md` + 미리보기 `app/spec/components/<name>/page.tsx` + 스크린샷 ([current-spec.md](current-spec.md)). 수정했으면 `pnpm spec:shots:changed`.

## 클라이언트 JS

초기 로드 JS 를 작게 유지한다. 참고 → [Ship less JavaScript with your AI agent](https://nextjs.org/blog/ship-less-javascript-with-ai).

| 확인                      | 명령                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 경로별 초기 로드 (gzip)   | `pnpm build && pnpm client-js` (`--route /x` · `--json`) — page 사양 `## 클라이언트 JS` 에 기록                                      |
| 어떤 모듈이 크기를 만드나 | `pnpm analyze` (Turbopack 분석 UI, :4000)                                                                                            |
| 변경 전후 비교            | `pnpm analyze:snapshot before` → 수정 → `pnpm analyze:snapshot after` → `pnpm analyze` 에서 compare                                  |
| 에이전트가 찾아 줄이기    | [`/next-bundle-optimizer`](../skills/next-bundle-optimizer/SKILL.md) (보고) · `/next-bundle-optimizer fix` (수정 → 전후 스냅샷 비교) |

- `'use client'` 는 말단에. 무거운 렌더(마크다운 · 코드 하이라이트 · 차트)는 Server Component 에서 HTML 로.
- `next/dynamic` · `lazy` 는 같은 번들에서 그 모듈을 static import 하는 곳이 없어야 실제로 지연된다.
- export 가 많은 패키지(아이콘 등)는 `experimental.optimizePackageImports`.

`.claude/skills/next-bundle-optimizer/` = vercel/next.js `skills/next-bundle-optimizer` 원본 (canary `7812b03`, 2026-10-27). 갱신은 원본을 다시 복사 — 직접 수정하지 않는다.
