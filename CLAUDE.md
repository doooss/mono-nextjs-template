# nextjs-template

Next.js 16 프론트엔드 모노레포 템플릿. pnpm 11 + Turborepo + React 19 + Tailwind 4.

- `apps/web` — App Router 앱, port 3000
- `packages/{ui,config/*}` — 공유 (`@repo/*`). `@repo/ui` = JIT (TS 소스 export)

**작업 원칙 = 현재 사양과 흐름을 남긴다.** task(`agent-work/`) → 출고 게이트(적대적 리뷰 필수) → 현재 사양(`docs/specs/`, **스크린샷 + 사용 설명서**) + 결정(`docs/adr/`) → 한 커밋. CI 가 커밋마다 검사한다.

규칙 본문 → [.claude/rules/](.claude/rules/). 트리거에 맞는 파일만 읽는다.

## Rules

| 영역                 | 파일                                                         | Trigger                             |
| -------------------- | ------------------------------------------------------------ | ----------------------------------- |
| Task + 출고 게이트   | [agent-work.md](.claude/rules/agent-work.md)                 | 작업 시작 / 완료                    |
| 적대적 리뷰          | [adversarial-review.md](.claude/rules/adversarial-review.md) | 출고 게이트 2                       |
| 현재 사양 + 스크린샷 | [current-spec.md](.claude/rules/current-spec.md)             | 화면 / 동작 변경                    |
| ADR                  | [adr.md](.claude/rules/adr.md)                               | 결정이 있을 때                      |
| Commit & PR          | [commit-pr.md](.claude/rules/commit-pr.md)                   | 커밋 / PR                           |
| Code style           | [code-style.md](.claude/rules/code-style.md)                 | 코드 변경                           |
| Next.js              | [nextjs.md](.claude/rules/nextjs.md)                         | `apps/web` · `packages/ui` 코드     |
| Monorepo             | [monorepo.md](.claude/rules/monorepo.md)                     | 패키지 간 수정 / 새 패키지 / 의존성 |
| Testing              | [testing.md](.claude/rules/testing.md)                       | 테스트 작성 · 수정                  |

## Skills / Agents

| 이름                                                                    | 용도                                                                                                |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [/ship-task](.claude/skills/ship-task/SKILL.md)                         | 출고 게이트 6단계 실행 (구현 끝났을 때)                                                             |
| [adversarial-reviewer](.claude/agents/adversarial-reviewer.md)          | 적대적 리뷰 서브에이전트 (ship-task 가 호출)                                                        |
| [/next-bundle-optimizer](.claude/skills/next-bundle-optimizer/SKILL.md) | 초기 로드 JS 분석 · 축소 (vercel/next.js 원본) — [nextjs.md](.claude/rules/nextjs.md#클라이언트-js) |

## Paths

| 경로                                 | 역할                                                                |
| ------------------------------------ | ------------------------------------------------------------------- |
| [agent-work/](agent-work/README.md)  | task 추적 (에픽 / misc / manual-task / archive)                     |
| [docs/specs/](docs/specs/README.md)  | **현재 사양** — pages (스크린샷 + 사용 설명서) / components / flows |
| [docs/adr/](docs/adr/README.md)      | 결정 기록                                                           |
| [docs/ci-cd.md](docs/ci-cd.md)       | CI(커밋 감사) · 릴리스 · Docker 배포 (opt-in)                       |
| [packages/ui/src/](packages/ui/src/) | 공유 UI — 새로 만들기 전에 재사용                                   |

## Commands

```bash
pnpm dev:web                      # http://localhost:3000
pnpm check-types && pnpm lint && pnpm test
pnpm spec:shots                   # page · component 사양 route → 스크린샷 (SPEC=<id> 지정)
pnpm spec:shots:changed           # 작업 중 바뀐 코드의 사양만 다시 찍기
pnpm client-js                    # 경로별 초기 로드 JS (gzip, build 후) · pnpm analyze = 모듈 분석 UI
pnpm task:status                  # 세션 시작 스캔
pnpm task:new <epic|misc> <slug>  # task 생성
pnpm adr:new <slug> [제목]         # ADR 생성
pnpm ship:check                   # 출고 게이트 검증 (커밋 전)
```

## Session start

1. `pnpm task:status` — 열린 task / manual-task 확인.
2. 작업 = task 파일부터 (`pnpm task:new`). 영향 화면의 현재 사양(`docs/specs/pages|components`)을 먼저 읽는다.
3. 구현 완료 → `/ship-task`. 커밋 · 푸시는 사용자 요청 시에만.
