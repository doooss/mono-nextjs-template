import { Button } from '@repo/ui/components/button';

// Button 사양 스크린샷 (docs/specs/components/button.md) — 변형 · 상태를 한 화면에
export default function ButtonPreview() {
  return (
    <>
      <Row label="primary (기본)">
        <Button>저장</Button>
      </Row>
      <Row label="secondary">
        <Button variant="secondary">취소</Button>
      </Row>
      <Row label="disabled">
        <Button disabled>저장</Button>
        <Button variant="secondary" disabled>
          취소
        </Button>
      </Row>
      <Row label="className 병합 (bg-red-600 이 기본 색을 대체)">
        <Button className="bg-red-600 hover:bg-red-700">삭제</Button>
      </Row>
    </>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm text-neutral-500">{label}</h2>
      <div className="flex gap-3">{children}</div>
    </section>
  );
}
