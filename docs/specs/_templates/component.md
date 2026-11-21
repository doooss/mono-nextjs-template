---
entity: component
name: <Name>
route: /spec/components/<name>
screenshots: [desktop]
code:
  [
    packages/ui/src/components/<name>.tsx,
    apps/web/src/app/spec/components/<name>/page.tsx,
  ]
updated: YYYY-MM-DD
refs: <task-id>
---

# <Name>

> 역할 한 줄. import 경로: `@repo/ui/components/<name>`

<!-- 미리보기 = apps/web/src/app/spec/components/<name>/page.tsx (변형 · 상태를 한 화면에). 스크린샷 = SPEC=components/<name> pnpm spec:shots -->

## 화면

![desktop](assets/<name>.desktop.png)

## Props

| prop | 타입 | 기본값 | 설명 |
| ---- | ---- | ------ | ---- |

## 변형 (variants)

| 값  | 모양 |
| --- | ---- |

## 상태

| 상태          | 표시 |
| ------------- | ---- |
| default       |      |
| hover / focus |      |
| disabled      |      |

## 사용법

```tsx
import { <Name> } from '@repo/ui/components/<name>';
```

## 접근성

-

## 예외 케이스

| 케이스 | 동작 | 근거 |
| ------ | ---- | ---- |

## 사용처

- [pages/…](../pages/….md)

## 근거

- `packages/ui/src/components/<name>.tsx`
