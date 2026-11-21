// spec:shots 계획 ↔ CI 검증 계약 — 같은 입력에 같은 결과
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { memoryView, shotPlan, validateSpecDoc } from './ship-gate.mjs';
import { buildPlan } from './spec-pages.mjs';

const P = 'docs/specs/pages/login.md';
const fm = (lines) => `---\n${lines}\n---\n# x\n`;
const vps = (text, path = P) => shotPlan(path, text);

describe('shotPlan (shared by spec:shots and CI)', () => {
  it('defaults to desktop and dedupes / normalizes viewports', () => {
    assert.deepEqual(
      vps(fm('route: /login')).shots.map((s) => s.viewport),
      ['desktop'],
    );
    assert.deepEqual(
      vps(
        fm('route: /login\nscreenshots: [Desktop, desktop, mobile]   '),
      ).shots.map((s) => s.viewport),
      ['desktop', 'mobile'],
    );
  });

  it('treats none, [] and an empty block as "no screenshots" without error', () => {
    for (const v of [
      'screenshots: none',
      'screenshots: [none]',
      'screenshots: "NONE"',
      'screenshots: []',
      'screenshots:',
    ]) {
      const plan = vps(fm(`route: /login\n${v}`));
      assert.deepEqual(plan.errors, [], v);
      assert.deepEqual(plan.shots, [], v);
    }
  });

  it('reads zero-indent block lists and multi-line flow lists', () => {
    assert.deepEqual(
      vps(fm('route: /login\nscreenshots:\n- desktop\n- mobile')).shots.length,
      2,
    );
    assert.deepEqual(
      vps(
        fm('route: /login\nscreenshots:\n  [\n    desktop,\n    mobile,\n  ]'),
      ).shots.length,
      2,
    );
  });

  it('errors on missing route, unknown viewport, subfolder and BOM-only issues are tolerated', () => {
    assert.ok(
      vps(fm('title: x')).errors.some((e) => e.startsWith('route 없음')),
    );
    assert.ok(
      vps(fm('route: /users/[id]')).errors.some((e) =>
        e.startsWith('route 는 실제 URL'),
      ),
    );
    assert.ok(
      vps(fm('route: /login\nscreenshots: [tablet]')).errors.some((e) =>
        e.includes('"tablet"'),
      ),
    );
    assert.ok(
      vps(
        fm('route: /a'),
        'docs/specs/pages/settings/profile.md',
      ).errors[0].includes('바로 아래'),
    );
    assert.deepEqual(vps(`﻿${fm('route: /login')}`).errors, []);
  });

  it('CI requires exactly the files spec:shots writes', () => {
    const text = fm(
      'entity: page\nroute: /login\nscreenshots: [desktop, mobile]\nupdated: 2026-11-21\nrefs: x',
    );
    const plan = vps(text);
    const files = Object.fromEntries([
      [P, text],
      ...plan.shots.map((s) => [s.file, 'png']),
    ]);
    assert.deepEqual(validateSpecDoc(P, memoryView(files)).errors, []);
    delete files[plan.shots[1].file];
    assert.deepEqual(validateSpecDoc(P, memoryView(files)).errors, [
      `스크린샷 없음: ${plan.shots[1].file} (pnpm spec:shots)`,
    ]);
  });
});

describe('buildPlan', () => {
  const root = mkdtempSync(join(tmpdir(), 'spec-pages-'));
  after(() => rmSync(root, { recursive: true, force: true }));
  const write = (p, text) => {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), text);
  };

  it('collects top-level page specs, skips README / _templates, filters --only exactly', () => {
    write('docs/specs/pages/home.md', fm('route: /'));
    write('docs/specs/pages/settings.md', fm('route: /settings'));
    write(
      'docs/specs/pages/settings-profile.md',
      fm('route: /settings/profile'),
    );
    write('docs/specs/pages/README.md', '# index');
    write('docs/specs/pages/_draft.md', fm('title: x'));
    assert.deepEqual(
      buildPlan(root).pages.map((p) => p.slug),
      ['home', 'settings', 'settings-profile'],
    );
    assert.deepEqual(
      buildPlan(root, { only: ['settings'] }).pages.map((p) => p.slug),
      ['settings'],
    );
    assert.ok(buildPlan(root, { only: ['nope'] }).errors[0].includes('nope'));
  });

  it('plans component previews and picks specs affected by changed code (+ pages linking them)', () => {
    const r = mkdtempSync(join(tmpdir(), 'spec-pages-changed-'));
    const put = (p, text) => {
      mkdirSync(dirname(join(r, p)), { recursive: true });
      writeFileSync(join(r, p), text);
    };
    put(
      'docs/specs/components/button.md',
      fm(
        'route: /spec/components/button\ncode: [packages/ui/src/components/button.tsx]',
      ),
    );
    put(
      'docs/specs/pages/home.md',
      `${fm('route: /\ncode: [apps/web/src/app/page.tsx]')}- [Button](../components/button.md)\n`,
    );
    put(
      'docs/specs/pages/about.md',
      fm('route: /about\ncode: [apps/web/src/app/about]'),
    );
    const ids = (opts) => buildPlan(r, opts).pages.map((p) => p.id);
    assert.deepEqual(
      ids({ changed: ['packages/ui/src/components/button.tsx'] }),
      ['components/button', 'pages/home'],
    );
    assert.deepEqual(ids({ changed: ['apps/web/src/app/about/page.tsx'] }), [
      'pages/about',
    ]);
    assert.deepEqual(
      buildPlan(r).pages.find((p) => p.id === 'components/button').shots[0]
        .file,
      'docs/specs/components/assets/button.desktop.png',
    );
    // 미리보기 route 없는 component = 오류, screenshots: none 이면 허용
    put('docs/specs/components/toast.md', fm('code: [x]'));
    assert.ok(buildPlan(r).errors.some((e) => e.includes('toast.md')));
    put('docs/specs/components/toast.md', fm('code: [x]\nscreenshots: none'));
    assert.deepEqual(buildPlan(r).errors, []);
    rmSync(r, { recursive: true, force: true });
  });

  it('reports subfolder specs as errors instead of skipping them', () => {
    write('docs/specs/pages/admin/users.md', fm('route: /admin/users'));
    assert.ok(buildPlan(root).errors.some((e) => e.includes('admin/users.md')));
  });
});
