# ADR-0005 — 의존성 기준선: TypeScript 6 · ESLint 9 유지

- **Status**: Accepted
- **Date**: 2026-11-21
- **Refs**: 261121_001_monorepo-bootstrap
- **Supersedes**: —

## Context

템플릿 점검 시점(2026-11)에 Next 16.4 · React 19.3 · Tailwind 4.3 · Playwright 는 최신이었고, 남은 메이저는 TypeScript 7 · ESLint 10 · `@eslint/js` 10 · `globals` 17 · `@types/node` 26 이었다.
제약: `eslint-config-next` 가 쓰는 `eslint-plugin-import` · `eslint-plugin-jsx-a11y` 는 ESLint `≤9` 만 지원, typescript-eslint 는 TypeScript `<6.1` 만 지원한다.

## Decision

- TypeScript **6.0**, `globals` 17 로 올린다.
- ESLint · `@eslint/js` 는 **9 유지** — eslint-config-next 플러그인이 10 을 지원하면 올린다.
- `@types/node` 는 최소 지원 런타임(22)에 맞춘다.

## Alternatives

| 대안         | 기각 이유                                                   |
| ------------ | ----------------------------------------------------------- |
| ESLint 10    | peer 불일치 — next 규칙(import · a11y) 플러그인이 10 미지원 |
| TypeScript 7 | typescript-eslint 미지원 — lint 가 깨진다                   |

## Consequences

- **긍정**: 지원되는 최신 조합. check-types · lint · test · build green.
- **후속**: eslint-config-next 의 ESLint 10 지원 · typescript-eslint 의 TS 7 지원 시 재검토.
