// scripts/agent-work.mjs CLI — 임시 git 저장소에서 실제 명령으로 검증
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'agent-work-'));
  for (const p of [
    'scripts/agent-work.mjs',
    '.github/scripts/ship-gate.mjs',
    'agent-work/_templates',
    'docs/adr/_template.md',
  ])
    cpSync(join(REPO, p), join(dir, p), { recursive: true });
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 't');
  git('add', '.');
  git('commit', '-qm', 'chore: init');
  const run = (...args) => {
    try {
      return {
        code: 0,
        out: execFileSync('node', ['scripts/agent-work.mjs', ...args], {
          cwd: dir,
          encoding: 'utf8',
        }),
      };
    } catch (err) {
      return { code: err.status, out: `${err.stdout}${err.stderr}` };
    }
  };
  const write = (p, text) => {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), text);
  };
  return { dir, git, run, write };
}

const DONE_TASK = (adr) =>
  `---\nid: 261121_001_a\nstatus: done\nreview: passed (2026-11-21, rounds 1)\nadr: ${adr}\nspec: none — 사양 영향 없음\n---\n## 최종 사양\n- a\n\n## 예외 케이스\n- 없음 (finding 0)\n\n## 결정\n- ADR\n\n## 검증\n- ok\n`;

describe('agent-work.mjs', () => {
  const dirs = [];
  after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

  it('task:new creates a task (epic README for epics, none for misc)', () => {
    const t = setup();
    dirs.push(t.dir);
    assert.equal(t.run('new', '2611-auth', 'login').code, 0);
    assert.ok(existsSync(join(t.dir, 'agent-work/2611-auth/README.md')));
    const [file] = readdirSync(join(t.dir, 'agent-work/2611-auth/pending'));
    assert.match(file, /^\d{6}_001_login\.md$/);
    assert.match(
      readFileSync(join(t.dir, 'agent-work/2611-auth/pending', file), 'utf8'),
      /^id: \d{6}_001_login$/m,
    );

    assert.equal(t.run('new', 'misc', 'typo').code, 0);
    assert.ok(!existsSync(join(t.dir, 'agent-work/misc/README.md')));
    assert.match(
      readdirSync(join(t.dir, 'agent-work/misc/pending'))[0],
      /_002_typo\.md$/,
    );
  });

  it('task:status lists open manual-tasks even with no open task', () => {
    const t = setup();
    dirs.push(t.dir);
    t.write(
      'agent-work/manual-task/261121_001_dns.md',
      '---\nid: 261121_001_dns\nstatus: pending\n---\n# dns\n',
    );
    const r = t.run('status');
    assert.equal(r.code, 0);
    assert.match(
      r.out,
      /manual {3}agent-work\/manual-task\/261121_001_dns\.md {2}status=pending/,
    );
    assert.doesNotMatch(r.out, /열린 작업 없음/);
  });

  it('ship:check judges the staged tree like CI (unstaged ADR = missing)', () => {
    const t = setup();
    dirs.push(t.dir);
    assert.equal(t.run('adr', 'cache').code, 0); // docs/adr/0001-cache.md, untracked
    t.write('agent-work/misc/done/261121_001_a.md', DONE_TASK('0001'));
    t.git('add', 'agent-work');

    const staged = t.run('check');
    assert.equal(staged.code, 1, staged.out);
    assert.match(staged.out, /ADR 파일 없음: docs\/adr\/0001-\*\.md/);
    assert.match(staged.out, /stage 안 된 관련 파일/);

    assert.equal(t.run('check', '--worktree').code, 0); // 디스크 기준이면 통과
    t.git('add', 'docs');
    const ok = t.run('check');
    assert.equal(ok.code, 0, ok.out);
  });

  it('ship:check fails when a done task exists but is not staged', () => {
    const t = setup();
    dirs.push(t.dir);
    t.write(
      'agent-work/misc/done/261121_001_a.md',
      DONE_TASK('none — 결정 없음'),
    );
    const r = t.run('check');
    assert.equal(r.code, 1);
    assert.match(
      r.out,
      /stage 안 된 done task: agent-work\/misc\/done\/261121_001_a\.md/,
    );
  });

  it('ship:check sees Korean file names (no git path quoting)', () => {
    const t = setup();
    dirs.push(t.dir);
    t.write(
      'agent-work/misc/done/261121_001_로그인.md',
      '---\nstatus: progress\n---\n',
    );
    t.git('add', 'agent-work');
    const r = t.run('check');
    assert.equal(r.code, 1);
    assert.match(r.out, /261121_001_로그인\.md/);
  });

  it('adr:new numbers sequentially', () => {
    const t = setup();
    dirs.push(t.dir);
    t.run('adr', 'one');
    t.run('adr', 'two');
    assert.deepEqual(
      readdirSync(join(t.dir, 'docs/adr'))
        .filter((f) => /^\d{4}-/.test(f))
        .sort(),
      ['0001-one.md', '0002-two.md'],
    );
  });
});
