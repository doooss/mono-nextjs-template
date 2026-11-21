import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

// 컴포넌트 사양 미리보기 (/spec/components/<name>) — `pnpm spec:shots` 빌드(SPEC_PREVIEW=1)에서만 렌더.
// 그 외 빌드(dev · production · Docker)에서는 404 — 사용자에게 노출되지 않는다.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function SpecPreviewLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (process.env.SPEC_PREVIEW !== '1') notFound();
  return <main className="flex flex-col gap-8 p-8">{children}</main>;
}
