// node --test .github/scripts/*.test.mjs
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  COMMITS_END,
  COMMITS_START,
  renderCommitBlock,
  toCommits,
  upsertCommitBlock,
  checkWhyBoxes,
  linkifyMdPaths,
  nextTitle,
  branchDefaultTitle,
  moveLeadingSummary,
} from './pr-body.mjs';

const apiCommit = (sha, message, parents = 1) => ({
  sha,
  parents: Array.from({ length: parents }, () => ({ sha: 'p' })),
  commit: { message, author: { name: 'x' } },
});

describe('toCommits', () => {
  it('flattens pages, drops merge commits and splits subject/body', () => {
    const commits = toCommits([
      [apiCommit('a1', 'feat(places): add x\n\nbody')],
      [apiCommit('b2', 'Merge branch develop', 2)],
    ]);
    assert.deepEqual(commits, [
      {
        sha: 'a1',
        subject: 'feat(places): add x',
        body: '\nbody',
        author: 'x',
      },
    ]);
  });
});

describe('renderCommitBlock', () => {
  it('links each commit to the PR commits tab', () => {
    const block = renderCommitBlock(
      [{ sha: 'abcdef1234', subject: 'fix(auth): y', body: '', author: 'x' }],
      'https://github.com/o/r/pull/7',
    );
    assert.match(
      block,
      /#### 🐛 Bug Fixes\n- \*\*auth\*\*: y \(\[`abcdef1`\]\(https:\/\/github\.com\/o\/r\/pull\/7\/commits\/abcdef1234\)\)/,
    );
    assert.ok(block.startsWith(COMMITS_START));
    assert.ok(block.endsWith(COMMITS_END));
  });
});

describe('upsertCommitBlock', () => {
  it('replaces only the marker block', () => {
    const body = `## 변경 내용\n${COMMITS_START}\nold\n${COMMITS_END}\n\n- 수동 메모\n`;
    const next = upsertCommitBlock(
      body,
      `${COMMITS_START}\nnew\n${COMMITS_END}`,
    );
    assert.equal(
      next,
      `## 변경 내용\n${COMMITS_START}\nnew\n${COMMITS_END}\n\n- 수동 메모\n`,
    );
  });

  it('prepends the block when markers are missing', () => {
    const next = upsertCommitBlock(
      'hand written',
      `${COMMITS_START}\nnew\n${COMMITS_END}`,
    );
    assert.equal(
      next,
      `${COMMITS_START}\nnew\n${COMMITS_END}\n\nhand written\n`,
    );
  });
});

describe('upsertCommitBlock — marker 유실', () => {
  const block = `${COMMITS_START}\nnew\n${COMMITS_END}`;

  it('fills the Changes section when markers are missing', () => {
    const body =
      '# What\n\nsummary\n\n## Changes\n\nci: x\n\n## Checklist\n\n- [ ] a\n';
    assert.equal(
      upsertCommitBlock(body, block),
      `# What\n\nsummary\n\n## Changes\n\n${block}\n\n## Checklist\n\n- [ ] a\n`,
    );
  });

  it('fills a trailing 변경 내용 section', () => {
    assert.equal(
      upsertCommitBlock('## 변경 내용\n\n- 손으로\n', block),
      `## 변경 내용\n\n${block}\n`,
    );
  });

  it('moves a block prepended above the Changes heading into the section', () => {
    const body = `${block}\n\n# What\n\n## Changes\n\nci: x\n\n## Checklist\n`;
    assert.equal(
      upsertCommitBlock(body, block),
      `# What\n\n## Changes\n\n${block}\n\n## Checklist\n`,
    );
  });

  it('is idempotent once placed in the section', () => {
    const once = upsertCommitBlock('## Changes\n\nx\n\n## Checklist\n', block);
    assert.equal(upsertCommitBlock(once, block), once);
  });
});

describe('moveLeadingSummary', () => {
  const guide = '<!-- 제목 가이드 -->\n<!-- 요약 가이드 -->';
  const template = `# What is this PR?\n\n${guide}\n\n## Links\n\n- a\n`;

  it('moves the commit body above the heading to below the template guide', () => {
    assert.equal(
      moveLeadingSummary(`본문 1\n\nRefs: 261014_001\n\n${template}`),
      `# What is this PR?\n\n${guide}\n\n본문 1\n\nRefs: 261014_001\n\n## Links\n\n- a\n`,
    );
  });

  it('inserts right below the heading when the guide comments are gone', () => {
    assert.equal(
      moveLeadingSummary('요약\n\n# What is this PR?\n\n## Links\n'),
      '# What is this PR?\n\n요약\n\n## Links\n',
    );
  });

  it('is idempotent and leaves bodies without leading text untouched', () => {
    const once = moveLeadingSummary(`요약\n\n${template}`);
    assert.equal(moveLeadingSummary(once), once);
    assert.equal(moveLeadingSummary(template), template);
  });

  it('leaves bodies without the heading or with a prepended commit block untouched', () => {
    assert.equal(
      moveLeadingSummary('요약\n\n## Changes\n'),
      '요약\n\n## Changes\n',
    );
    const prepended = `${COMMITS_START}\nnew\n${COMMITS_END}\n\n${template}`;
    assert.equal(moveLeadingSummary(prepended), prepended);
  });
});

describe('checkWhyBoxes —', () => {
  const why = [
    '## Why PR?',
    '',
    '- [ ] 새로운 기능 추가',
    '- [ ] 리팩토링',
    '- [ ] 버그 수정',
    '- [ ] 문서 수정',
    '- [ ] 빌드 부분 패키지 매니저 수정 및 라이브러리 업데이트',
    '- [ ] 코드 스타일 수정 (prettier)',
    '- [ ] 테스트 추가, 테스트 리팩토링',
    '- [ ] UI 수정',
    '',
    '## Checklist',
    '',
    '- [ ] local code lint 검사를 진행하셨나요?',
  ].join('\n');
  const c = (subject) => ({ sha: 's', subject, body: '', author: 'x' });

  it('checks boxes matching commit types and leaves the rest', () => {
    const next = checkWhyBoxes(why, [
      c('feat(web): a'),
      c('ci: b'),
      c('fix(ui): c'),
      c('chore(release): v1.0.0'),
    ]);
    assert.match(next, /- \[x\] 새로운 기능 추가/);
    assert.match(next, /- \[x\] 빌드 부분/);
    assert.match(next, /- \[x\] 버그 수정/);
    assert.match(next, /- \[x\] UI 수정/);
    assert.match(next, /- \[ \] 리팩토링/);
    assert.match(next, /- \[ \] local code lint/);
  });

  it('never unchecks manual checks', () => {
    const manual = why.replace('- [ ] 문서 수정', '- [x] 문서 수정');
    assert.match(checkWhyBoxes(manual, [c('feat: a')]), /- \[x\] 문서 수정/);
  });

  it('is a no-op without matching lines (BE template)', () => {
    const be = '## 변경 내용\n\n## 테스트\n\n- [ ] `pnpm lint` clean\n';
    assert.equal(checkWhyBoxes(be, [c('feat: a'), c('test: b')]), be);
  });
});

describe('linkifyMdPaths', () => {
  const repo = 'https://github.com/o/r';
  const url = (ref, path) => `[\`${path}\`](${repo}/blob/${ref}/${path})`;

  it('links backticked md paths to the head commit', () => {
    assert.equal(
      linkifyMdPaths('- `agent-work/a/b.md` 참고\n', repo, 'sha1'),
      `- ${url('sha1', 'agent-work/a/b.md')} 참고\n`,
    );
  });

  it('refreshes the ref of an existing link on the next push', () => {
    const once = linkifyMdPaths('`docs/x.md`', repo, 'sha1');
    assert.equal(linkifyMdPaths(once, repo, 'sha2'), url('sha2', 'docs/x.md'));
  });

  it('leaves placeholders, non-md paths and code fences untouched', () => {
    const body =
      '`agent-work/<epic>/<id>.md` `deploy/x.sh`\n```\n`docs/x.md`\n```\n';
    assert.equal(linkifyMdPaths(body, repo, 'sha1'), body);
  });

  it('is a no-op without repo url or ref', () => {
    assert.equal(linkifyMdPaths('`docs/x.md`', null, null), '`docs/x.md`');
  });
});

describe('nextTitle', () => {
  const c = (subject) => ({ sha: subject, subject, body: '', author: 'x' });
  const commits = [c('ci(deploy): skip docs'), c('chore(github): drop ui')];

  it('uses the first deploy-relevant commit subject plus the remaining count', () => {
    assert.equal(
      nextTitle('ci(deploy): skip docs', commits, 'b'),
      'chore(github): drop ui +1',
    );
  });

  it('keeps docs/ci type only when every commit is docs/ci', () => {
    assert.equal(nextTitle('b', [c('docs: a'), c('ci: b')], 'b'), 'docs: a +1');
  });

  it('puts the code commit type first so squash-merge does not skip release', () => {
    assert.equal(
      nextTitle(
        'Some branch',
        [c('docs(spec): draft'), c('feat(api): implement')],
        'some-branch',
      ),
      'feat(api): implement +1',
    );
  });

  it('replaces the GitHub branch-derived default title', () => {
    const ref = 'ci/261121_001-skip-docs-only-deploy';
    assert.equal(
      branchDefaultTitle(ref),
      'Ci/261121 001 skip docs only deploy',
    );
    assert.equal(
      nextTitle('Ci/261121 001 skip docs only deploy', commits, ref),
      'chore(github): drop ui +1',
    );
  });

  it('updates the count of a previously generated title', () => {
    const three = [...commits, c('fix: z')];
    assert.equal(
      nextTitle('chore(github): drop ui +1', three, 'b'),
      'chore(github): drop ui +2',
    );
  });

  it('keeps a hand-written title and returns null when unchanged', () => {
    assert.equal(nextTitle('ci: release pipeline', commits, 'b'), null);
    assert.equal(nextTitle('chore(github): drop ui +1', commits, 'b'), null);
  });

  it('omits the suffix for a single commit', () => {
    assert.equal(
      nextTitle('Some branch', [c('feat: x')], 'some-branch'),
      'feat: x',
    );
  });
});
