import './globals.css';
// dynamic subset — 화면에 쓰인 글자의 subset woff2 만 내려받는다 (전체 static 세트는 수 MB)
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'App',
  description: 'Next.js monorepo template',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
