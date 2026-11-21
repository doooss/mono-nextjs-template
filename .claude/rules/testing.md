# Testing

**테스트는 버그를 잡을 수 있을 때만 쓴다. 과도한 테스트는 지운다.** 실행기 = `apps/web` 의 Jest 하나 (`@repo/ui` 테스트도 `apps/web/src/__tests__/ui/<name>.test.tsx`).

## 쓴다

| 층            | 대상                                                      | 위치                                         |
| ------------- | --------------------------------------------------------- | -------------------------------------------- |
| unit          | `lib/` 순수 함수 · 데이터 변환 · zod 스키마               | `<file>.test.ts`                             |
| component     | 분기가 있는 상태 렌더 (empty / error …) · 상호작용의 결과 | Testing Library, 옆에 `<component>.test.tsx` |
| 사양 스크린샷 | page · component 가 실제로 어떻게 보이나 (기록용)         | Playwright `pnpm spec:shots`                 |

## 쓰지 않는다

- 정적 마크업이 렌더되는지만 보는 테스트 (heading 존재 등) — 스크린샷이 대신한다.
- React · 브라우저 · 라이브러리 동작 재확인 (disabled 버튼이 클릭 안 됨, `tailwind-merge` 병합).
- CSS 클래스명 단언 · DOM snapshot.
- 실제 API 호출 — fetch 경계에서 mock.

## 규칙

- 사용자 관점 쿼리 (`getByRole`, `getByLabelText`).
- 버그 수정 · 리뷰에서 수용한 finding → 재현할 수 있으면 실패하는 테스트 먼저.
- 시간 · 랜덤 고정. `e2e/` 는 Playwright 전용 (Jest 대상 아님).
