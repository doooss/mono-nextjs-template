// node --test .github/scripts/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  bump,
  canariesUpTo,
  classifyTags,
  compareVersions,
  formatVersion,
  nextCanaryVersion,
  parseCommit,
  parseTag,
  renderNotes,
  isNonDeployOnly,
  mainOnlyCommits,
  alreadyReleasedIn,
} from './release.mjs';

describe('parseTag', () => {
  it('parses stable and canary tags and rejects others', () => {
    assert.deepEqual(parseTag('v1.2.3'), {
      major: 1,
      minor: 2,
      patch: 3,
      canary: null,
    });
    assert.deepEqual(parseTag('v1.2.3-canary.4'), {
      major: 1,
      minor: 2,
      patch: 3,
      canary: 4,
    });
    assert.equal(parseTag('backup-before-author-rewrite'), null);
    assert.equal(parseTag('v1.2'), null);
  });
});

describe('compareVersions', () => {
  it('orders canary below the stable of the same core version', () => {
    assert.ok(
      compareVersions(parseTag('v1.2.3-canary.9'), parseTag('v1.2.3')) < 0,
    );
    assert.ok(
      compareVersions(
        parseTag('v1.2.3-canary.10'),
        parseTag('v1.2.3-canary.9'),
      ) > 0,
    );
    assert.ok(compareVersions(parseTag('v1.10.0'), parseTag('v1.9.9')) > 0);
  });
});

describe('bump', () => {
  it('resets lower components', () => {
    const v = parseTag('v1.2.3');
    assert.equal(formatVersion(bump(v, 'patch')), '1.2.4');
    assert.equal(formatVersion(bump(v, 'minor')), '1.3.0');
    assert.equal(formatVersion(bump(v, 'major')), '2.0.0');
  });
});

describe('nextCanaryVersion', () => {
  it('starts at 0.1.1-canary.1 when no tags exist', () => {
    const { stables, canaries } = classifyTags([]);
    assert.equal(
      formatVersion(nextCanaryVersion(stables, canaries)),
      '0.1.1-canary.1',
    );
  });

  it('increments the canary of patch+1 over the latest stable', () => {
    const { stables, canaries } = classifyTags([
      'v1.2.3',
      'v1.2.4-canary.1',
      'v1.2.4-canary.2',
    ]);
    assert.equal(
      formatVersion(nextCanaryVersion(stables, canaries)),
      '1.2.4-canary.3',
    );
  });

  it('continues from the retagged canary after a hotfix', () => {
    const { stables, canaries } = classifyTags([
      'v1.2.3',
      'v1.2.4',
      'v1.2.5-canary.1',
    ]);
    assert.equal(
      formatVersion(nextCanaryVersion(stables, canaries)),
      '1.2.5-canary.2',
    );
  });

  it('ignores stale canaries below the new base', () => {
    const { stables, canaries } = classifyTags(['v1.3.0', 'v1.2.4-canary.7']);
    assert.equal(
      formatVersion(nextCanaryVersion(stables, canaries)),
      '1.3.1-canary.1',
    );
  });
});

describe('parseCommit', () => {
  it('extracts type, scope and breaking marker', () => {
    const c = parseCommit({
      sha: 'a',
      subject: 'feat(auth)!: swap verifier',
      body: '',
      author: 'x',
    });
    assert.equal(c.type, 'feat');
    assert.equal(c.scope, 'auth');
    assert.equal(c.breaking, true);
    assert.equal(c.description, 'swap verifier');
  });

  it('detects BREAKING CHANGE footer', () => {
    const c = parseCommit({
      sha: 'a',
      subject: 'fix: x',
      body: 'BREAKING CHANGE: y',
      author: 'x',
    });
    assert.equal(c.breaking, true);
  });

  it('falls back to other for non-conventional subjects', () => {
    const c = parseCommit({
      sha: 'a',
      subject: 'Update README',
      body: '',
      author: 'x',
    });
    assert.equal(c.type, 'other');
  });
});

describe('renderNotes', () => {
  const commit = (subject) => ({
    sha: '1234567890',
    subject,
    body: '',
    author: 'x',
  });

  it('groups commits by type and skips release commits', () => {
    const notes = renderNotes(
      [
        commit('feat(places): add x'),
        commit('fix: y'),
        commit('chore(release): v1.0.0'),
        commit('wip'),
      ],
      { repoUrl: null, previousTag: null },
    );
    assert.match(notes, /### ✨ Features\n- \*\*places\*\*: add x/);
    assert.match(notes, /### 🐛 Bug Fixes\n- y/);
    assert.match(notes, /### 📌 Other\n- wip/);
    assert.doesNotMatch(notes, /v1\.0\.0/);
  });

  it('links the comparison to the new tag, not a moving HEAD', () => {
    assert.match(
      renderNotes([commit('fix: y')], {
        repoUrl: 'https://github.com/o/r',
        previousTag: 'v1.0.0',
        currentTag: 'v1.0.1',
      }),
      /compare\/v1\.0\.0\.\.\.v1\.0\.1/,
    );
  });

  it('keeps canaries newer than the released base', () => {
    const { canaries } = classifyTags([
      'v1.2.4-canary.3',
      'v1.2.4-canary.4',
      'v1.2.4-canary.5',
    ]);
    assert.deepEqual(
      canariesUpTo(canaries, 'v1.2.4-canary.4').map((c) => c.tag),
      ['v1.2.4-canary.3', 'v1.2.4-canary.4'],
    );
  });
});

describe('isNonDeployOnly', () => {
  const c = (subject) => ({ sha: 'a', subject, body: '', author: 'x' });

  it('skips when only docs / ci commits changed', () => {
    assert.equal(isNonDeployOnly([c('docs: a'), c('docs(api): b')]), true);
    assert.equal(isNonDeployOnly([c('ci(github): a'), c('ci: b')]), true);
    assert.equal(isNonDeployOnly([c('docs: a'), c('ci(deploy): b')]), true);
    assert.equal(
      isNonDeployOnly([c('docs: a'), c('chore(release): v1.0.0 [skip ci]')]),
      true,
    );
  });

  it('deploys when any other type or a non-conventional commit is included', () => {
    assert.equal(isNonDeployOnly([c('ci: a'), c('fix: b')]), false);
    assert.equal(isNonDeployOnly([c('docs: a'), c('build: b')]), false);
    assert.equal(isNonDeployOnly([c('update readme')]), false);
  });

  it('is false for an empty or release-only change set', () => {
    assert.equal(isNonDeployOnly([]), false);
    assert.equal(isNonDeployOnly([c('chore(release): v1.0.0')]), false);
  });
});

describe('mainOnlyCommits', () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-test-'));
  after(() => rmSync(dir, { recursive: true, force: true }));
  const run = (...args) =>
    execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@t',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@t',
      },
    }).trim();
  const commit = (file, subject) => {
    writeFileSync(join(dir, file), subject);
    run('add', file);
    run('commit', '-q', '-m', subject);
    return run('rev-parse', 'HEAD');
  };

  run('init', '-q', '-b', 'main');
  commit('a.txt', 'feat: init');
  run('branch', 'develop');
  const picked = commit('ci.yml', 'ci: add workflow (#32)');
  commit('VERSION', 'chore(release): v0.1.1 [skip ci]');
  run('checkout', '-q', 'develop');
  run('cherry-pick', picked);
  commit('b.txt', 'feat: develop work');

  it('ignores main commits already cherry-picked into base and release commits', () => {
    assert.deepEqual(mainOnlyCommits('main', 'develop', run), []);
  });

  it('reports hotfix commits whose patch is missing from base', () => {
    run('checkout', '-q', 'main');
    const hotfix = commit('fix.txt', 'fix: hotfix');
    assert.deepEqual(mainOnlyCommits('main', 'develop', run), [
      { sha: hotfix, subject: 'fix: hotfix' },
    ]);
  });
});

describe('alreadyReleasedIn (prod release rerun)', () => {
  const stables = [{ tag: 'v1.0.0' }, { tag: 'v1.0.1' }];
  it('returns the latest stable when base is already contained', () => {
    assert.equal(
      alreadyReleasedIn('v1.0.2-canary.3', stables, () => true),
      'v1.0.1',
    );
  });
  it('returns null for an unreleased canary or no stable yet', () => {
    assert.equal(
      alreadyReleasedIn('v1.0.2-canary.4', stables, () => false),
      null,
    );
    assert.equal(
      alreadyReleasedIn('v0.1.1-canary.1', [], () => true),
      null,
    );
  });
});
