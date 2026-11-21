#!/usr/bin/env node
// PR 본문의 커밋 목록 블록 자동 갱신 (pr-automation.yml).
//
// usage: node pr-body.mjs <commits.json> <body.md>  → 갱신된 본문을 stdout
//        node pr-body.mjs title <commits.json>       → 바꿀 PR 제목 (없으면 빈 출력, env PR_TITLE / HEAD_REF)
//   commits.json = `gh api --paginate --slurp repos/{repo}/pulls/{n}/commits` (페이지 배열의 배열)
//   본문의 COMMITS_START ~ COMMITS_END 마커 사이만 교체. 마커 없으면 Changes / 변경 내용 섹션을 교체,
//   그 섹션도 없으면 본문 맨 앞에 블록 추가.
//   커밋 = conventional type 별 분류, 각 줄에 PR 커밋 탭 링크.
//   `경로.md` 표기 = head 커밋 고정 blob 링크로 변환 (linkifyMdPaths, env REPO_URL / HEAD_SHA).
//   "Why PR?" 체크박스 = 커밋 type 에 해당하는 항목 체크 (WHY_BOXES).
//   "# What is this PR?" 위에 붙은 텍스트(단일 커밋 PR 의 커밋 본문) = 헤딩 아래로 이동 (moveLeadingSummary).

import { readFileSync } from 'node:fs';

import {
  isMainModule,
  isReleaseCommit,
  NON_DEPLOY_TYPES,
  parseCommit,
  renderNotes,
} from './release.mjs';

export const COMMITS_START =
  '<!-- commits:start (자동 생성 — 이 블록은 push 마다 덮어씀) -->';
export const COMMITS_END = '<!-- commits:end -->';

export function toCommits(pages) {
  return pages
    .flat()
    .filter((c) => (c.parents ?? []).length < 2)
    .map((c) => {
      const [subject, ...rest] = c.commit.message.split('\n');
      return {
        sha: c.sha,
        subject,
        body: rest.join('\n'),
        author: c.commit.author?.name ?? '',
      };
    });
}

export function renderCommitBlock(commits, prUrl) {
  const notes = renderNotes(commits, {
    repoUrl: null,
    previousTag: null,
    commitUrl: prUrl ? (sha) => `${prUrl}/commits/${sha}` : undefined,
  });
  // 릴리스 노트의 h3 를 PR 본문 계층(## 변경 내용 아래)에 맞춰 h4 로 내림
  const body = notes.replace(/^### /gm, '#### ').trimEnd();
  return `${COMMITS_START}\n**커밋 ${commits.length}개**\n\n${body}\n${COMMITS_END}`;
}

// 마커 유실 대비: 단일 커밋 PR 은 GitHub 가 본문을 커밋 메시지로 채워 템플릿 주석(마커)이 빠진다.
const CHANGES_HEADING_RE = /^## (?:Changes|변경 내용)[ \t]*$/m;

function replaceChangesSection(body, block) {
  const heading = CHANGES_HEADING_RE.exec(body);
  if (!heading) return null;
  const sectionStart = heading.index + heading[0].length;
  const next = body.slice(sectionStart).search(/^## /m);
  const rest = next === -1 ? '' : body.slice(sectionStart + next);
  return `${body.slice(0, sectionStart)}\n\n${block}\n${rest ? `\n${rest}` : ''}`;
}

export function upsertCommitBlock(prBody, block) {
  const body = prBody ?? '';
  const start = body.indexOf(COMMITS_START.slice(0, 20));
  const end = body.indexOf(COMMITS_END);
  if (start >= 0 && end > start) {
    const heading = CHANGES_HEADING_RE.exec(body);
    // 이전 버전이 본문 맨 앞에 붙인 블록 → Changes 섹션으로 이동
    if (heading && start < heading.index) {
      const stripped =
        `${body.slice(0, start)}${body.slice(end + COMMITS_END.length)}`.replace(
          /^\s+/,
          '',
        );
      return replaceChangesSection(stripped, block);
    }
    return `${body.slice(0, start)}${block}${body.slice(end + COMMITS_END.length)}`;
  }
  return (
    replaceChangesSection(body, block) ?? `${block}\n\n${body}`.trimEnd() + '\n'
  );
}

// 단일 커밋 PR: GitHub 가 커밋 본문(제목 다음 줄부터)을 템플릿 위에 채운다 → "# What is this PR?" 아래로 이동.
// 헤딩 직후 템플릿 가이드 주석(<!-- -->) 다음에 넣는다. 앞에 붙은 커밋 블록은 upsertCommitBlock 담당이라 건드리지 않음.
const WHAT_HEADING_RE = /^# What is this PR\?[ \t]*\r?$/m;

export function moveLeadingSummary(prBody) {
  const heading = WHAT_HEADING_RE.exec(prBody);
  if (!heading) return prBody;
  const leading = prBody.slice(0, heading.index).trim();
  if (!leading || leading.includes(COMMITS_START.slice(0, 20))) return prBody;
  const afterHeading = prBody.slice(heading.index + heading[0].length);
  const guide = /^(?:\s*<!--[\s\S]*?-->)*/.exec(afterHeading)[0];
  const rest = afterHeading.slice(guide.length).replace(/^\s+/, '');
  return `${heading[0]}${guide}\n\n${leading}\n${rest ? `\n${rest}` : ''}`;
}

// "Why PR?" 체크박스 (PR 템플릿) — 커밋 conventional type 에 해당하는 항목을 체크만 한다 (해제 X).
// 템플릿에 해당 줄이 없으면 변화 없음.
export const WHY_BOXES = [
  ['새로운 기능 추가', (c) => c.type === 'feat'],
  ['리팩토링', (c) => c.type === 'refactor' || c.type === 'perf'],
  ['버그 수정', (c) => c.type === 'fix'],
  ['문서 수정', (c) => c.type === 'docs'],
  [
    '빌드 부분 패키지 매니저 수정 및 라이브러리 업데이트',
    (c) => c.type === 'build' || c.type === 'ci',
  ],
  ['코드 스타일 수정', (c) => c.type === 'style'],
  ['테스트 추가', (c) => c.type === 'test'],
  ['UI 수정', (c) => c.scope === 'ui'],
];

export function checkWhyBoxes(prBody, commits) {
  const parsed = commits
    .filter((c) => !isReleaseCommit(c.subject))
    .map(parseCommit);
  const wanted = WHY_BOXES.filter(([, match]) => parsed.some(match)).map(
    ([label]) => label,
  );
  return prBody.replace(
    /^([-*] )\[ \]( (.+))$/gm,
    (line, bullet, rest, label) =>
      wanted.some((w) => label.trim().startsWith(w))
        ? `${bullet}[x]${rest}`
        : line,
  );
}

// 본문의 `repo/상대/경로.md` (backtick) → head 커밋 고정 blob 링크 (PR 본문은 상대 경로 링크 미해석).
// 브랜치 링크는 머지 후 브랜치 삭제 시 깨지므로 sha 고정. 재실행 시 기존 링크의 sha 만 갱신.
// 코드 펜스 내부와 <id> 같은 placeholder 경로는 건드리지 않는다.
const MD_PATH = String.raw`[\w.-]+(?:/[\w.-]+)*\.md`;

export function linkifyMdPaths(prBody, repoUrl, ref) {
  if (!repoUrl || !ref) return prBody;
  const base = repoUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const linked = new RegExp(
    String.raw`\[\`(${MD_PATH})\`\]\(${base}/blob/[^/)\s]+/\1\)`,
    'g',
  );
  const bare = new RegExp(String.raw`(?<!\[)\`(${MD_PATH})\`(?!\]\()`, 'g');
  const link = (_, path) => `[\`${path}\`](${repoUrl}/blob/${ref}/${path})`;
  return prBody
    .split(/(^```[\s\S]*?^```)/m)
    .map((part, i) =>
      i % 2 === 1 ? part : part.replace(linked, link).replace(bare, link),
    )
    .join('');
}

// PR 제목 자동 관리: "<첫 커밋 제목> +<나머지 커밋 수>" (단일 커밋이면 접미사 없음).
// 사람이 직접 쓴 제목은 덮어쓰지 않는다 — 아래 경우만 자동 관리 대상으로 본다.
//   - 현재 제목이 PR 커밋 중 하나의 제목 (+N 접미사 유무 무관) — 이전 자동 제목 / GitHub 단일 커밋 기본값
//   - GitHub 다중 커밋 기본값 = 브랜치명 변환 (`ci/261121_001-foo` → `Ci/261121 001 foo`)
export function branchDefaultTitle(headRef) {
  const t = (headRef ?? '').replace(/[-_]/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// 대표 커밋 = docs / ci 가 아닌 첫 커밋 (없으면 첫 커밋).
// squash-merge 시 제목 type 이 머지 커밋 type 이 되는데, docs / ci 면 릴리스 · 배포가 생략되므로
// 코드 커밋이 하나라도 있으면 그 type 이 제목에 오도록 한다.
export function representativeCommit(commits) {
  return (
    commits.find((c) => !NON_DEPLOY_TYPES.has(parseCommit(c).type)) ??
    commits[0]
  );
}

export function autoTitle(commits) {
  if (commits.length === 0) return null;
  const extra = commits.length - 1;
  return `${representativeCommit(commits).subject}${extra > 0 ? ` +${extra}` : ''}`;
}

export function nextTitle(currentTitle, commits, headRef) {
  const next = autoTitle(commits);
  if (!next || currentTitle === next) return null;
  const base = currentTitle.replace(/ \+\d+$/, '');
  const managed =
    commits.some((c) => c.subject === base) ||
    currentTitle.toLowerCase() === branchDefaultTitle(headRef).toLowerCase();
  return managed ? next : null;
}

function mainTitle(commitsFile) {
  const commits = toCommits(JSON.parse(readFileSync(commitsFile, 'utf8')));
  const next = nextTitle(
    process.env.PR_TITLE ?? '',
    commits,
    process.env.HEAD_REF ?? '',
  );
  process.stdout.write(next ?? '');
}

function main() {
  if (process.argv[2] === 'title') {
    if (!process.argv[3])
      throw new Error('usage: pr-body.mjs title <commits.json>');
    mainTitle(process.argv[3]);
    return;
  }
  const [commitsFile, bodyFile] = process.argv.slice(2);
  if (!commitsFile || !bodyFile)
    throw new Error('usage: pr-body.mjs <commits.json> <body.md>');
  const commits = toCommits(JSON.parse(readFileSync(commitsFile, 'utf8')));
  const prUrl = process.env.PR_URL || null;
  const body = moveLeadingSummary(
    upsertCommitBlock(
      readFileSync(bodyFile, 'utf8'),
      renderCommitBlock(commits, prUrl),
    ),
  );
  const repoUrl = process.env.REPO_URL || null;
  const headSha = process.env.HEAD_SHA || null;
  process.stdout.write(
    linkifyMdPaths(checkWhyBoxes(body, commits), repoUrl, headSha),
  );
}

if (isMainModule(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}
