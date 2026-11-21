// @repo/ui 는 자체 test runner 가 없다 — 공유 컴포넌트 테스트는 web 의 jest 에서 (docs/specs/components/button.md)
import { Button } from '@repo/ui/components/button';
import { fireEvent, render, screen } from '@testing-library/react';

describe('Button', () => {
  it('defaults to type="button" so it never submits a form by accident', () => {
    const onSubmit = jest.fn((e: { preventDefault: () => void }) =>
      e.preventDefault(),
    );
    render(
      <form onSubmit={onSubmit}>
        <Button>저장</Button>
      </form>,
    );

    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
