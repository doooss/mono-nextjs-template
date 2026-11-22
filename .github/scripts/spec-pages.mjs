#!/usr/bin/env node
// 스크린샷 사양(page · screen · component) → 스크린샷 계획 JSON (spec:shots 입력). 의존성 없음.
//
// CI 검증(ship-gate.mjs)과 같은 파서 / 규칙(shotPlan)을 쓰므로 "spec:shots 는 성공했는데
// CI 는 스크린샷 없음" 같은 불일치가 생기지 않는다.
//
// usage: node .github/scripts/spec-pages.mjs [--only <id|slug>[,…]] [--changed]
//   --only     pages/home · screens/home · components/button · home (slug 가 한 개체에만 있으면 그대로)
//   --changed  작업 중 바뀐 파일(HEAD 대비 + untracked)의 사양 — frontmatter `code` 가 겹치거나 문서 자체가
//              바뀐 사양 + 그것을 링크하는 사양 (예: Button 이 바뀌면 Button 을 쓰는 page 도)
//   stdout = { "pages": [{ id, kind, slug, route, shots: [{ viewport, file }] }] }   (file = 저장소 루트 기준)
//   사양 오류(route 없음 · 알 수 없는 viewport · 하위 폴더 등)가 하나라도 있으면 stderr + exit 1

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isMainModule } from './release.mjs';
import {
  affectedSpecs,
  isShotSpecFile,
  listSpecs,
  memoryView,
  shotPlan,
} from './ship-gate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function walk(dir) {
  let out = [];
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(abs));
    else out.push(abs);
  }
  return out;
}

const rel = (root, abs) => relative(root, abs).split('\\').join('/');

// 작업 중 바뀐 파일 — HEAD 대비 (staged + unstaged) + untracked. 커밋이 없으면 전부
export function changedFiles(root) {
  const git = (...args) =>
    execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .filter(Boolean);
  const untracked = git('ls-files', '--others', '--exclude-standard');
  try {
    return [...git('diff', '--name-only', 'HEAD'), ...untracked];
  } catch {
    return [...git('ls-files'), ...untracked];
  }
}

export function buildPlan(root, { only = null, changed = null } = {}) {
  const files = [
    'docs/specs/pages',
    'docs/specs/screens',
    'docs/specs/components',
  ]
    .flatMap((d) => walk(join(root, d)))
    .map((abs) => rel(root, abs))
    .filter(isShotSpecFile)
    .sort();
  const plans = files
    .map((path) => ({
      path,
      ...shotPlan(path, readFileSync(join(root, path), 'utf8')),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const errors = plans.flatMap((p) => p.errors);
  let pages = plans.map(({ path, id, kind, slug, route, shots }) => ({
    path,
    id,
    kind,
    slug,
    route,
    shots,
  }));

  if (only) {
    const picked = new Set();
    for (const want of only) {
      const hits = pages.filter((p) => p.id === want || p.slug === want);
      if (hits.length === 0) errors.push(`--only 에 없는 사양: ${want}`);
      else if (hits.length > 1)
        errors.push(
          `--only "${want}" 가 여러 사양과 일치 — ${hits.map((h) => h.id).join(' / ')} 중 하나로`,
        );
      else picked.add(hits[0].id);
    }
    pages = pages.filter((p) => picked.has(p.id));
  }
  if (changed) {
    const specs = listSpecs(
      memoryView(
        Object.fromEntries(
          files.map((p) => [p, readFileSync(join(root, p), 'utf8')]),
        ),
      ),
    );
    const { direct, linked } = affectedSpecs(changed, specs);
    const hit = new Set([
      ...direct,
      ...linked,
      ...changed.filter((p) => isShotSpecFile(p)),
    ]);
    pages = pages.filter((p) => hit.has(p.path));
  }
  return {
    pages: pages.map(({ path: _path, ...rest }) => rest),
    errors,
  };
}

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--only');
  const only =
    i >= 0
      ? (args[i + 1] ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : null;
  const changed = args.includes('--changed') ? changedFiles(ROOT) : null;
  const { pages, errors } = buildPlan(ROOT, { only, changed });
  if (only && only.length === 0) errors.push('--only 에 사양이 없음');
  if (errors.length > 0) {
    for (const e of errors) console.error(`❌ ${e}`);
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify({ pages }, null, 2)}\n`);
}
