# nextjs-template

Next.js 16 프론트엔드 모노레포 템플릿 — pnpm 11 · Turborepo · React 19 · Tailwind 4 · 커밋 단위 CI · 현재 사양(스크린샷 + 사용 설명서) 중심 작업 기록.

## 시작

요구: Node ≥22 (CI 24), pnpm 11 — `corepack enable` (Node 25+ 는 corepack 미동봉 → `npm i -g corepack` 먼저, 또는 `npm i -g pnpm@11`).

```bash
pnpm install
pnpm dev:web                     # http://localhost:3000
```

사양 스크린샷을 처음 찍는 머신: `pnpm --filter web exec playwright install --only-shell chromium`.

## 구조

```
apps/web/                    Next.js 앱 — src/app/ (App Router) · e2e/ (사양 스크린샷)
packages/ui/                 @repo/ui — 공유 컴포넌트 (JIT, 빌드 없음)
packages/config/             @repo/{typescript,eslint,prettier}-config
docker/web.Dockerfile        (선택) 배포 이미지 — turbo prune + standalone
docs/specs/                  현재 사양 (pages · components · flows) + pages/assets 스크린샷
docs/adr/                    결정 기록
agent-work/                  task 추적 + 출고 게이트
.github/                     CI · PR 자동화 · 릴리스 · 배포
.claude/                     에이전트 규칙 · 스킬 · 서브에이전트 (CLAUDE.md 가 인덱스)
```

## 명령

| 명령                                                     | 역할                                                                                      |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm dev:web`                                           | 개발 서버                                                                                 |
| `pnpm build` · `pnpm start`                              | 빌드 · 실행                                                                               |
| `pnpm check-types` · `pnpm lint` · `pnpm test`           | 검사 (CI 동일)                                                                            |
| `pnpm lint:fix` · `pnpm format`                          | 자동 수정 (format 은 md 포함)                                                             |
| `pnpm spec:shots` (`SPEC=<id>` 지정)                     | page · component 사양의 route → `{pages,components}/assets/<slug>.<viewport>.png`         |
| `pnpm spec:shots:changed`                                | 작업 중 바뀐 코드의 사양(+ 그것을 쓰는 화면)만 다시 찍기                                  |
| `pnpm client-js` (`--route /x` · `--json`)               | 경로별 초기 로드 JS (gzip) — `pnpm build` 뒤. page 사양 `## 클라이언트 JS`                |
| `pnpm analyze` · `pnpm analyze:snapshot <name>`          | Turbopack 모듈 분석 UI (:4000) · 전후 비교용 스냅샷. 축소는 `/next-bundle-optimizer` 스킬 |
| `pnpm docker:build`                                      | 로컬 이미지 (`web:local`)                                                                 |
| `pnpm task:status` · `pnpm task:new <epic\|misc> <slug>` | task 조회 · 생성                                                                          |
| `pnpm adr:new <slug>` · `pnpm ship:check`                | ADR 생성 · 출고 게이트 검증                                                               |

## 작업 방식 — 현재 사양과 흐름을 남긴다

```
task 생성 → 구현 → [출고 게이트] → 한 커밋 (코드 + task + 사양 + 스크린샷 + ADR)
              1 로컬 검증
              2 적대적 리뷰 (필수 · 새 컨텍스트 리뷰어)
              3 작업 기록 압축 (최종 사양 · 예외 케이스 · 결정 · 검증)
              4 ADR (또는 none — 사유)
              5 현재 사양 덮어쓰기 — page 는 스크린샷 + 사용 설명서 + 상태
```

- `docs/specs/` 만 읽으면 지금 화면과 동작을 알 수 있게 유지한다. 이력은 git · task · ADR.
- prod / 배포 확인은 작업 단계가 아니다.
- 상세: [agent-work](agent-work/README.md) · [사양 규칙](.claude/rules/current-spec.md) · [ADR-0002](docs/adr/0002-current-spec-ship-gate.md).

## 커밋 / CI

Conventional Commits + footer (`Refs:` task id · `Spec:` 사양 경로 | pending | none · `ADR:` 번호 | none).
CI 가 커밋마다 감사하고 (done task 의 page 사양은 스크린샷 존재까지) Actions Summary 에 표로 남긴다.
릴리스 태깅 · Docker 배포는 저장소 변수로 켜는 선택 기능 → [docs/ci-cd.md](docs/ci-cd.md).

## 메모

- `output: 'standalone'` 은 `BUILD_STANDALONE=true` 일 때만 켜진다 (Dockerfile 이 설정). 평소 `next start` 는 일반 빌드.
- 새 workspace UI 패키지 = `apps/web/package.json` 의존 (`"@repo/<name>": "workspace:*"`) + `next.config.ts` `transpilePackages` + `globals.css` `@source` 셋 다 등록.
