#!/usr/bin/env node
// agent-work 로컬 도구 — 의존성 없음. 규칙 본문 → .claude/rules/agent-work.md
//
//   pnpm task:new <epic|misc> <slug> [제목]   pending task 생성 (YYMMDD_NNN_slug.md). 새 에픽이면 README 도 생성
//   pnpm adr:new <slug> [제목]                 다음 번호 ADR 생성 (docs/adr/NNNN-slug.md)
//   pnpm task:status                           에픽별 pending / progress 목록 (세션 시작 스캔)
//   pnpm ship:check [--all] [--worktree]       출고 게이트 검증 — stage 된(또는 전체) done task.
//                                              기본 = git index 기준 (= 다음 커밋 = CI). --worktree = 디스크 기준
//
// CI 의 커밋 감사(.github/scripts/commit-audit.mjs)와 같은 검증기(ship-gate.mjs)를 쓴다.

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';

import {
  DONE_TASK_RE,
  duplicateAdrNumbers,
  isShipTarget,
  parseFrontmatter,
  validateShipTask,
} from '../.github/scripts/ship-gate.mjs';

function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    console.error('❌ git 저장소 안에서 실행해야 한다 (git init 먼저)');
    process.exit(1);
  }
}

const ROOT = repoRoot();
// 저장소 루트 기준 '/' 경로 (Windows 의 '\' 정규화 — 규칙 · 정규식은 '/' 기준)
const rel = (abs) => relative(ROOT, abs).split(sep).join('/');
const AW = join(ROOT, 'agent-work');
const ADR_DIR = join(ROOT, 'docs/adr');
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EPIC_RE = /^(misc|\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*)$/;

function git(args) {
  try {
    return execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

// 기본 = git index (stage 된 내용 = 다음 커밋 = CI 가 보는 tree). untracked / unstaged 는 없는 것으로 본다.
const indexView = {
  read: (p) => git(['show', `:${p}`]),
  exists: (p) => git(['cat-file', '-e', `:${p}`]) !== null,
  list: (dir) =>
    (git(['ls-files', '--', `${dir}/`]) ?? '')
      .split('\n')
      .filter(Boolean)
      .map((p) => p.slice(dir.length + 1))
      .filter((p) => !p.includes('/')),
};

// --worktree = 디스크 그대로 (stage 전 초안 점검용)
const fsView = {
  read: (p) => {
    const abs = join(ROOT, p);
    return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
  },
  exists: (p) => existsSync(join(ROOT, p)),
  list: (dir) => {
    const abs = join(ROOT, dir);
    return existsSync(abs) ? readdirSync(abs) : [];
  },
};

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return {
    iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    short: `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`,
  };
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (entry.name.endsWith('.md')) out.push(abs);
  }
  return out;
}

function fill(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

function nextSerial(short) {
  const serials = walk(AW)
    .map((f) => new RegExp(`^${short}_(\\d{3})_`).exec(basename(f)))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  return String(Math.max(0, ...serials) + 1).padStart(3, '0');
}

function cmdNew([epic, slug, ...titleParts]) {
  if (!epic || !slug)
    throw new Error('usage: task:new <epic|misc> <slug> [제목]');
  if (!EPIC_RE.test(epic))
    throw new Error(`에픽 이름 = misc 또는 YYMM-<slug>: ${epic}`);
  if (!SLUG_RE.test(slug)) throw new Error(`slug = kebab-case: ${slug}`);
  const { iso, short } = today();
  const id = `${short}_${nextSerial(short)}_${slug}`;
  const epicDir = join(AW, epic);
  const vars = {
    id,
    date: iso,
    task: slug,
    epic,
    title: titleParts.join(' ') || slug,
  };

  // misc = 에픽 미소속 공용 폴더 → README 없음
  if (epic !== 'misc' && !existsSync(join(epicDir, 'README.md'))) {
    mkdirSync(epicDir, { recursive: true });
    const tpl = readFileSync(join(AW, '_templates/epic.md'), 'utf8');
    writeFileSync(join(epicDir, 'README.md'), fill(tpl, vars));
    console.log(`+ ${relative(ROOT, join(epicDir, 'README.md'))}`);
  }
  const file = join(epicDir, 'pending', `${id}.md`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    fill(readFileSync(join(AW, '_templates/task.md'), 'utf8'), vars),
  );
  console.log(`+ ${relative(ROOT, file)}`);
}

function cmdAdr([slug, ...titleParts]) {
  if (!slug || !SLUG_RE.test(slug))
    throw new Error('usage: adr:new <kebab-slug> [제목]');
  const numbers = (existsSync(ADR_DIR) ? readdirSync(ADR_DIR) : [])
    .map((f) => /^(\d{4})-/.exec(f))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const number = String(Math.max(0, ...numbers) + 1).padStart(4, '0');
  const file = join(ADR_DIR, `${number}-${slug}.md`);
  const tpl = readFileSync(join(ADR_DIR, '_template.md'), 'utf8');
  writeFileSync(
    file,
    fill(tpl, {
      number,
      date: today().iso,
      title: titleParts.join(' ') || slug,
    }),
  );
  console.log(
    `+ ${relative(ROOT, file)}  (docs/adr/README.md 인덱스에 한 줄 추가)`,
  );
}

function cmdStatus() {
  const rows = walk(AW)
    .map(rel)
    .filter((p) =>
      /^agent-work\/(?!archive\/|_templates\/)[^/]+\/(pending|progress)\//.test(
        p,
      ),
    )
    .map((p) => {
      const fm = parseFrontmatter(readFileSync(join(ROOT, p), 'utf8'));
      return { p, status: p.split('/')[2], review: fm?.data.review ?? '-' };
    })
    .sort((a, b) =>
      a.status === b.status
        ? a.p.localeCompare(b.p)
        : a.status === 'progress'
          ? -1
          : 1,
    );
  const manual = walk(join(AW, 'manual-task'))
    .map((f) => ({ f, fm: parseFrontmatter(readFileSync(f, 'utf8')) }))
    .filter(({ fm }) => fm && fm.data.status !== 'done');
  if (rows.length === 0 && manual.length === 0)
    return console.log('열린 작업 없음');
  for (const r of rows)
    console.log(`${r.status.padEnd(8)} ${r.p}  review=${r.review}`);
  for (const { f, fm } of manual)
    console.log(`manual   ${relative(ROOT, f)}  status=${fm.data.status}`);
}

// porcelain: XY path  (X = index, Y = worktree). rename = "old -> new"
function statusEntries() {
  return (git(['status', '--porcelain=v1', '-uall']) ?? '')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [from, to] = l.slice(3).split(' -> ');
      return {
        x: l[0],
        y: l[1],
        path: to ?? from,
        from: to ? from : undefined,
      };
    });
}

function cmdCheck(args) {
  const worktree = args.includes('--worktree');
  const view = worktree ? fsView : indexView;
  const entries = statusEntries();
  const changed = entries.filter((e) =>
    worktree
      ? e.x !== 'D' && e.y !== 'D'
      : e.x !== ' ' && e.x !== '?' && e.x !== 'D',
  );
  const targets = args.includes('--all')
    ? (worktree
        ? walk(AW).map(rel)
        : (git(['ls-files', '--', 'agent-work/']) ?? '').split('\n')
      ).filter((p) => DONE_TASK_RE.test(p))
    : changed
        .filter((e) =>
          isShipTarget({
            status: e.x === '?' ? 'A' : e.x === ' ' ? e.y : e.x,
            path: e.path,
            from: e.from,
          }),
        )
        .map((e) => e.path);
  // ADR 번호 충돌은 CI 와 같이 error (다른 브랜치가 같은 번호를 먼저 씀)
  const dupAdr = duplicateAdrNumbers(view.list('docs/adr'));

  console.log(
    `기준: ${worktree ? 'working tree (--worktree)' : 'git index — stage 된 내용 = 다음 커밋 = CI'}`,
  );
  for (const dup of dupAdr) console.log(`❌ ADR 번호 중복: ${dup}`);
  if (dupAdr.length > 0 && targets.length === 0) process.exit(1);
  if (targets.length === 0) {
    const unstaged = entries.filter(
      (e) => DONE_TASK_RE.test(e.path) && (e.x === '?' || e.y !== ' '),
    );
    if (unstaged.length > 0 && !worktree) {
      // done task 가 있는데 stage 안 됨 = 이대로 커밋하면 CI 가 보는 것과 다르다 → 실패
      console.log(
        `❌ stage 안 된 done task: ${unstaged.map((e) => e.path).join(', ')} — git add 후 다시`,
      );
      process.exit(1);
    }
    console.log('검사할 done task 없음 (변경분 기준 — 전체는 --all)');
    return;
  }
  if (!worktree) {
    // 사양 / ADR / 스크린샷이 stage 안 됐으면 index 기준 검증이 "파일 없음" 으로 실패한다 → 원인 안내
    const pending = entries.filter(
      (e) =>
        (e.x === '?' || e.y !== ' ') &&
        /^(docs\/(specs|adr)|agent-work)\//.test(e.path),
    );
    if (pending.length > 0)
      console.log(
        `⚠️  stage 안 된 관련 파일 ${pending.length}개: ${pending.map((e) => e.path).join(', ')}`,
      );
  }
  let failed = dupAdr.length > 0;
  for (const path of targets) {
    const { errors, warnings } = validateShipTask(path, view);
    console.log(
      `${errors.length > 0 ? '❌' : warnings.length > 0 ? '⚠️ ' : '✅'} ${path}`,
    );
    for (const e of errors) console.log(`   error   ${e}`);
    for (const w of warnings) console.log(`   warning ${w}`);
    failed ||= errors.length > 0;
  }
  if (failed) process.exit(1);
}

const [cmd, ...rest] = process.argv.slice(2);
const commands = {
  new: cmdNew,
  adr: cmdAdr,
  status: cmdStatus,
  check: cmdCheck,
};
try {
  if (!commands[cmd])
    throw new Error(
      `usage: agent-work.mjs <${Object.keys(commands).join('|')}>`,
    );
  commands[cmd](rest);
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}
