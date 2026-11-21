# 현재 사양 (Current Spec)

지금 화면이 하는 일 — 개체(페이지 · 컴포넌트) 단위, 스크린샷 + 사용 설명서 포함. **현재만** 기록한다 (이력 = git · [agent-work](../../agent-work/README.md) · [ADR](../adr/README.md)).
규칙 → [.claude/rules/current-spec.md](../../.claude/rules/current-spec.md). 새 문서 = [_templates/](_templates/) 복사 후 아래 표에 등록 → `pnpm spec:shots` (작업 중 바뀐 것만 `pnpm spec:shots:changed`).

## 인덱스

### pages (`apps/web/src/app/**/page.tsx`)

| 개체 | route | 문서                           | 스크린샷         |
| ---- | ----- | ------------------------------ | ---------------- |
| Home | `/`   | [pages/home.md](pages/home.md) | desktop · mobile |

### components

| 개체   | 문서                                         | 미리보기                  | 스크린샷 |
| ------ | -------------------------------------------- | ------------------------- | -------- |
| Button | [components/button.md](components/button.md) | `/spec/components/button` | desktop  |

### flows

| 흐름 | 문서                                                 |
| ---- | ---------------------------------------------------- |
| —    | 아직 없음 ([_templates/flow.md](_templates/flow.md)) |

## 공통 규약

- 언어 `ko` (`<html lang="ko">`), 기본 폰트 Pretendard, 스타일 Tailwind CSS 4.
- 메타데이터 기본값: title `App`, description `Next.js monorepo template` (`apps/web/src/app/layout.tsx`).
- 스크린샷 viewport: `desktop` 1440×900 · `mobile` 390×844 (full page). 경로 `pages/assets/<slug>.<viewport>.png` · `components/assets/<name>.<viewport>.png`.
- 컴포넌트 미리보기 = `apps/web/src/app/spec/components/<name>/page.tsx` — spec:shots 빌드(`SPEC_PREVIEW=1`)에서만 열리고 그 외 404.
- 화면 상태 용어: `default` · `loading` · `empty` · `error` · `forbidden` — 각 page 문서 `## 상태` 표에서 사용.
