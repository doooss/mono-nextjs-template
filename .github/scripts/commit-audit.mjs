#!/usr/bin/env node
// 커밋 단위 감사 (ci.yml "Commit audit" job) — 의존성 없음.
//
// 커밋 하나 = 작업 기록 단위. 각 커밋을 따로 보고 Actions 요약에 표로 남긴다.
//   error   : Conventional Commits 형식 위반 · footer 가 가리키는 Spec/ADR 파일 없음 ·
//             done 으로 옮긴 task 의 출고 게이트 위반 (ship-gate.mjs)
//   warning : 코드 변경 커밋(feat/fix/perf/refactor)에 Refs footer · agent-work 갱신 ·
//             docs/specs 갱신(또는 Spec: footer) 누락, subject 72자 초과
//   COMMIT_AUDIT_STRICT=true → warning 도 실패 처리
//
// usage: node commit-audit.mjs --event            GitHub 이벤트(push / pull_request)에서 범위 계산
//        node commit-audit.mjs --range <a..b>     임의 범위
//        node commit-audit.mjs --sha <sha>        커밋 하나
//
// footer: Refs: <task-id>  /  Spec: <docs/specs 경로, …> | none | pending  /  ADR: <NNNN> | none

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

import {
  isMainModule,
  isReleaseCommit,
  NON_DEPLOY_TYPES,
  parseCommit,
} from './release.mjs';
import {
  adrExists,
  affectedSpecs,
  duplicateAdrNumbers,
  isShipTarget,
  listSpecs,
  validateShipTask,
} from './ship-gate.mjs';

const RELEASE_FILE_RE = /^apps\/[^/]+\/package\.json$/;
// `git revert` / GitHub Revert 버튼 기본 subject (revert 의 revert = `Reapply "…"`, git ≥ 2.43).
// squash 머지하면 GitHub 이 ` (#13)` 을 붙인다.
const GIT_REVERT_RE = /^(Revert|Reapply) ".+"( \(#\d+\))?$/;

export const TYPES = new Set([
  'feat',
  'fix',
  'perf',
  'refactor',
  'revert',
  'docs',
  'test',
  'build',
  'ci',
  'style',
  'chore',
]);
export const CODE_TYPES = new Set(['feat', 'fix', 'perf', 'refactor']);
const MAX_COMMITS = 200;
const ZERO_SHA = /^0+$/;

// ─── pure ───────────────────────────────────────────────────

// src 아래 코드 (src 안 README 같은 문서 제외)
export function isCodePath(path) {
  return /^(apps|packages)\/.+\/src\//.test(path) && !/\.md$/i.test(path);
}

// 배포 산출물에 영향을 주는 경로 — 코드 + 이미지 / 의존성 / 빌드 설정 / 정적 파일
export function isDeployPath(path) {
  return (
    isCodePath(path) ||
    /^(docker\/|\.dockerignore$)/.test(path) ||
    /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|turbo\.json)$/.test(
      path,
    ) ||
    /^(apps|packages)\/[^/]+\/(package|tsconfig[^/]*|nest-cli)\.json$/.test(
      path,
    ) ||
    /^apps\/[^/]+\/[^/]+\.config\.[cm]?[jt]s$/.test(path) ||
    /^apps\/[^/]+\/(public|scripts)\//.test(path) ||
    /^packages\/config\//.test(path)
  );
}

export function isTestPath(path) {
  return (
    /\.(spec|test|e2e-spec)\.[cm]?[jt]sx?$/.test(path) ||
    /(^|\/)__tests__\//.test(path) ||
    /^apps\/[^/]+\/(test|e2e)\//.test(path)
  );
}

// 대소문자 구분 — 본문 문장의 `spec: …` 은 footer 가 아니다. squash 커밋은 footer 가 여러 벌 → 전부 모은다
export function parseFooters(body = '') {
  const refs = [];
  const specs = [];
  const adrs = [];
  for (const m of body.matchAll(/^(Refs|Spec|ADR):[ \t]*(.+?)[ \t]*$/gm)) {
    if (m[1] === 'Refs')
      refs.push(
        ...m[2]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      );
    else if (m[1] === 'Spec') specs.push(m[2]);
    else adrs.push(m[2]);
  }
  return {
    refs,
    specs,
    adrs,
    spec: specs.join(' · ') || null,
    adr: adrs.join(' · ') || null,
  };
}

// Spec footer → { kind: 'none' | 'pending' | 'paths', paths }
export function parseSpecFooter(value) {
  if (!value) return null;
  if (/^none\b/i.test(value)) return { kind: 'none', paths: [] };
  if (/^pending\b/i.test(value)) return { kind: 'pending', paths: [] };
  return {
    kind: 'paths',
    paths: value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

// → { ids, invalid }  — `ADR: 3` · `ADR: TBD` 처럼 번호도 none 도 아니면 invalid
export function parseAdrFooter(value) {
  if (!value || /^none\b/i.test(value)) return { ids: [], invalid: false };
  const ids = [...value.matchAll(/(?:ADR-)?(\d{4})\b/gi)].map((m) => m[1]);
  return { ids, invalid: ids.length === 0 };
}

// `git diff-tree --name-status -M` 출력 → [{ status, path, from? }]
export function parseNameStatus(raw) {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [code, a, b] = line.split('\t');
      const status = code[0];
      return status === 'R' || status === 'C'
        ? { status, from: a, path: b }
        : { status, path: a };
    });
}

export function auditCommit(commit, files, view) {
  const result = {
    sha: commit.sha,
    subject: commit.subject,
    type: null,
    refs: [],
    spec: null,
    adr: null,
    ship: [],
    errors: [],
    warnings: [],
    skipped: false,
    skipReason: null,
  };
  const skip = (reason) => {
    result.skipped = true;
    result.skipReason = reason;
    return result;
  };
  const parents = commit.parents ?? [];
  // 머지 커밋 (back-merge 포함) — 내용은 각 부모 커밋에서 감사됨
  if (parents.length > 1) return skip('merge');
  // 저장소 첫 커밋 (템플릿 "Initial commit" 등)
  if (parents.length === 0) return skip('root');
  // release 커밋 = 버전 기록만 (apps/*/package.json). 다른 파일이 섞이면 일반 커밋으로 감사
  if (
    isReleaseCommit(commit.subject) &&
    files.length > 0 &&
    files.every((f) => RELEASE_FILE_RE.test(f.path))
  )
    return skip('release');

  const isGitRevert = GIT_REVERT_RE.test(commit.subject);
  const parsed = isGitRevert
    ? { type: 'revert' }
    : parseCommit({ ...commit, body: commit.body ?? '' });
  result.type = parsed.type;
  if (!TYPES.has(parsed.type))
    result.errors.push(
      `subject 형식 위반 — "<type>(<scope>): <subject>" (type: ${[...TYPES].join('|')})`,
    );
  if (commit.subject.length > 72)
    result.warnings.push(`subject ${commit.subject.length}자 — 72자 이하 권장`);

  const footers = parseFooters(commit.body);
  result.refs = footers.refs;
  result.spec = footers.spec;
  result.adr = footers.adr;

  const live = files.filter((f) => f.status !== 'D');
  const code = live.filter((f) => isCodePath(f.path) && !isTestPath(f.path));
  const touchedTask = files.some((f) => f.path.startsWith('agent-work/'));
  const touchedSpec = files.some((f) => f.path.startsWith('docs/specs/'));

  // docs / ci type 은 릴리스 · 배포 생략 대상 — 배포 산출물을 바꾸면(삭제 · rename 원본 포함) 그 변경이 배포에서 빠진다
  const deploy = files
    .flatMap((f) => (f.from ? [f.from, f.path] : [f.path]))
    .filter((p) => isDeployPath(p) && !isTestPath(p));
  if (NON_DEPLOY_TYPES.has(parsed.type) && deploy.length > 0)
    result.errors.push(
      `${parsed.type} type 커밋이 배포 산출물(${deploy[0]} 등)을 변경 — ${parsed.type} 은 릴리스/배포가 생략되므로 feat/fix/build 등으로`,
    );

  if (CODE_TYPES.has(parsed.type) && code.length > 0) {
    if (footers.refs.length === 0)
      result.warnings.push('코드 변경 커밋에 `Refs: <task-id>` footer 없음');
    if (!touchedTask)
      result.warnings.push('코드 변경 커밋에 agent-work task 갱신 없음');
    if (!touchedSpec && !footers.spec)
      result.warnings.push(
        'docs/specs 갱신 없음 — 사양 갱신 또는 `Spec: none|pending|<경로>` footer',
      );
  }

  // 변경 기준 — 사양 frontmatter `code` 가 가리키는 코드가 바뀌면 그 사양도 같은 커밋에서 갱신.
  // `Spec: pending`(중간 커밋) · `Spec: none`(사양 영향 없음 선언)이면 생략
  const specDeclared = footers.specs.some((v) => /^(pending|none)\b/i.test(v));
  if (CODE_TYPES.has(parsed.type) && code.length > 0 && !specDeclared) {
    const { direct } = affectedSpecs(
      code.map((f) => f.path),
      listSpecs(view),
    );
    for (const spec of direct)
      if (!files.some((f) => f.path === spec))
        result.warnings.push(
          `사양 미갱신: ${spec} — code 경로가 바뀜. 같은 커밋에서 최신으로 (화면 사양은 spec:shots:changed) · 영향 없으면 \`Spec: none\``,
        );
  }

  for (const value of footers.specs)
    for (const p of parseSpecFooter(value).paths)
      if (!/^docs\/specs\/.+\.md$/.test(p))
        result.errors.push(`Spec footer 는 docs/specs/**.md 경로만: ${p}`);
      else if (!view.exists(p))
        result.errors.push(`Spec footer 경로 없음: ${p}`);
  for (const value of footers.adrs) {
    const adr = parseAdrFooter(value);
    if (adr.invalid)
      result.errors.push(`ADR footer 형식: "${value}" — NNNN | none`);
    for (const id of adr.ids)
      if (!adrExists(id, view))
        result.errors.push(`ADR footer 파일 없음: docs/adr/${id}-*.md`);
  }
  if (files.some((f) => f.path.startsWith('docs/adr/')))
    for (const dup of duplicateAdrNumbers(view.list('docs/adr')))
      result.errors.push(
        `ADR 번호 중복: ${dup} — 다른 브랜치와 번호 충돌, 하나를 다음 번호로`,
      );

  // done 으로 들어오거나 수정된 task = 출고 게이트 대상
  result.ship = files.filter(isShipTarget).map((f) => f.path);
  for (const path of result.ship) {
    const gate = validateShipTask(path, view);
    result.errors.push(...gate.errors.map((e) => `[ship ${path}] ${e}`));
    result.warnings.push(...gate.warnings.map((w) => `[ship ${path}] ${w}`));
    const id = gate.task?.id;
    const added = files.some(
      (f) => f.path === path && (f.status === 'A' || f.status === 'R'),
    );
    if (added && id && !footers.refs.includes(id))
      result.warnings.push(`출고 커밋 Refs footer 에 ${id} 없음`);
  }
  return result;
}

// PR 머지 결과 tree 검사 (커밋 단위로는 못 보는 브랜치 간 충돌)
export function auditMergeResult(view) {
  return {
    sha: 'HEAD (merge)',
    subject: '(PR 머지 결과)',
    type: null,
    refs: [],
    spec: null,
    adr: null,
    ship: [],
    errors: duplicateAdrNumbers(view.list('docs/adr')).map(
      (dup) =>
        `머지 후 ADR 번호 중복: ${dup} — base 에 같은 번호가 먼저 들어감. 이 PR 의 ADR 을 다음 번호로`,
    ),
    warnings: [],
    skipped: false,
    skipReason: null,
  };
}

// GitHub 이벤트 → git rev-list 인자
export function rangeFromEvent(eventName, event, defaultBranch) {
  if (eventName === 'pull_request' || eventName === 'pull_request_target') {
    const { base, head } = event.pull_request;
    // pr: checkout 된 HEAD = PR 을 base 에 머지한 결과 → 머지 후 tree 검사(ADR 번호 충돌)에 사용
    return { range: `${base.sha}..${head.sha}`, pr: true };
  }
  if (eventName === 'push') {
    const { before, after, ref } = event;
    if (before && !ZERO_SHA.test(before))
      return { range: `${before}..${after}`, fallback: after };
    // 새 브랜치: 다른 원격 브랜치 어디에도 없는 커밋만 (갈라진 지점 이후)
    const branch = (ref ?? '').replace(/^refs\/heads\//, '');
    if (defaultBranch && branch && branch !== defaultBranch)
      return { newBranch: branch, after };
    return { single: after };
  }
  return { single: 'HEAD' };
}

function cell(text) {
  return String(text ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
}

export function renderSummary(results, { strict, repoUrl }) {
  const rows = results.map((r) => {
    const short = /^[0-9a-f]{7,}$/.test(r.sha) ? r.sha.slice(0, 7) : r.sha;
    const sha =
      repoUrl && /^[0-9a-f]{40}$/.test(r.sha)
        ? `[\`${short}\`](${repoUrl}/commit/${r.sha})`
        : short;
    const verdict = r.skipped
      ? `⏭️ skip (${r.skipReason ?? '-'})`
      : r.errors.length > 0 || (strict && r.warnings.length > 0)
        ? '❌'
        : r.warnings.length > 0
          ? '⚠️'
          : '✅';
    return `| ${sha} | ${cell(r.subject)} | ${cell(r.refs.join(', ') || '—')} | ${cell(r.spec ?? '—')} | ${cell(r.adr ?? '—')} | ${r.ship.length > 0 ? `🚢 ${r.ship.length}` : '—'} | ${verdict} |`;
  });
  const issues = results.flatMap((r) =>
    [
      ...r.errors.map((e) => `❌ ${e}`),
      ...r.warnings.map((w) => `⚠️ ${w}`),
    ].map(
      (m) =>
        `- \`${/^[0-9a-f]{7,}$/.test(r.sha) ? r.sha.slice(0, 7) : r.sha}\` ${m}`,
    ),
  );
  return [
    `## Commit audit${strict ? ' (strict)' : ''}`,
    '',
    '| commit | subject | Refs | Spec | ADR | ship | result |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    ...(issues.length > 0 ? ['### Issues', '', ...issues, ''] : []),
  ].join('\n');
}

// ─── git / io ───────────────────────────────────────────────

// core.quotePath=false — 기본값이면 비 ASCII 경로(한글 파일명)가 "…\353…" 로 인용돼 경로 정규식을 빠져나간다
function git(...args) {
  return execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trimEnd();
}

function tryGit(...args) {
  try {
    return git(...args);
  } catch {
    return null;
  }
}

export function gitView(sha) {
  return {
    read: (path) => tryGit('show', `${sha}:${path}`),
    exists: (path) => tryGit('cat-file', '-e', `${sha}:${path}`) !== null,
    list: (dir) => {
      const raw = tryGit('ls-tree', '--name-only', `${sha}:${dir}`);
      return raw ? raw.split('\n').filter(Boolean) : [];
    },
  };
}

function revList(spec) {
  if (spec.single) return [git('rev-parse', `${spec.single}^{commit}`)];
  if (spec.newBranch) {
    // 새 브랜치 첫 push: 자기 자신을 뺀 다른 원격 브랜치에서 도달 불가한 커밋만 = 이 브랜치 고유 커밋
    const own = `refs/remotes/origin/${spec.newBranch}`;
    const others = (
      tryGit('for-each-ref', '--format=%(refname)', 'refs/remotes/origin') ?? ''
    )
      .split('\n')
      .filter((r) => r && r !== own && r !== 'refs/remotes/origin/HEAD');
    if (others.length === 0)
      return [git('rev-parse', `${spec.after}^{commit}`)];
    spec = { range: [spec.after, '--not', ...others], fallback: spec.after };
  }
  const rangeArgs = Array.isArray(spec.range) ? spec.range : [spec.range];
  const raw = tryGit('rev-list', '--reverse', ...rangeArgs);
  if (raw === null) {
    if (!spec.fallback) throw new Error(`잘못된 범위: ${spec.range}`);
    console.log(
      `::notice::범위 ${spec.range} 해석 불가 (force push 등) — 마지막 커밋만 감사`,
    );
    return [git('rev-parse', `${spec.fallback}^{commit}`)];
  }
  const shas = raw.split('\n').filter(Boolean);
  if (shas.length > MAX_COMMITS) {
    console.log(
      `::notice::커밋 ${shas.length}개 — 최근 ${MAX_COMMITS}개만 감사`,
    );
    return shas.slice(-MAX_COMMITS);
  }
  return shas;
}

function readCommit(sha) {
  const [, parents, subject, body] = git(
    'log',
    '-1',
    '--format=%H%x1f%P%x1f%s%x1f%b',
    sha,
  ).split('\x1f');
  return {
    sha,
    parents: parents ? parents.split(' ').filter(Boolean) : [],
    subject,
    body: body ?? '',
  };
}

function resolveSpec(args) {
  const i = (name) => args.indexOf(name);
  if (i('--range') >= 0) return { range: args[i('--range') + 1] };
  if (i('--sha') >= 0) return { single: args[i('--sha') + 1] };
  if (args.includes('--event')) {
    const { GITHUB_EVENT_NAME, GITHUB_EVENT_PATH, DEFAULT_BRANCH } =
      process.env;
    if (!GITHUB_EVENT_PATH) throw new Error('GITHUB_EVENT_PATH 없음');
    const event = JSON.parse(readFileSync(GITHUB_EVENT_PATH, 'utf8'));
    return rangeFromEvent(
      GITHUB_EVENT_NAME,
      event,
      DEFAULT_BRANCH || event.repository?.default_branch,
    );
  }
  throw new Error(
    'usage: commit-audit.mjs --event | --range <a..b> | --sha <sha>',
  );
}

function main() {
  const spec = resolveSpec(process.argv.slice(2));
  const strict = process.env.COMMIT_AUDIT_STRICT === 'true';
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY } = process.env;
  const repoUrl =
    GITHUB_SERVER_URL && GITHUB_REPOSITORY
      ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}`
      : null;

  const results = revList(spec).map((sha) => {
    const commit = readCommit(sha);
    const files = parseNameStatus(
      git(
        'diff-tree',
        '--no-commit-id',
        '--name-status',
        '-r',
        '-M',
        '--root',
        sha,
      ),
    );
    return auditCommit(commit, files, gitView(sha));
  });

  // PR: 각 커밋 tree 는 base 의 새 ADR 을 모른다 → 머지 결과(HEAD = refs/pull/N/merge)에서 번호 충돌 검사
  if (spec.pr) {
    const merged = auditMergeResult(gitView('HEAD'));
    if (merged.errors.length > 0) results.push(merged);
  }

  for (const r of results) {
    const short = /^[0-9a-f]{7,}$/.test(r.sha) ? r.sha.slice(0, 7) : r.sha;
    for (const e of r.errors)
      console.log(`::error title=commit ${short}::${e}`);
    for (const w of r.warnings)
      console.log(
        `::${strict ? 'error' : 'warning'} title=commit ${short}::${w}`,
      );
  }
  const summary = renderSummary(results, { strict, repoUrl });
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  else console.log(summary);

  const failed = results.some(
    (r) => r.errors.length > 0 || (strict && r.warnings.length > 0),
  );
  if (failed) process.exit(1);
}

if (isMainModule(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}
