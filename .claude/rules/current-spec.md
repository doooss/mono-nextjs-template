# Current Spec (현재 사양)

출고 게이트 5단계. **지금 화면이 하는 일**을 개체(페이지 · 컴포넌트) 단위로 남긴다 — 스크린샷 + 사용 설명서 포함. 위치 → [docs/specs/](../../docs/specs/README.md).

## 원칙

- **현재만.** 이력 · 변경 로그 섹션 금지 — 이력은 git · task · ADR.
- **코드에서 읽어 쓴다.** 실제 라우트 / props / 상태 분기 / 호출 API. 추측 금지.
- **덮어쓴다.** 코드 · 스크린샷과 같은 커밋에서 최종 상태로 다시 쓴다.
- **보이는 그대로.** page · component 문서의 이미지는 `pnpm spec:shots` 스크린샷이 정본.
- **변경 기준.** 작업에서 바뀐 코드의 사양(frontmatter `code`)과 그것을 쓰는 화면을 같은 커밋에서 최신으로 — 스크린샷은 `pnpm spec:shots:changed`.
- **예외까지.** 리뷰에서 확정된 상태 (loading / empty / error / 권한 없음 …) 는 `## 상태` · `## 예외 케이스` 에.

## 개체

| 종류      | 경로                              | 단위                                                                 | 템플릿                                                              |
| --------- | --------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| page      | `docs/specs/pages/<slug>.md`      | 라우트 1개 (화면 · 사용 설명서 · 상태 · 흐름)                        | [_templates/page.md](../../docs/specs/_templates/page.md)           |
| component | `docs/specs/components/<name>.md` | 공유 컴포넌트 (`@repo/ui` 또는 앱 공용) — 미리보기 라우트 + 스크린샷 | [_templates/component.md](../../docs/specs/_templates/component.md) |
| flow      | `docs/specs/flows/<flow>.md`      | 페이지 2개 이상을 가로지르는 사용자 흐름                             | [_templates/flow.md](../../docs/specs/_templates/flow.md)           |

새 개체 = 템플릿 복사 → [docs/specs/README.md](../../docs/specs/README.md) 인덱스에 한 줄. page slug = 파일명 (라우트 `/settings/profile` → `settings-profile.md`).

```yaml
---
entity: page # page | component | flow
route: /settings/profile # page = 라우트 · component = /spec/components/<name>
title: 프로필 설정
screenshots: [desktop, mobile]
code: [apps/web/src/app/settings/profile/page.tsx]
updated: 2026-11-21
refs: 261121_001_profile # 마지막으로 갱신한 task id
---
```

page 문서 섹션: `## 화면` (스크린샷) / `## 사용 설명서` (사용자 관점 단계별) / `## 상태` / `## 흐름` (행동 → 호출 API → 결과) / `## 예외 케이스` / `## 구성` (사용 컴포넌트) / `## 클라이언트 JS` (초기 로드 gzip — `pnpm client-js`) / `## 근거` (코드 경로). 해당 없으면 "없음" 한 줄.

component 문서 섹션: `## 화면` (미리보기 스크린샷) / `## Props` / `## 변형` / `## 상태` / `## 사용법` / `## 접근성` / `## 예외 케이스` / `## 사용처` / `## 근거`.

## 스크린샷

- `pnpm spec:shots` — `docs/specs/{pages,components}/*.md` 의 `route` 를 열어 같은 폴더 `assets/<slug>.<viewport>.png` 저장.
  - 작업 중 바뀐 것만: `pnpm spec:shots:changed` — HEAD 대비 바뀐 파일이 `code` 에 걸린 사양 + 그 사양을 링크하는 사양 (Button 이 바뀌면 Button 을 쓰는 page 도).
  - 지정: `SPEC=<id|slug>[,…] pnpm spec:shots` (`pages/home` · `components/button` · `home`).
- **component 미리보기** = `apps/web/src/app/spec/components/<name>/page.tsx` — 변형 · 상태를 한 화면에. spec:shots 빌드(`SPEC_PREVIEW=1`)에서만 열리고 그 외 빌드는 404. 사양 `route: /spec/components/<name>`. 미리보기가 의미 없는 컴포넌트(provider 등)는 `screenshots: none`.
- `route` = 실제 URL. 동적 세그먼트(`/users/[id]`)는 예시 값으로 (`/users/1`) — CI 오류.
- viewport: `desktop` 1440×900 · `mobile` 390×844. `screenshots` 필드 없음 = `[desktop]`, `none` / `[]` = 없음.
- 새 production 빌드를 전용 포트(3123)에 띄워 찍는다. 리다이렉트 · HTTP ≥ 400 = 실패.
- 사양은 `docs/specs/pages/` · `components/` 바로 아래에만. 계획은 `.github/scripts/spec-pages.mjs` 가 CI 검증(`ship-gate.mjs`)과 같은 파서로 만든다.
- CI: done task 의 page · component 사양마다 스크린샷 파일 검사 (없으면 error). 코드 커밋에서 사양 `code` 경로가 바뀌었는데 그 사양이 커밋에 없으면 warning (`Spec: pending` · `Spec: none` 이면 생략).
- 데이터 의존 화면은 결정적 상태(mock / seed)로 찍는다. 상태별 이미지는 미지원 — `## 상태` 표로 기술.
- 첫 실행 머신: `pnpm --filter web exec playwright install --only-shell chromium`.
- 대상 앱은 `apps/web` 하나다. 두 번째 앱의 사양은 미지원 — 필요해지면 frontmatter `app` + Playwright `webServer` 를 앱별로 확장한다 (그 전까지 `screenshots: none`).
