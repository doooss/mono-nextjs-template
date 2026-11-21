# ADR

결정 기록 — "왜 이렇게 했나". 규칙 → [.claude/rules/adr.md](../../.claude/rules/adr.md). 생성 = `pnpm adr:new <slug> [제목]` 후 아래 표에 한 줄.

| #                                      | 제목                                                                  | Status   | Date       |
| -------------------------------------- | --------------------------------------------------------------------- | -------- | ---------- |
| [0001](0001-monorepo.md)               | pnpm + Turborepo 모노레포                                             | Accepted | 2026-11-21 |
| [0002](0002-current-spec-ship-gate.md) | 현재 사양 중심 출고 게이트                                            | Accepted | 2026-11-21 |
| [0003](0003-optional-docker-deploy.md) | CI 기본 on, 릴리스 · Docker 배포는 opt-in                             | Accepted | 2026-11-21 |
| [0004](0004-minimal-tests.md)          | 테스트는 버그를 잡을 수 있을 때만                                     | Accepted | 2026-11-21 |
| [0005](0005-dependency-baseline.md)    | 의존성 기준선 (TS 6 · ESLint 9 유지)                                  | Accepted | 2026-11-21 |
| [0006](0006-client-js-check.md)        | 클라이언트 JS 확인 (client-js · next analyze · next-bundle-optimizer) | Accepted | 2026-11-21 |
