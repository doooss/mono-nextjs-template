---
entity: page
route: /<route>
title: <제목>
screenshots: [desktop, mobile]
code: [apps/web/src/app/<route>/page.tsx]
updated: YYYY-MM-DD
refs: <task-id>
---

<!-- 파일명 = slug (라우트 /settings/profile → settings-profile.md). 스크린샷 = SPEC=pages/<slug> pnpm spec:shots -->

# <제목> (`/<route>`)

> 이 화면이 사용자에게 주는 것 한 줄.

## 화면

| desktop                               | mobile                              |
| ------------------------------------- | ----------------------------------- |
| ![desktop](assets/<slug>.desktop.png) | ![mobile](assets/<slug>.mobile.png) |

## 사용 설명서

1. 사용자는 …
2. …

## 상태

| 상태    | 조건 | 표시 |
| ------- | ---- | ---- |
| default |      |      |
| loading |      |      |
| empty   |      |      |
| error   |      |      |

## 흐름

| 사용자 행동 | 호출 (API / 라우트) | 결과 |
| ----------- | ------------------- | ---- |

## 예외 케이스

| 케이스 | 동작 | 근거 |
| ------ | ---- | ---- |

## 알려진 한계

없음.

## 구성

- [Button](../components/button.md)

## 클라이언트 JS

초기 로드 <N> KB gzip (`pnpm build && pnpm client-js --route /<route>`). 큰 모듈이 있으면 무엇인지 한 줄.

## 근거

- `apps/web/src/app/<route>/page.tsx`
