import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  auditCommit,
  auditMergeResult,
  isCodePath,
  isTestPath,
  parseFooters,
  parseNameStatus,
  rangeFromEvent,
  renderSummary,
} from './commit-audit.mjs';
import { memoryView } from './ship-gate.mjs';

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  'commit-audit.mjs',
);
const c = (subject, body = '', parents = ['p']) => ({
  sha: 'a'.repeat(40),
  subject,
  body,
  parents,
});
const A = (path) => ({ status: 'A', path });
const M = (path) => ({ status: 'M', path });

describe('paths', () => {
  it('classifies code vs test paths', () => {
    assert.ok(isCodePath('apps/api/src/modules/x/x.service.ts'));
    assert.ok(isCodePath('packages/ui/src/components/button.tsx'));
    assert.ok(!isCodePath('packages/config/eslint/next.mjs'));
    assert.ok(!isCodePath('docs/specs/modules/x.md'));
    assert.ok(!isCodePath('apps/api/src/modules/otel/README.md'));
    assert.ok(isTestPath('apps/api/src/x.service.spec.ts'));
    assert.ok(isTestPath('apps/api/test/app.e2e-spec.ts'));
    assert.ok(isTestPath('apps/web/src/app/__tests__/page.test.tsx'));
  });
});

describe('parseFooters / parseNameStatus', () => {
  it('reads Refs / Spec / ADR footers', () => {
    const f = parseFooters(
      '본문\n\nRefs: 261121_001, 261121_002\nSpec: docs/specs/modules/a.md\nADR: 0003',
    );
    assert.deepEqual(f.refs, ['261121_001', '261121_002']);
    assert.equal(f.spec, 'docs/specs/modules/a.md');
    assert.equal(f.adr, '0003');
    // 본문 문장(소문자 key)은 footer 가 아니다 · squash 커밋의 footer 는 전부 모은다
    const g = parseFooters('spec: this note\nADR: 0001\n\n* fix\n\nADR: 0002');
    assert.deepEqual(g.specs, []);
    assert.deepEqual(g.adrs, ['0001', '0002']);
  });

  it('parses rename lines', () => {
    assert.deepEqual(
      parseNameStatus(
        'M\ta.ts\nR100\tagent-work/e/progress/x.md\tagent-work/e/done/x.md\n',
      ),
      [
        { status: 'M', path: 'a.ts' },
        {
          status: 'R',
          from: 'agent-work/e/progress/x.md',
          path: 'agent-work/e/done/x.md',
        },
      ],
    );
  });
});

describe('auditCommit', () => {
  const view = memoryView({});

  it('errors on non-conventional subject', () => {
    const r = auditCommit(c('update stuff'), [], view);
    assert.equal(r.errors.length, 1);
  });

  it('skips merge and release commits', () => {
    assert.ok(
      auditCommit(c('Merge branch x', '', ['a', 'b']), [], view).skipped,
    );
    assert.ok(
      auditCommit(
        c('chore(release): v1.0.0 [skip ci]'),
        [M('apps/api/package.json')],
        view,
      ).skipped,
    );
  });

  it('warns when a code commit lacks Refs / task / spec', () => {
    const r = auditCommit(
      c('feat(auth): add login'),
      [A('apps/api/src/modules/auth/auth.service.ts')],
      view,
    );
    assert.deepEqual(r.errors, []);
    assert.equal(r.warnings.length, 3);
  });

  it("warns when a spec's code changes without that spec in the commit", () => {
    const v = memoryView({
      'docs/specs/modules/auth.md':
        '---\ncode: [apps/api/src/modules/auth]\n---\n',
    });
    const files = [
      M('apps/api/src/modules/auth/auth.service.ts'),
      M('agent-work/misc/progress/261121_001_x.md'),
    ];
    const stale = auditCommit(
      c('fix(auth): x', 'Refs: 261121_001_x'),
      files,
      v,
    );
    assert.ok(
      stale.warnings.some((w) =>
        w.startsWith('사양 미갱신: docs/specs/modules/auth.md'),
      ),
    );
    const declared = auditCommit(
      c('fix(auth): x', 'Refs: 261121_001_x\nSpec: none'),
      files,
      v,
    );
    assert.ok(!declared.warnings.some((w) => w.startsWith('사양 미갱신')));
  });

  it('accepts Spec: pending on intermediate commits', () => {
    const r = auditCommit(
      c('feat(auth): add login', 'Refs: 261121_001\nSpec: pending'),
      [
        A('apps/api/src/modules/auth/auth.service.ts'),
        M('agent-work/2611-auth/progress/261121_001_login.md'),
      ],
      view,
    );
    assert.deepEqual(r.warnings, []);
  });

  it('does not require spec for test-only or docs commits', () => {
    assert.deepEqual(
      auditCommit(
        c('test(auth): cover login'),
        [A('apps/api/src/auth.service.spec.ts')],
        view,
      ).warnings,
      [],
    );
    assert.deepEqual(
      auditCommit(c('docs: fix typo'), [M('README.md')], view).warnings,
      [],
    );
  });

  it('errors when footers point at missing files or are malformed', () => {
    const r = auditCommit(
      c('docs(spec): sync', 'Spec: docs/specs/modules/nope.md\nADR: 0042'),
      [],
      view,
    );
    assert.equal(r.errors.length, 2);
    const bad = auditCommit(
      c('docs(spec): sync', 'Spec: package.json\nADR: TBD'),
      [],
      memoryView({ 'package.json': '{}' }),
    );
    assert.ok(
      bad.errors.some((e) => e.startsWith('Spec footer 는 docs/specs')),
    );
    assert.ok(bad.errors.some((e) => e.startsWith('ADR footer 형식')));
  });

  it('runs the ship gate on tasks moved into done/', () => {
    const r = auditCommit(
      c('feat(auth): add login', 'Refs: 261121_001_login\nSpec: none'),
      [
        A('apps/api/src/modules/auth/auth.service.ts'),
        {
          status: 'R',
          from: 'agent-work/2611-auth/progress/261121_001_login.md',
          path: 'agent-work/2611-auth/done/261121_001_login.md',
        },
      ],
      memoryView({
        'agent-work/2611-auth/done/261121_001_login.md':
          '---\nstatus: done\n---\n',
      }),
    );
    assert.deepEqual(r.ship, ['agent-work/2611-auth/done/261121_001_login.md']);
    assert.ok(r.errors.some((e) => e.includes('review')));
  });

  it('gates tasks that skip done/ straight into archive, not a plain archive move', () => {
    const archived = 'agent-work/archive/2611-auth/done/261121_001_login.md';
    const files = (from) => [{ status: 'R', from, path: archived }];
    const v = memoryView({ [archived]: '---\nstatus: pending\n---\n' });
    const msg = 'chore(agent-work): archive 2611-auth';
    assert.deepEqual(
      auditCommit(
        c(msg),
        files('agent-work/2611-auth/pending/261121_001_login.md'),
        v,
      ).ship,
      [archived],
    );
    assert.deepEqual(
      auditCommit(
        c(msg),
        files('agent-work/2611-auth/done/261121_001_login.md'),
        v,
      ).ship,
      [],
    );
  });
});

describe('rangeFromEvent', () => {
  it('pull_request uses base..head', () => {
    assert.deepEqual(
      rangeFromEvent(
        'pull_request',
        { pull_request: { base: { sha: 'b' }, head: { sha: 'h' } } },
        'main',
      ),
      { range: 'b..h', pr: true },
    );
  });

  it('push with before uses before..after', () => {
    assert.deepEqual(
      rangeFromEvent(
        'push',
        { before: 'b1', after: 'a1', ref: 'refs/heads/x' },
        'main',
      ),
      {
        range: 'b1..a1',
        fallback: 'a1',
      },
    );
  });

  it('first push of default branch audits only the head', () => {
    assert.deepEqual(
      rangeFromEvent(
        'push',
        { before: '0000000', after: 'a1', ref: 'refs/heads/main' },
        'main',
      ),
      {
        single: 'a1',
      },
    );
  });
});

describe('renderSummary', () => {
  it('renders a row per commit with verdict', () => {
    const out = renderSummary(
      [
        {
          sha: 'abcdef1234',
          subject: 'feat: a | b',
          refs: [],
          spec: null,
          adr: null,
          ship: [],
          errors: [],
          warnings: ['w'],
          skipped: false,
        },
      ],
      { strict: false, repoUrl: null },
    );
    assert.match(out, /\| abcdef1 \| feat: a \\\| b \|/);
    assert.match(out, /⚠️ \|$/m);
  });
});

describe('cli (real git repo)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'commit-audit-'));
  after(() => rmSync(dir, { recursive: true, force: true }));
  const sh = (...args) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  const write = (path, text) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  const run = (...args) => {
    try {
      return {
        code: 0,
        out: execFileSync('node', [SCRIPT, ...args], {
          cwd: dir,
          encoding: 'utf8',
          env: { ...process.env, GITHUB_STEP_SUMMARY: '' },
        }),
      };
    } catch (err) {
      return { code: err.status, out: `${err.stdout}${err.stderr}` };
    }
  };

  sh('init', '-q', '-b', 'main');
  sh('config', 'user.email', 't@example.com');
  sh('config', 'user.name', 't');

  it('passes a clean ship commit and fails a broken one', () => {
    write('README.md', '# r\n');
    sh('add', '.');
    sh('commit', '-qm', 'chore: init');

    write('apps/api/src/a.ts', 'export const a = 1;\n');
    write('docs/adr/0001-x.md', '# x\n');
    write(
      'docs/specs/modules/a.md',
      '---\nentity: module\nupdated: 2026-11-21\nrefs: 261121_001_a\n---\n# a\n',
    );
    write(
      'agent-work/misc/done/261121_001_a.md',
      '---\nid: 261121_001_a\nstatus: done\nreview: passed\nadr: 0001\nspec: [docs/specs/modules/a.md]\n---\n## 최종 사양\n- a\n\n## 예외 케이스\n- 없음\n\n## 결정\n- ADR-0001\n\n## 검증\n- ok\n',
    );
    sh('add', '.');
    sh(
      'commit',
      '-qm',
      'feat(a): add a',
      '-m',
      'Refs: 261121_001_a\nSpec: docs/specs/modules/a.md\nADR: 0001',
    );
    const ok = run('--sha', 'HEAD');
    assert.equal(ok.code, 0, ok.out);

    write(
      'agent-work/misc/done/261121_002_b.md',
      '---\nid: 261121_002_b\nstatus: done\nreview: pending\n---\n',
    );
    sh('add', '.');
    sh('commit', '-qm', 'feat(b): add b', '-m', 'Refs: 261121_002_b');
    const bad = run('--range', 'HEAD~2..HEAD');
    assert.equal(bad.code, 1);
    assert.match(bad.out, /review: passed 아님/);
  });
});

describe('review round 1 regressions', () => {
  const view = memoryView({});

  it('errors when a docs/ci typed commit changes code', () => {
    const r = auditCommit(
      c('docs(spec): draft api spec +1 (#12)'),
      [A('apps/api/src/a.ts'), A('docs/specs/modules/a.md')],
      view,
    );
    assert.ok(
      r.errors.some((e) => e.startsWith('docs type 커밋이 배포 산출물')),
    );
  });

  it('only skips release commits that touch nothing but app versions', () => {
    assert.ok(
      auditCommit(
        c('chore(release): v1.0.0 [skip ci]'),
        [M('apps/api/package.json')],
        view,
      ).skipped,
    );
    const sneaky = auditCommit(
      c('chore(release): tidy'),
      [A('agent-work/misc/done/261121_001_x.md')],
      memoryView({
        'agent-work/misc/done/261121_001_x.md':
          '---\nstatus: done\nreview: pending\n---\n',
      }),
    );
    assert.equal(sneaky.skipped, false);
    assert.ok(sneaky.errors.some((e) => e.includes('review')));
  });

  it('skips the root commit and non-merge back-merge subjects are audited', () => {
    assert.equal(
      auditCommit(c('Initial commit', '', []), [A('README.md')], view)
        .skipReason,
      'root',
    );
    assert.equal(
      auditCommit(
        c('chore: back-merge v1.0.1 into develop'),
        [M('README.md')],
        view,
      ).skipped,
      false,
    );
  });

  it('accepts git default revert subjects', () => {
    for (const subject of [
      'Revert "feat(auth): add login"',
      'Revert "feat(auth): add login (#12)" (#13)', // GitHub Revert PR 을 squash 머지
    ]) {
      const r = auditCommit(c(subject), [M('README.md')], view);
      assert.equal(r.type, 'revert', subject);
      assert.deepEqual(r.errors, [], subject);
    }
  });

  it('errors on duplicate ADR numbers when docs/adr changes', () => {
    const r = auditCommit(
      c('docs(adr): add cache decision'),
      [A('docs/adr/0004-cache.md')],
      memoryView({
        'docs/adr/0004-cache.md': '#',
        'docs/adr/0004-queue.md': '#',
      }),
    );
    assert.ok(r.errors.some((e) => e.startsWith('ADR 번호 중복: 0004')));
  });

  it('new branch push excludes other remote branches', () => {
    assert.deepEqual(
      rangeFromEvent(
        'push',
        { before: '0000000', after: 'a1', ref: 'refs/heads/feat/x' },
        'main',
      ),
      {
        newBranch: 'feat/x',
        after: 'a1',
      },
    );
  });
});

describe('review round 2 regressions', () => {
  const view = memoryView({});

  it('accepts git Reapply subjects', () => {
    assert.equal(
      auditCommit(c('Reapply "feat: b"'), [M('README.md')], view).type,
      'revert',
    );
  });

  it('errors when a ci/docs commit changes deploy outputs', () => {
    for (const path of [
      'docker/api.Dockerfile',
      'apps/api/package.json',
      'pnpm-lock.yaml',
      'apps/web/next.config.ts',
      'apps/web/public/logo.svg',
      'package.json',
      'apps/api/tsconfig.build.json',
    ]) {
      const r = auditCommit(c('ci: bump node'), [M(path)], view);
      assert.ok(
        r.errors.some((e) => e.startsWith('ci type 커밋이 배포 산출물')),
        path,
      );
    }
    assert.deepEqual(
      auditCommit(
        c('ci: tweak workflow'),
        [M('.github/workflows/ci.yml')],
        view,
      ).errors,
      [],
    );
    // 삭제도 배포 산출물 변경 · src 안 README 는 아님
    assert.equal(
      auditCommit(
        c('docs: drop'),
        [{ status: 'D', path: 'apps/api/src/a.ts' }],
        view,
      ).errors.length,
      1,
    );
    assert.deepEqual(
      auditCommit(
        c('docs(otel): fix typo'),
        [M('apps/api/src/modules/otel/README.md')],
        view,
      ).errors,
      [],
    );
  });

  it('flags duplicate ADR numbers in the PR merge result', () => {
    const r = auditMergeResult(
      memoryView({ 'docs/adr/0001-a.md': '#', 'docs/adr/0001-b.md': '#' }),
    );
    assert.equal(r.errors.length, 1);
    assert.equal(
      auditMergeResult(memoryView({ 'docs/adr/0001-a.md': '#' })).errors.length,
      0,
    );
  });
});

describe('cli: non-ASCII paths', () => {
  const dir = mkdtempSync(join(tmpdir(), 'commit-audit-utf8-'));
  after(() => rmSync(dir, { recursive: true, force: true }));
  const sh = (...args) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8' });

  it('audits Korean-named done tasks and finds Korean-named ADRs', () => {
    sh('init', '-q', '-b', 'main');
    sh('config', 'user.email', 't@example.com');
    sh('config', 'user.name', 't');
    writeFileSync(join(dir, 'README.md'), '# r\n');
    sh('add', '.');
    sh('commit', '-qm', 'chore: init');
    mkdirSync(join(dir, 'agent-work/e1/done'), { recursive: true });
    mkdirSync(join(dir, 'docs/adr'), { recursive: true });
    writeFileSync(join(dir, 'docs/adr/0001-캐시.md'), '# 캐시\n');
    writeFileSync(
      join(dir, 'agent-work/e1/done/261121_002_로그인.md'),
      '---\nstatus: progress\n---\n',
    );
    sh('add', '.');
    sh('commit', '-qm', 'docs(adr): add cache decision', '-m', 'ADR: 0001');
    let out = '';
    try {
      execFileSync('node', [SCRIPT, '--sha', 'HEAD'], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_STEP_SUMMARY: '' },
      });
    } catch (err) {
      out = `${err.stdout}${err.stderr}`;
    }
    assert.match(
      out,
      /\[ship agent-work\/e1\/done\/261121_002_로그인\.md\] status 가 done 아님/,
    );
    assert.doesNotMatch(out, /ADR footer 파일 없음/);
  });
});
