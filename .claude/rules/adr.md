# ADR (Architecture Decision Record)

출고 게이트 4단계. 이번 커밋에서 내린 결정을 남긴다. 위치 → [docs/adr/](../../docs/adr/README.md).

## 언제 쓰나

미래의 독자가 "왜 이렇게 했지?" 라고 물을 결정이면 쓴다.

- 새 의존성 / 라이브러리 교체 · 새 패턴 / 구조 · 데이터 모델 · API 계약 shape
- 대안을 검토하고 기각한 선택 (기각 이유가 핵심)
- 적대적 리뷰에서 **반박** 판정한 설계 선택 · 의도적 trade-off
- 기존 ADR 뒤집기 (새 ADR 이 `Supersedes`)

결정 없음 (버그 수정 · 기존 패턴 확장) → task `adr: none — <사유>`.

## 형식

`docs/adr/NNNN-<slug>.md` — `pnpm adr:new <slug> [제목]` → [README](../../docs/adr/README.md) 인덱스에 한 줄.

섹션: `Status` / `Date` / `Refs` (task id) / `Context` / `Decision` / `Alternatives` (기각 + 이유) / `Consequences`.

- 한 ADR = 한 결정, 보통 1 화면.
- `Accepted` 후 본문 수정 금지 (오탈자 제외). 바뀌면 새 ADR + 기존 Status `Superseded by NNNN`.
- "무엇이 되는가" 는 사양 문서, ADR 은 "왜" 만.
- 커밋 footer `ADR: NNNN` (여러 개 `ADR: 0003, 0004`) 또는 `ADR: none`.
