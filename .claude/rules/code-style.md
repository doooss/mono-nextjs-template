# Code Style

모든 코드 변경에 적용.

1. **요청된 변경만.** 같은 파일의 무관한 리팩터 · 스타일 정리를 끼워 넣지 않는다 (lint fix 제외).
2. **lint + type clean.** `pnpm lint` · `pnpm check-types` 통과 (CI 동일). lint 에 prettier 포함 → `pnpm lint:fix`. `eslint-disable` · `@ts-ignore` 대신 원인을 고치고, 불가피하면 `// @ts-expect-error <사유>`.
3. **경계에서 검증.** 외부 API 응답 · URL 파라미터 · 폼 입력 = zod. `any` 로 경계를 통과시키지 않는다.
4. **계층.** [nextjs.md](nextjs.md) — 페이지는 조립, 로직은 feature 컴포넌트 · `lib/`, `@repo/ui` 는 도메인을 모른다.
5. **로그.** 출하 코드에 `console.log` 금지.

## 이름 · import

- 파일 kebab-case (`user-card.tsx`, `use-<name>.ts`). 라우트 파일은 Next 규약. 컴포넌트 named export (라우트 default export 예외).
- alias: 앱 내부 `@/*` → `apps/web/src/*`, 패키지 `@repo/<pkg>/<export path>`. 새 alias = `tsconfig.json` + `jest.config.mjs` `moduleNameMapper` 같은 커밋.
