// `pnpm spec:shots` — 스크린샷 사양(docs/specs/pages · components/*.md)마다 스크린샷을 찍는다.
// 계획(route · viewport · 저장 경로)은 .github/scripts/spec-pages.mjs 가 만든다 — CI 검증(ship-gate.mjs)과 같은 파서.
// 일부만: SPEC=<id|slug>[,…] pnpm spec:shots · 작업 중 바뀐 것만: pnpm spec:shots:changed
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

import {
  type BrowserContextOptions,
  devices,
  expect,
  test,
} from '@playwright/test';

const REPO_ROOT = resolve(__dirname, '../../..');

type Viewport = 'desktop' | 'mobile';
interface PagePlan {
  id: string;
  slug: string;
  route: string;
  shots: { viewport: Viewport; file: string }[];
}

const CONTEXTS: Record<Viewport, BrowserContextOptions> = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  // 모바일 = 터치 · 모바일 UA · isMobile (media query pointer/hover 포함). 파일 크기 위해 DPR 1
  mobile: {
    userAgent: devices['iPhone 13'].userAgent,
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  },
};

function loadPlan(): PagePlan[] {
  const args = [join(REPO_ROOT, '.github/scripts/spec-pages.mjs')];
  if (process.env.SPEC) args.push('--only', process.env.SPEC);
  if (process.env.SPEC_CHANGED === '1') args.push('--changed');
  // 사양 오류면 여기서 throw → 전체 실행 실패 (CI 와 같은 규칙)
  const out = execFileSync(process.execPath, args, { encoding: 'utf8' });
  return (JSON.parse(out) as { pages: PagePlan[] }).pages;
}

const pages = loadPlan();

// 사양이 없거나 전부 `screenshots: none` 이어도 "No tests found" 로 실패하지 않게
if (pages.every((spec) => spec.shots.length === 0)) {
  test('no screenshots to take', () => {
    test.skip(true, '스크린샷 대상 사양 없음 (또는 바뀐 사양 없음)');
  });
}

for (const spec of pages) {
  for (const shot of spec.shots) {
    test(`[${spec.id}] ${shot.viewport} ${spec.route}`, async ({ browser }) => {
      const context = await browser.newContext({
        ...CONTEXTS[shot.viewport],
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul',
        colorScheme: 'light',
      });
      try {
        const page = await context.newPage();
        const response = await page.goto(spec.route, {
          waitUntil: 'networkidle',
        });
        expect(response, `${spec.route} 응답 없음`).not.toBeNull();
        expect(response!.status(), `${spec.route} HTTP status`).toBeLessThan(
          400,
        );
        // 리다이렉트(예: 인증 → /login)면 다른 화면이 사양 이미지로 저장된다 → 실패 처리
        expect(
          response!.request().redirectedFrom(),
          `${spec.route} 가 ${new URL(page.url()).pathname} 로 리다이렉트됨 — 사양 route 또는 상태(mock/seed) 확인`,
        ).toBeNull();
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: join(REPO_ROOT, shot.file),
          fullPage: true,
          animations: 'disabled',
        });
      } finally {
        await context.close();
      }
    });
  }
}
