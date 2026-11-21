#!/usr/bin/env node
// 경로별 초기 로드(first load) 클라이언트 JS — `pnpm build` 뒤 `pnpm client-js`. 의존성 없음.
//
// Next 16 의 `next build` 는 경로별 JS 크기를 출력하지 않는다. 대신 .next/diagnostics/route-bundle-stats.json
// (경로 → 초기 로드 chunk 목록) 을 남기므로, 그 chunk 들의 gzip 크기를 합산해 표로 보여준다.
// 어떤 모듈이 크기를 만드는지는 `pnpm analyze` (Turbopack 분석 UI) 로 본다.
//
// usage: node scripts/client-js.mjs [--app apps/web] [--route /path] [--json]

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const appDir = join(ROOT, arg('--app') ?? 'apps/web');
const statsPath = join(appDir, '.next/diagnostics/route-bundle-stats.json');
if (!existsSync(statsPath)) {
  console.error(
    `❌ ${statsPath} 없음 — 먼저 production 빌드 (pnpm build). Turbopack 빌드만 생성한다.`,
  );
  process.exit(1);
}

const only = arg('--route');
const gzipCache = new Map();
const gzipBytes = (chunk) => {
  if (!gzipCache.has(chunk)) {
    const abs = join(appDir, chunk);
    gzipCache.set(
      chunk,
      existsSync(abs) ? gzipSync(readFileSync(abs), { level: 9 }).length : 0,
    );
  }
  return gzipCache.get(chunk);
};

const rows = JSON.parse(readFileSync(statsPath, 'utf8'))
  // /spec/* = 사양 미리보기 (spec:shots 빌드 전용) — 사용자 라우트가 아니다
  .filter((r) => (only ? r.route === only : !r.route.startsWith('/spec/')))
  .map((r) => ({
    route: r.route,
    gzipBytes: r.firstLoadChunkPaths.reduce((n, c) => n + gzipBytes(c), 0),
    rawBytes: r.firstLoadUncompressedJsBytes,
    chunks: r.firstLoadChunkPaths.length,
  }))
  .sort((a, b) => b.gzipBytes - a.gzipBytes || a.route.localeCompare(b.route));

if (only && rows.length === 0) {
  console.error(`❌ 경로 없음: ${only}`);
  process.exit(1);
}

if (args.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  const width = Math.max(5, ...rows.map((r) => r.route.length));
  console.log(
    `${'route'.padEnd(width)}  ${'gzip'.padStart(10)}  ${'raw'.padStart(10)}  chunks`,
  );
  for (const r of rows)
    console.log(
      `${r.route.padEnd(width)}  ${kb(r.gzipBytes).padStart(10)}  ${kb(r.rawBytes).padStart(10)}  ${r.chunks}`,
    );
}
