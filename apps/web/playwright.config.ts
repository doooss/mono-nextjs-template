import { defineConfig } from '@playwright/test';

// 사양 스크린샷 전용 (docs/specs/{pages,components}/*.md → 같은 폴더 assets/*.png).
// 항상 새 production 빌드를 전용 포트에서 띄운다 — 개발 서버(dev overlay) · 오래된 빌드가 찍히지 않게.
// SPEC_PREVIEW=1 빌드에서만 컴포넌트 미리보기 라우트(/spec/components/*)가 열린다 (그 외 빌드는 404).
// 외부 서버를 쓰려면 SPEC_SHOTS_BASE_URL 지정 (그 서버가 무엇을 띄우는지는 호출자 책임).
const PORT = Number(process.env.SPEC_SHOTS_PORT ?? 3123);
const EXTERNAL = process.env.SPEC_SHOTS_BASE_URL;
const BASE_URL = EXTERNAL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: /spec-shots\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  outputDir: './test-results',
  use: { baseURL: BASE_URL },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: EXTERNAL
    ? undefined
    : {
        command: `SPEC_PREVIEW=1 pnpm build && pnpm start --port ${PORT}`,
        url: BASE_URL,
        // 같은 포트에 이미 무언가 떠 있으면 재사용하지 않고 실패 → 이미지 출처가 항상 이번 빌드
        reuseExistingServer: false,
        timeout: 240_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
