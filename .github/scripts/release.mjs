#!/usr/bin/env node
// 릴리스 버전 계산 + 릴리스 노트 생성 (GitHub Actions 전용, 의존성 없음).
//
// 태그 체계
//   stable : vX.Y.Z            → GitHub Release (prod)
//   canary : vX.Y.Z-canary.N   → GitHub pre-release (sandbox). X.Y.Z = 최신 stable 의 patch+1
//
// 하위 명령 (결과는 GITHUB_OUTPUT 에 key=value 로 기록, 로컬 실행 시 stdout)
//   canary                                  develop HEAD → 다음 canary 버전
//   stable --bump <patch|minor|major>       최신 canary → prod 버전 (+ main 핫픽스 역머지 검증)
//          [--base <ref>] [--main <ref>]
//   hotfix                                  main HEAD → patch 핫픽스 버전 + canary 재배치 계획
//   set-version <X.Y.Z>                     apps/*/package.json#version 기록 (앱 전체 동일 버전)

import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 직접 실행 여부. import.meta.url 은 realpath 라 symlink 경로(/var → /private/var 등)로 실행하면
// 단순 URL 비교가 실패해 main 이 조용히 생략된다 → 양쪽 realpath 비교.
export function isMainModule(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return (
      realpathSync(process.argv[1]) === realpathSync(fileURLToPath(metaUrl))
    );
  } catch {
    return false;
  }
}

const STABLE_RE = /^v(\d+)\.(\d+)\.(\d+)$/;
const CANARY_RE = /^v(\d+)\.(\d+)\.(\d+)-canary\.(\d+)$/;
const COMMIT_RE = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;
const RELEASE_COMMIT_PREFIX = 'chore(release):';
// 이전 태그가 없으면 전체 이력(1천+ 커밋)이 노트에 실려 GitHub 본문 한도(125k)에 근접 → 생략.
const INITIAL_NOTES = '초기 릴리스 — 이전 태그 없음 (전체 이력 생략).\n';

const SECTIONS = [
  ['feat', '✨ Features'],
  ['fix', '🐛 Bug Fixes'],
  ['perf', '⚡ Performance'],
  ['refactor', '♻️ Refactoring'],
  ['revert', '⏪ Reverts'],
  ['docs', '📝 Documentation'],
  ['test', '✅ Tests'],
  ['build', '📦 Build'],
  ['ci', '👷 CI'],
  ['style', '💄 Style'],
  ['chore', '🔧 Chores'],
];

// ─── pure ───────────────────────────────────────────────────

export function parseTag(tag) {
  const canary = CANARY_RE.exec(tag);
  if (canary) {
    const [, major, minor, patch, n] = canary.map(Number);
    return { major, minor, patch, canary: n };
  }
  const stable = STABLE_RE.exec(tag);
  if (stable) {
    const [, major, minor, patch] = stable.map(Number);
    return { major, minor, patch, canary: null };
  }
  return null;
}

// stable 은 같은 X.Y.Z 의 canary 보다 크다 (semver pre-release 규칙).
export function compareVersions(a, b) {
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] - b[key];
  }
  if (a.canary === b.canary) return 0;
  if (a.canary === null) return 1;
  if (b.canary === null) return -1;
  return a.canary - b.canary;
}

export function bump(version, kind) {
  const { major, minor, patch } = version;
  switch (kind) {
    case 'major':
      return { major: major + 1, minor: 0, patch: 0, canary: null };
    case 'minor':
      return { major, minor: minor + 1, patch: 0, canary: null };
    case 'patch':
      return { major, minor, patch: patch + 1, canary: null };
    default:
      throw new Error(`unknown bump kind: ${kind}`);
  }
}

export function formatVersion({ major, minor, patch, canary }) {
  const core = `${major}.${minor}.${patch}`;
  return canary === null ? core : `${core}-canary.${canary}`;
}

export function classifyTags(tags) {
  const parsed = tags
    .map((tag) => ({ tag, version: parseTag(tag) }))
    .filter((t) => t.version !== null)
    .sort((a, b) => compareVersions(a.version, b.version));
  return {
    stables: parsed.filter((t) => t.version.canary === null),
    canaries: parsed.filter((t) => t.version.canary !== null),
  };
}

export function canariesUpTo(canaries, baseTag) {
  const base = canaries.find((c) => c.tag === baseTag);
  if (!base) return canaries;
  return canaries.filter((c) => compareVersions(c.version, base.version) <= 0);
}

export function latestStableVersion(stables) {
  return stables.length > 0
    ? stables[stables.length - 1].version
    : { major: 0, minor: 1, patch: 0, canary: null };
}

export function nextCanaryVersion(stables, canaries) {
  const base = bump(latestStableVersion(stables), 'patch');
  const sameBase = canaries.filter(
    (c) => compareVersions({ ...c.version, canary: null }, base) === 0,
  );
  const n =
    sameBase.length > 0 ? sameBase[sameBase.length - 1].version.canary + 1 : 1;
  return { ...base, canary: n };
}

export function parseCommit({ sha, subject, body, author }) {
  const match = COMMIT_RE.exec(subject);
  const breaking = /^BREAKING[ -]CHANGE:/m.test(body);
  if (!match) {
    return {
      sha,
      author,
      type: 'other',
      scope: null,
      breaking,
      description: subject,
    };
  }
  const [, type, scope, bang, description] = match;
  return {
    sha,
    author,
    type: type.toLowerCase(),
    scope: scope ?? null,
    breaking: breaking || bang === '!',
    description,
  };
}

export function isReleaseCommit(subject) {
  return subject.startsWith(RELEASE_COMMIT_PREFIX);
}

// 이미지 / 런타임에 영향 없는 커밋 type. 직전 태그 이후 이 type 커밋뿐이면 release / 배포 생략.
//   docs = 문서, ci = GitHub Actions / 릴리스 스크립트.
//   배포 산출물(scripts/deploy-*.sh, Dockerfile)을 바꾸는 커밋은 ci 가 아니라 build / fix 등으로 쓴다.
export const NON_DEPLOY_TYPES = new Set(['docs', 'ci']);

// 빈 목록 / release 커밋만 = 생략 대상 아님.
export function isNonDeployOnly(commits) {
  const relevant = commits.filter((c) => !isReleaseCommit(c.subject));
  return (
    relevant.length > 0 &&
    relevant.every((c) => NON_DEPLOY_TYPES.has(parseCommit(c).type))
  );
}

// commitUrl 지정 시 그 URL 로 링크 (PR 본문 = PR 커밋 탭), 미지정 시 repo 커밋 페이지.
export function renderNotes(
  commits,
  { repoUrl, previousTag, currentTag = 'HEAD', commitUrl },
) {
  const parsed = commits
    .filter((c) => !isReleaseCommit(c.subject))
    .map(parseCommit);
  if (parsed.length === 0)
    return '변경 커밋 없음 (merge / back-merge 만 포함).\n';

  const line = (c) => {
    const scope = c.scope ? `**${c.scope}**: ` : '';
    const url = commitUrl
      ? commitUrl(c.sha)
      : repoUrl
        ? `${repoUrl}/commit/${c.sha}`
        : null;
    const link = url ? `[\`${c.sha.slice(0, 7)}\`](${url})` : c.sha.slice(0, 7);
    return `- ${scope}${c.description} (${link})`;
  };

  const out = [];
  const breaking = parsed.filter((c) => c.breaking);
  if (breaking.length > 0)
    out.push('### ⚠️ BREAKING CHANGES', ...breaking.map(line), '');

  const known = new Set(SECTIONS.map(([type]) => type));
  for (const [type, title] of [...SECTIONS, ['other', '📌 Other']]) {
    const group = parsed.filter((c) =>
      type === 'other' ? !known.has(c.type) : c.type === type,
    );
    if (group.length > 0) out.push(`### ${title}`, ...group.map(line), '');
  }

  if (previousTag && repoUrl)
    out.push(
      `**Compare**: ${repoUrl}/compare/${previousTag}...${currentTag}`,
      '',
    );
  return out.join('\n');
}

// ─── git / io ───────────────────────────────────────────────

function git(...args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

function listTags() {
  const raw = git('tag', '--list', 'v*');
  return raw ? raw.split('\n') : [];
}

// head 에서 도달 가능하되 exclude 태그 어느 것에서도 도달 불가능한 non-merge 커밋.
function commitsSince(head, excludeTags) {
  const raw = git(
    'log',
    '--no-merges',
    '--format=%H%x1f%s%x1f%b%x1f%an%x1e',
    head,
    ...excludeTags.map((t) => `^${t}`),
  );
  return raw
    .split('\x1e')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [sha, subject, body, author] = r.split('\x1f');
      return { sha, subject, body: body ?? '', author };
    });
}

function isAncestor(a, b) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', a, b], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

// base 커밋이 이미 stable 태그 이력에 포함되면 그 태그, 아니면 null. (ancestorFn 주입 = 테스트용)
export function alreadyReleasedIn(base, stables, ancestorFn) {
  const latest = stables.at(-1)?.tag;
  if (!latest) return null;
  return ancestorFn(base, latest) ? latest : null;
}

// main 에만 있고 base 에 같은 patch 도 없는 non-merge 커밋. cherry-pick 으로 이미 옮겨진 커밋은 제외.
export function mainOnlyCommits(mainRef, base, run = git) {
  const raw = run(
    'log',
    '--no-merges',
    '--cherry-pick',
    '--left-only',
    '--format=%H%x1f%s%x1e',
    `${mainRef}...${base}`,
  );
  return raw
    .split('\x1e')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [sha, subject] = r.split('\x1f');
      return { sha, subject };
    })
    .filter((c) => !isReleaseCommit(c.subject));
}

function repoUrl() {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY } = process.env;
  return GITHUB_SERVER_URL && GITHUB_REPOSITORY
    ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}`
    : null;
}

function writeNotes(name, content) {
  const dir = process.env.RUNNER_TEMP ?? tmpdir();
  const file = join(dir, `${name}.md`);
  writeFileSync(file, content);
  return file;
}

function emit(outputs) {
  const lines = Object.entries(outputs).map(([k, v]) => `${k}=${v}`);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
}

function hasFlag(args, name) {
  return args.includes(name);
}

function argValue(args, name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

// ─── commands ───────────────────────────────────────────────

function cmdCanary() {
  const tags = listTags();
  const { stables, canaries } = classifyTags(tags);
  const headTags = git('tag', '--points-at', 'HEAD')
    .split('\n')
    .filter(Boolean);
  const existing = headTags.find((t) => CANARY_RE.test(t));
  if (existing) {
    emit({
      skip: 'true',
      deploy: 'true',
      tag: existing,
      version: existing.slice(1),
    });
    return;
  }

  const commits = tags.length > 0 ? commitsSince('HEAD', tags) : [];
  if (isNonDeployOnly(commits)) {
    console.log(
      '::notice::docs / ci 커밋만 변경 — canary 발행 / sandbox 배포 생략',
    );
    emit({ skip: 'true', deploy: 'false', tag: '' });
    return;
  }

  const version = formatVersion(nextCanaryVersion(stables, canaries));
  const previousTag =
    canaries.length > 0
      ? canaries[canaries.length - 1].tag
      : stables.at(-1)?.tag;
  const notes =
    tags.length > 0
      ? renderNotes(commits, {
          repoUrl: repoUrl(),
          previousTag,
          currentTag: `v${version}`,
        })
      : INITIAL_NOTES;
  emit({
    skip: 'false',
    deploy: 'true',
    version,
    tag: `v${version}`,
    notes_file: writeNotes(`v${version}`, notes),
  });
}

function cmdStable(args) {
  const kind = argValue(args, '--bump', 'patch');
  const mainRef = argValue(args, '--main', 'origin/main');
  const { stables, canaries } = classifyTags(listTags());

  const base = argValue(args, '--base', canaries.at(-1)?.tag);
  if (!base)
    throw new Error(
      '릴리스할 canary 가 없음 — develop 에 sandbox 배포(pre-release)가 먼저 있어야 함',
    );

  // 재실행 멱등성: base 가 이미 최신 stable 에 포함 = 앞선 실행이 태그 / main push 까지 끝냄.
  // 다시 진행하면 같은 코드로 다음 버전을 또 발행하므로 중단한다.
  const released = alreadyReleasedIn(base, stables, isAncestor);
  if (released) {
    console.log(
      `::warning::${base} 는 이미 ${released} 에 포함 — 중복 릴리스 생략. GitHub Release 가 없으면 ${released} 로 수동 생성, 배포가 안 됐으면 Actions → Deploy (reusable) 로 ${released} 배포`,
    );
    emit({ skip: 'true' });
    return;
  }

  // main 에만 있는 핫픽스 커밋이 base 에 없으면 force push 로 유실된다 → 차단.
  const orphan = mainOnlyCommits(mainRef, base);
  if (orphan.length > 0) {
    const list = orphan
      .map((c) => `  ${c.sha.slice(0, 7)} ${c.subject}`)
      .join('\n');
    if (hasFlag(args, '--skip-main-check')) {
      console.log(
        `::warning::main 전용 커밋 검사 생략 — 아래 커밋은 force push 로 main 에서 사라진다:%0A${list.replaceAll('\n', '%0A')}`,
      );
    } else {
      throw new Error(
        `main 에만 있는 커밋이 ${base} 에 없음:\n${list}\n` +
          `① 역머지가 아직이면 main → develop 역머지 후 재실행. ` +
          `② 역머지는 끝났는데 막히면 최신 canary 가 역머지 이전 커밋이다 — Sandbox Release 를 develop 에서 수동 실행해 새 canary 를 만든 뒤 재실행. ` +
          `skip_main_check 는 위 커밋(핫픽스)을 main / prod 에서 지우므로 유실돼도 되는 커밋일 때만.`,
      );
    }
  }

  if (
    stables.length > 0 &&
    isNonDeployOnly(
      commitsSince(
        base,
        stables.map((s) => s.tag),
      ),
    )
  ) {
    console.log(
      `::notice::${base} 까지 docs / ci 커밋만 변경 — prod release 생략`,
    );
    emit({ skip: 'true' });
    return;
  }

  const version = formatVersion(bump(latestStableVersion(stables), kind));
  const notes =
    stables.length > 0
      ? renderNotes(
          commitsSince(
            base,
            stables.map((s) => s.tag),
          ),
          {
            repoUrl: repoUrl(),
            previousTag: stables.at(-1)?.tag,
            currentTag: `v${version}`,
          },
        )
      : INITIAL_NOTES;
  emit({
    skip: 'false',
    version,
    tag: `v${version}`,
    base,
    base_sha: git('rev-parse', `${base}^{commit}`),
    // base 이하 canary 만 정리 — base 보다 새 canary(아직 미릴리스, sandbox 가 돌리는 것)는 남긴다
    canary_tags: canariesUpTo(canaries, base)
      .map((c) => c.tag)
      .join(' '),
    notes_file: writeNotes(`v${version}`, notes),
  });
}

function cmdHotfix() {
  const tags = listTags();
  const { stables, canaries } = classifyTags(tags);
  const headTags = git('tag', '--points-at', 'HEAD')
    .split('\n')
    .filter(Boolean);
  if (headTags.some((t) => STABLE_RE.test(t))) {
    emit({ skip: 'true' });
    return;
  }

  const hotfix = bump(latestStableVersion(stables), 'patch');
  const version = formatVersion(hotfix);
  const notes =
    stables.length > 0
      ? renderNotes(
          commitsSince(
            'HEAD',
            stables.map((s) => s.tag),
          ),
          {
            repoUrl: repoUrl(),
            previousTag: stables.at(-1)?.tag,
            currentTag: `v${version}`,
          },
        )
      : INITIAL_NOTES;

  // 진행 중 canary(X.Y.Z-canary.N) 는 핫픽스 X.Y.Z 와 충돌 → 최신 1개만 핫픽스 다음 버전으로 재태깅.
  const latestCanary = canaries.at(-1);
  emit({
    skip: 'false',
    version,
    tag: `v${version}`,
    notes_file: writeNotes(`v${version}`, notes),
    canary_latest: latestCanary?.tag ?? '',
    canary_retag: latestCanary
      ? `v${formatVersion({ ...bump(hotfix, 'patch'), canary: 1 })}`
      : '',
    canary_tags: canaries.map((c) => c.tag).join(' '),
  });
}

// 모노레포 앱 전체(apps/*/package.json)에 같은 버전 기록 — 앱은 같은 태그로 함께 릴리스된다.
export function appPackageFiles(root = 'apps') {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(root, d.name, 'package.json'))
    .filter((file) => existsSync(file))
    .sort();
}

function cmdSetVersion(args) {
  const version = args[0];
  if (!/^\d+\.\d+\.\d+$/.test(version ?? ''))
    throw new Error(`invalid version: ${version}`);
  const files = appPackageFiles();
  if (files.length === 0) throw new Error('apps/*/package.json 없음');
  for (const file of files) {
    const { name, ...rest } = JSON.parse(readFileSync(file, 'utf8'));
    delete rest.version;
    writeFileSync(
      file,
      `${JSON.stringify({ name, version, ...rest }, null, 2)}\n`,
    );
  }
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const commands = {
    canary: cmdCanary,
    stable: cmdStable,
    hotfix: cmdHotfix,
    'set-version': cmdSetVersion,
  };
  const run = commands[cmd];
  if (!run)
    throw new Error(`usage: release.mjs <${Object.keys(commands).join('|')}>`);
  run(args);
}

if (isMainModule(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}
