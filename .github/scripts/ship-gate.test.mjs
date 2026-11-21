import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DONE_TASK_RE,
  duplicateAdrNumbers,
  hasContent,
  memoryView,
  specViewports,
  parseAdrField,
  parseFrontmatter,
  parseSpecField,
  screenshotPath,
  validateShipTask,
} from './ship-gate.mjs';

const TASK = 'agent-work/2611-auth/done/261121_001_login.md';
const SPEC = 'docs/specs/modules/auth.md';
const PAGE = 'docs/specs/pages/login.md';

function task({ fm = {}, body } = {}) {
  const front = {
    id: '261121_001_login',
    status: 'done',
    review: 'passed (2026-11-21, rounds 2)',
    adr: '0002',
    spec: `[${SPEC}]`,
    ...fm,
  };
  const lines = Object.entries(front)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join('\n')}\n---\n\n${
    body ??
    '# login\n\n## 최종 사양\n- POST /v1/auth/login\n\n## 예외 케이스\n| # | 케이스 | 판정 |\n| --- | --- | --- |\n| 1 | 빈 비밀번호 | 수용 |\n\n## 결정\n- ADR-0002\n\n## 검증\n- pnpm test ✅\n'
  }`;
}

const SPEC_DOC = `---\nentity: module\nname: auth\nupdated: 2026-11-21\nrefs: 261121_001_login\n---\n# auth\n`;

function baseFiles(extra = {}) {
  return {
    [TASK]: task(),
    [SPEC]: SPEC_DOC,
    'docs/adr/0002-jwt-cookie.md': '# ADR',
    ...extra,
  };
}

describe('parseFrontmatter', () => {
  it('parses scalars, inline lists, block lists and comments', () => {
    const { data, body } = parseFrontmatter(
      '---\nid: x # comment\nspec: [a.md, "b.md"]\nlinks:\n  - one\n  - two\nreview: passed\n---\nbody\n',
    );
    assert.equal(data.id, 'x');
    assert.deepEqual(data.spec, ['a.md', 'b.md']);
    assert.deepEqual(data.links, ['one', 'two']);
    assert.equal(data.review, 'passed');
    assert.equal(body, 'body\n');
  });

  it('returns null without fence', () => {
    assert.equal(parseFrontmatter('# no front'), null);
  });
});

describe('field parsing', () => {
  it('spec none requires reason', () => {
    assert.deepEqual(parseSpecField('none — 내부 리팩터'), {
      none: true,
      reason: '내부 리팩터',
    });
    assert.deepEqual(parseSpecField('none'), { none: true, reason: '' });
    assert.deepEqual(parseSpecField(['a.md', 'b.md']), {
      paths: ['a.md', 'b.md'],
    });
    assert.deepEqual(parseSpecField(undefined), { missing: true });
  });

  it('adr ids and none', () => {
    assert.deepEqual(parseAdrField('0002, ADR-0003'), {
      ids: ['0002', '0003'],
      invalid: [],
    });
    assert.deepEqual(parseAdrField('none - 결정 없음'), {
      none: true,
      reason: '결정 없음',
    });
    assert.deepEqual(parseAdrField('abc'), { ids: [], invalid: ['abc'] });
  });

  it('page viewports default to desktop, none = no shots', () => {
    assert.deepEqual(specViewports('---\nroute: /\n---\n'), ['desktop']);
    assert.deepEqual(
      specViewports('---\nscreenshots: [desktop, mobile]\n---\n'),
      ['desktop', 'mobile'],
    );
    assert.deepEqual(specViewports('---\nscreenshots: none\n---\n'), []);
    assert.equal(
      screenshotPath('docs/specs/pages/login.md', 'mobile'),
      'docs/specs/pages/assets/login.mobile.png',
    );
  });

  it('DONE_TASK_RE ignores archive and templates', () => {
    assert.ok(DONE_TASK_RE.test(TASK));
    assert.ok(DONE_TASK_RE.test('agent-work/misc/done/261121_002_x.md'));
    assert.ok(
      !DONE_TASK_RE.test(
        'agent-work/archive/2611-auth/done/261121_001_login.md',
      ),
    );
    assert.ok(
      !DONE_TASK_RE.test('agent-work/2611-auth/progress/261121_001_login.md'),
    );
  });
});

describe('validateShipTask', () => {
  it('passes a complete ship task', () => {
    const r = validateShipTask(TASK, memoryView(baseFiles()));
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, []);
  });

  it('fails without adversarial review', () => {
    const r = validateShipTask(
      TASK,
      memoryView(baseFiles({ [TASK]: task({ fm: { review: 'pending' } }) })),
    );
    assert.ok(r.errors.some((e) => e.includes('review')));
    // 템플릿 문구 그대로 복사 = 통과 아님
    const copied = validateShipTask(
      TASK,
      memoryView(
        baseFiles({
          [TASK]: task({ fm: { review: 'passed (YYYY-MM-DD, rounds N)' } }),
        }),
      ),
    );
    assert.ok(copied.errors.some((e) => e.includes('review')));
  });

  it('fails when required sections are missing or empty', () => {
    const body = '## 최종 사양\n- x\n\n## 예외 케이스\n<!-- 가이드 -->\n';
    const r = validateShipTask(
      TASK,
      memoryView(baseFiles({ [TASK]: task({ body }) })),
    );
    assert.ok(
      r.errors.some((e) => e.startsWith('## 예외 케이스 섹션 비어 있음')),
    );
    assert.ok(r.errors.includes('## 검증 섹션 없음'));
  });

  it('fails when ADR file or reason is missing', () => {
    const missing = validateShipTask(
      TASK,
      memoryView(baseFiles({ [TASK]: task({ fm: { adr: '0009' } }) })),
    );
    assert.ok(missing.errors.some((e) => e.includes('docs/adr/0009-')));
    const noReason = validateShipTask(
      TASK,
      memoryView(baseFiles({ [TASK]: task({ fm: { adr: 'none' } }) })),
    );
    assert.ok(noReason.errors.includes('adr: none 사유 필요'));
    const templateWord = validateShipTask(
      TASK,
      memoryView(baseFiles({ [TASK]: task({ fm: { adr: 'none — 사유' } }) })),
    );
    assert.ok(templateWord.errors.includes('adr: none 사유 필요'));
    const withReason = validateShipTask(
      TASK,
      memoryView(
        baseFiles({ [TASK]: task({ fm: { adr: 'none — 기존 패턴 재사용' } }) }),
      ),
    );
    assert.deepEqual(withReason.errors, []);
  });

  it('fails when spec doc is missing', () => {
    const files = baseFiles();
    delete files[SPEC];
    const r = validateShipTask(TASK, memoryView(files));
    assert.ok(r.errors.includes(`spec 파일 없음: ${SPEC}`));
  });

  it('requires page screenshots for page specs', () => {
    const page = `---\nentity: page\nroute: /login\nscreenshots: [desktop, mobile]\nupdated: 2026-11-21\nrefs: 261121_001_login\n---\n# login\n`;
    const files = baseFiles({
      [TASK]: task({ fm: { spec: `[${PAGE}]` } }),
      [PAGE]: page,
      'docs/specs/pages/assets/login.desktop.png': 'png',
    });
    const r = validateShipTask(TASK, memoryView(files));
    assert.deepEqual(r.errors, [
      '스크린샷 없음: docs/specs/pages/assets/login.mobile.png (pnpm spec:shots)',
    ]);
  });

  it('warns on leftover process log and prod checks', () => {
    const body =
      '## 최종 사양\n- x\n\n## 예외 케이스\n- 없음\n\n## 결정\n- none\n\n## 검증\n- [x] prod 배포 확인\n\n## 메모\n- wip\n';
    const r = validateShipTask(
      TASK,
      memoryView(baseFiles({ [TASK]: task({ body }) })),
    );
    assert.deepEqual(r.errors, []);
    assert.equal(r.warnings.length, 2);
  });

  it('warns on history sections in spec docs', () => {
    const r = validateShipTask(
      TASK,
      memoryView(baseFiles({ [SPEC]: `${SPEC_DOC}\n## 변경 이력\n- v1\n` })),
    );
    assert.ok(r.warnings.some((w) => w.includes('이력 섹션 금지')));
  });
});

describe('review round 1 regressions', () => {
  it('rejects placeholder-only sections and requires ## 결정', () => {
    const body =
      '## 최종 사양\n-\n\n## 예외 케이스\n| # | 케이스 | 판정 | 처리 |\n| --- | --- | --- | --- |\n\n## 검증\n- \n';
    const r = validateShipTask(
      TASK,
      memoryView(baseFiles({ [TASK]: task({ body }) })),
    );
    assert.ok(
      r.errors.some((e) => e.startsWith('## 최종 사양 섹션 비어 있음')),
    );
    assert.ok(
      r.errors.some((e) => e.startsWith('## 예외 케이스 섹션 비어 있음')),
    );
    assert.ok(r.errors.some((e) => e.startsWith('## 검증 섹션 비어 있음')));
    assert.ok(r.errors.includes('## 결정 섹션 없음'));
  });

  it('warns on leftover template placeholders', () => {
    const body =
      '## 최종 사양\n- x\n\n## 예외 케이스\n- 없음\n\n## 결정\n- ADR-NNNN\n\n## 검증\n- ok\n';
    const r = validateShipTask(
      TASK,
      memoryView(baseFiles({ [TASK]: task({ body }) })),
    );
    assert.deepEqual(r.errors, []);
    assert.ok(r.warnings.includes('## 결정 에 템플릿 자리 표시자 잔존'));
  });

  it('warns when spec refs point at another task', () => {
    const r = validateShipTask(
      TASK,
      memoryView(
        baseFiles({
          [SPEC]: SPEC_DOC.replace(
            'refs: 261121_001_login',
            'refs: 261101_009_old',
          ),
        }),
      ),
    );
    assert.ok(
      r.warnings.some((w) => w.startsWith('spec refs(261101_009_old)')),
    );
  });

  it('splits comma separated spec paths without brackets', () => {
    assert.deepEqual(parseSpecField('docs/specs/a.md, docs/specs/b.md'), {
      paths: ['docs/specs/a.md', 'docs/specs/b.md'],
    });
  });

  it('finds duplicate ADR numbers', () => {
    assert.deepEqual(
      duplicateAdrNumbers(['0001-a.md', '0004-x.md', '0004-y.md', 'README.md']),
      ['0004 (0004-x.md, 0004-y.md)'],
    );
  });

  it('hasContent keeps real rows and drops header-only tables', () => {
    assert.equal(hasContent('| a | b |\n| --- | --- |\n| 1 | 2 |'), true);
    assert.equal(hasContent('| a | b |\n| --- | --- |\n|  |  |'), false);
    assert.equal(
      hasContent('| # | 케이스 | 판정 |\n| --- | --- | --- |\n| 1 | | |'),
      false,
    );
    assert.equal(hasContent('- 없음 (finding 0)'), true);
    assert.equal(hasContent('<!-- guide -->\n-\n'), false);
  });
});

describe('review round 2 regressions (ship-gate)', () => {
  it('ignores placeholder-looking text inside inline code', () => {
    const body =
      '## 최종 사양\n- `SPEC_PAGE=<slug> pnpm spec:shots` 로 한 페이지\n\n## 예외 케이스\n- 없음\n\n## 결정\n- ADR-0002\n\n## 검증\n- ok\n';
    const r = validateShipTask(
      TASK,
      memoryView(baseFiles({ [TASK]: task({ body }) })),
    );
    assert.deepEqual(r.warnings, []);
  });
});
