# ADR-0006 — 클라이언트 JS 확인: route-bundle-stats · next analyze · next-bundle-optimizer

- **Status**: Accepted
- **Date**: 2026-11-21
- **Refs**: 261121_001_monorepo-bootstrap
- **Supersedes**: —

## Context

Next 16 의 `next build` 는 경로별 JS 크기를 출력하지 않는다. 클라이언트 JS 는 import 관계가 바뀌며 조용히 커지고, `lazy()` 도 같은 번들에 static import 가 하나라도 있으면 지연되지 않는다. Next.js 는 Turbopack 모듈 그래프(`next analyze`)와 그것을 읽는 에이전트 스킬 `next-bundle-optimizer` 를 제공한다 ([Ship less JavaScript with your AI agent](https://nextjs.org/blog/ship-less-javascript-with-ai)).

## Decision

- 빠른 확인 = `pnpm client-js` — `next build` 가 남기는 `.next/diagnostics/route-bundle-stats.json` 의 경로별 초기 로드 chunk 를 gzip 합산해 표로 출력. page 사양 `## 클라이언트 JS` 에 기록한다 (현재 사양).
- 원인 분석 = `pnpm analyze` (UI) · `pnpm analyze:snapshot <name>` (전후 스냅샷).
- 축소 = `next-bundle-optimizer` 스킬을 `.claude/skills/` 에 **원본 그대로 포함** (vercel/next.js canary `7812b03`). prettier 대상에서 제외.
- 예산(임계값) · CI 크기 검사는 두지 않는다 — 기록하고 비교한다.

## Alternatives

| 대안                              | 기각 이유                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| `npx skills add` 로 그때그때 설치 | 외부 CLI 실행이 필요하고 버전이 고정되지 않는다. 템플릿을 복제하면 바로 쓸 수 있어야 한다  |
| `@next/bundle-analyzer`           | webpack 전용. Next 16 기본 번들러는 Turbopack                                              |
| CI 에서 크기 예산 강제            | 프레임워크 기본(약 130 KB gzip)만으로 기준이 흔들리고, 막을 기준을 정할 데이터가 아직 없다 |

## Consequences

- **긍정**: 사람 · 에이전트 모두 명령 하나로 경로별 크기를 보고, 사양에 남은 값으로 회귀를 비교한다.
- **부정 / 비용**: `client-js` 는 `.next/diagnostics` 형식에 의존 (Turbopack 빌드 전용). 스킬은 원본 갱신을 손으로 따라가야 한다.
- **후속**: 스킬 원본 갱신 시 다시 복사. 데이터가 쌓이면 예산 검토.
