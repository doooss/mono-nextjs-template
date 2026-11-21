---
id: 261121_001_monorepo-bootstrap
date: 2026-11-21
task: monorepo-bootstrap
epic: 2611-template-bootstrap
status: done
started-at: 2026-11-21
completed-at: 2026-11-21
related-code:
  [
    apps/web,
    packages,
    .github,
    scripts/agent-work.mjs,
    .claude,
    docs,
    agent-work,
    docker,
  ]
spec:
  - docs/specs/pages/home.md
  - docs/specs/components/button.md
adr: [0001, 0002, 0003, 0004, 0005, 0006]
review: passed (2026-11-21, rounds 3)
acceptance:
  - 단일 Next 프로젝트 → pnpm + Turbo 모노레포 (apps/web, @repo/ui, @repo/config/*)
  - 범용화 — 특정 서비스 이름 · 클라우드 전용 빌드 설정 · 외부 링크 없음
  - CI = 커밋 단위 감사 + 검증, 설정 없이 동작. 릴리스 · Docker 배포는 변수로 opt-in
  - 출고 게이트(적대적 리뷰 필수 · 압축 기록 · ADR · 현재 사양 + 스크린샷)를 규칙 · 스킬 · CI 로 강제
  - pnpm spec:shots — page · component 사양의 route 를 찍어 assets 에 저장, 작업 중 바뀐 것만 다시 찍기 가능
  - 현재 사양 seed (home page + Button) 를 실제 코드 / 스크린샷 기준으로 작성
  - build · check-types · lint · test · spec:shots · CI 스크립트 테스트 green
  - 경로별 초기 로드 JS 를 확인 · 기록할 수 있다 (client-js · next analyze · next-bundle-optimizer)
links: [261121_002_spec-shots-states]
---

# 모노레포 전환 + 현재 사양 출고 게이트 도입

## 최종 사양

- 구조: `apps/web` (Next 16.4 App Router · React 19 · Tailwind 4 · TS 6) + `@repo/ui` (JIT) + `@repo/config/{typescript,eslint,prettier}`. pnpm 11 + Turbo. Pretendard = variable dynamic subset (`@theme --font-sans`).
- 사양 스크린샷: `pnpm spec:shots` — `.github/scripts/spec-pages.mjs` 가 page 사양에서 계획을 만들고 (CI `ship-gate.mjs` 와 같은 파서), Playwright 가 전용 포트의 새 production 빌드를 desktop / mobile(터치 · 모바일 UA)로 찍어 `docs/specs/{pages,components}/assets/<slug>.<viewport>.png` 저장. 리다이렉트 · HTTP ≥ 400 = 실패. component 도 미리보기 라우트(`/spec/components/<name>`, spec:shots 빌드 전용)로 같은 방식. `SPEC=<id>` 지정 · `pnpm spec:shots:changed` = 바뀐 코드의 사양 + 그것을 쓰는 화면만.
- 현재 사양: [home](../../../docs/specs/pages/home.md) (스크린샷 + 사용 설명서 + 클라이언트 JS) · [Button](../../../docs/specs/components/button.md) (미리보기 스크린샷). 테스트 = 버그를 잡는 것만 — Button 기본 `type` 1건 ([ADR-0004](../../../docs/adr/0004-minimal-tests.md)).
- 클라이언트 JS: `pnpm client-js` (경로별 초기 로드 gzip, `route-bundle-stats.json`) · `pnpm analyze` / `analyze:snapshot` · `/next-bundle-optimizer` 스킬 (vercel/next.js 원본) → [ADR-0006](../../../docs/adr/0006-client-js-check.md).
- CI/CD · 작업 체계: BE 템플릿과 공통 — 커밋 감사 + 검증, PR 자동화, 릴리스 / GHCR 배포 opt-in, agent-work v2, `/ship-task` + `adversarial-reviewer`, `pnpm task:* | adr:new | ship:check` → [ci-cd](../../../docs/ci-cd.md).

## 예외 케이스

적대적 리뷰 3 round (1: kit · BE · FE 3명 병렬, FE 17건 + 공통 kit 18건, 2: 재검증 13건, 3: 템플릿 점검 BE · FE · CI 3명). blocking 2건(FE) 전부 수용. 공통 kit(CI · agent-work) 항목은 BE task 와 동일 처리.

| #   | 케이스                                                                                                       | 판정 | 처리 · 근거                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------ | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `screenshots: none` 이 spec:shots 전체를 중단 (CI 는 통과)                                                   | 수용 | 단일 파서(`pageShotPlan`) — `spec-pages.test.mjs`                                                                                              |
| 2   | 특정 서비스 이름 잔존                                                                                        | 수용 | 문구 제거                                                                                                                                      |
| 3   | `[]` · 빈 블록 · 행끝 공백 · BOM · 들여쓰기 없는 리스트 · 중복 viewport 를 두 파서가 다르게 해석             | 수용 | spec:shots 가 CI 와 같은 계획 JSON 사용, 경계 테스트                                                                                           |
| 4   | 하위 폴더 page 사양 · route 없음을 spec:shots 는 건너뛰고 CI 는 요구                                         | 수용 | 둘 다 오류로 통일 (바로 아래 · route 필수 · slug 중복)                                                                                         |
| 5   | 실행 중인 dev 서버 재사용 → dev overlay · 오래된 빌드가 사양 이미지로                                        | 수용 | 전용 포트 3123 + `reuseExistingServer: false`                                                                                                  |
| 6   | `-g <slug>` 부분 일치                                                                                        | 수용 | `SPEC` 정확 일치 (id 또는 slug)                                                                                                                |
| 7   | 리다이렉트(로그인 화면)가 사양 이미지로 저장                                                                 | 수용 | `redirectedFrom` 이면 실패                                                                                                                     |
| 8   | mobile = 크기만 줄인 desktop                                                                                 | 수용 | isMobile · hasTouch · 모바일 UA                                                                                                                |
| 9   | `pnpm format` 이 `{{id}}` 템플릿 · frontmatter 리스트를 깨뜨림                                               | 수용 | 템플릿 prettier 제외 + 여러 줄 flow list 파싱                                                                                                  |
| 10  | testing 규칙이 runner 없는 `@repo/ui` 를 대상 · Button 무테스트                                              | 수용 | 규칙 정정 + `button.test.tsx` (3 round 에서 기본 `type` 1건만 남김 — ADR-0004)                                                                 |
| 11  | Button 사용 예시(`onClick` in Server Component) 빌드 실패                                                    | 수용 | 사양에 Client 경계 예시 · 예외 케이스                                                                                                          |
| 12  | 비고정 ignore 패턴이 `src/app/{out,build,coverage}` 라우트 제외                                              | 수용 | 앱 / 패키지 루트로 고정 (git · docker · eslint · prettier)                                                                                     |
| 13  | 클라이언트 측 `router.replace` 리다이렉트는 미탐지                                                           | 반박 | 서버 리다이렉트만 탐지 범위 — 사양에 결정적 상태로 찍도록 명시 (current-spec 규칙)                                                             |
| 14  | 상태별(loading / empty / error) 스크린샷 불가                                                                | 이월 | 261121_002                                                                                                                                     |
| 15  | release 명령 흐름 통합 테스트 없음                                                                           | 반박 | 분기 있는 순수 함수 테스트로 충분 (ADR-0004) — 261121_003 drop                                                                                 |
| 16  | 전체 static Pretendard(약 2.3 MB) 로드 · `font-sans` 미연결 · 테스트 전용 클래스가 CSS 에 포함               | 수용 | variable dynamic subset · `@theme --font-sans` · `@source not '../**/*.test.tsx'`                                                              |
| 17  | Dockerfile `NEXT_PUBLIC_*` ↔ 배포 `APP_VERSION` build-arg 불일치 · 미지정 시 빈 문자열 인라인 · turbo 미고정 | 수용 | 미사용 ARG 제거 (추가 방법 주석) · OCI label · `turbo@2.11.13`                                                                                 |
| 18  | Button 사양: 동적 라우트는 빌드가 아니라 요청 시 500 · Link 래핑 · 함수 prop client 예시가 잘못              | 수용 | 사양 사용법 · 예외 케이스 정정, `focus-visible` outline 추가                                                                                   |
| 19  | 두 번째 앱의 page 사양을 spec:shots 가 web 서버로 찍음                                                       | 반박 | 대상 앱 = `apps/web` 하나로 명시 (current-spec 규칙) — 필요 시 frontmatter `app` 확장                                                          |
| 20  | 전부 `screenshots: none` · `SPEC=','` 처리 · 동적 세그먼트 route 통과                                        | 수용 | skip 테스트 · `--only` 빈 값 오류 · `[id]` route 오류 (route 는 `spec-pages.test.mjs`)                                                         |
| 21  | turbo: `spec:shots` env 누락 · `.next/dev` 캐시 포함 · `PORT` 가 모든 캐시 키에                              | 수용 | `passThroughEnv` · `!.next/dev/**` · PORT 는 dev / start 만                                                                                    |
| 22  | SKILL 의 BE 전용 명령 · 새 패키지 의존 추가 누락 · Node 25+ corepack · favicon 404 · `no-console` 미강제     | 수용 | 문구 정정 · `icon.svg` · eslint `no-console`                                                                                                   |
| 23  | 공통 kit — 커밋 감사 · 출고 게이트 · 릴리스 · ship:check · 문서 과장 (BE task #35–39)                        | 수용 | BE 와 동일 수정 · 테스트                                                                                                                       |
| 24  | 남은 사진 파일(삭제된 page · viewport 의 png) 미탐지                                                         | 반박 | 사양 삭제 커밋에서 assets 도 지운다 — 탐지 도구는 과도                                                                                         |
| 25  | 컴포넌트는 스크린샷 · 변경 기준 갱신이 강제되지 않음 (사용자 요구)                                           | 수용 | component 미리보기 라우트 + 스크린샷 (CI 검사), `spec:shots:changed`, 사양 미갱신 CI warning — `spec-pages.test.mjs` · `commit-audit.test.mjs` |

## 결정

- [ADR-0001](../../../docs/adr/0001-monorepo.md) pnpm + Turbo 모노레포, `@repo/ui` JIT (transpilePackages + `@source`).
- [ADR-0002](../../../docs/adr/0002-current-spec-ship-gate.md) 현재 사양 중심 출고 게이트 (FE page = 스크린샷 + 사용 설명서).
- [ADR-0003](../../../docs/adr/0003-optional-docker-deploy.md) CI 기본 on, 릴리스 · Docker(GHCR) 배포 opt-in.
- [ADR-0004](../../../docs/adr/0004-minimal-tests.md) 테스트는 버그를 잡을 수 있을 때만.
- [ADR-0005](../../../docs/adr/0005-dependency-baseline.md) TS 6 · ESLint 9 유지 (TS 7 · ESLint 10 은 툴체인 미지원).
- [ADR-0006](../../../docs/adr/0006-client-js-check.md) 클라이언트 JS 확인 도구.

## 검증

- `pnpm check-types` ✅ · `pnpm lint` ✅ · `pnpm test` ✅ (1) · `pnpm build` ✅ · `pnpm spec:shots` ✅ (3 shots — home desktop / mobile · button desktop, 이미지 확인) · 일반 빌드에서 `/spec/components/button` 404 확인 · `pnpm format:check` ✅
- `node --test ".github/scripts/*.test.mjs" "scripts/*.test.mjs"` ✅ (108)
- `pnpm client-js` ✅ (`/` 131.5 KB gzip) · `next analyze export` + `graph-v1.schema.json` (스킬 절차) 동작 확인
- 미검증: Docker 이미지 실제 빌드 / 기동 (로컬 daemon 없음 — standalone 출력 경로는 수동 확인), GitHub Actions 실 실행
