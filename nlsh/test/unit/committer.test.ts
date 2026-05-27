import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { isCommitCommand, injectCommitMessage } from '../../src/agent/committer.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}: ${(err as Error).message}`);
  }
}

async function testAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}: ${(err as Error).message}`);
  }
}

// --- isCommitCommand ---
test('isCommitCommand: matches "git commit"', () => {
  assert.equal(isCommitCommand('git commit'), true);
});

test('isCommitCommand: matches "git commit -m "msg""', () => {
  assert.equal(isCommitCommand('git commit -m "fix bug"'), true);
});

test('isCommitCommand: matches "git commit --amend"', () => {
  assert.equal(isCommitCommand('git commit --amend'), true);
});

test('isCommitCommand: rejects "git status"', () => {
  assert.equal(isCommitCommand('git status'), false);
});

test('isCommitCommand: rejects "git push"', () => {
  assert.equal(isCommitCommand('git push'), false);
});

test('isCommitCommand: rejects "echo hello"', () => {
  assert.equal(isCommitCommand('echo hello'), false);
});

test('isCommitCommand: matches uppercase', () => {
  assert.equal(isCommitCommand('GIT COMMIT'), true);
});

test('isCommitCommand: matches leading whitespace', () => {
  assert.equal(isCommitCommand('  git commit'), true);
});

test('isCommitCommand: matches compound command', () => {
  assert.equal(isCommitCommand('git add . && git commit'), true);
});

test('isCommitCommand: matches compound with -m', () => {
  assert.equal(isCommitCommand('git add . && git commit -m "msg"'), true);
});

// --- injectCommitMessage ---
test('injectCommitMessage: replaces bare "git commit"', () => {
  assert.equal(
    injectCommitMessage('git commit', 'add new feature'),
    'git commit -m "add new feature"',
  );
});

test('injectCommitMessage: replaces "git commit -m "old""', () => {
  assert.equal(
    injectCommitMessage('git commit -m "old message"', 'new message'),
    'git commit -m "new message"',
  );
});

test('injectCommitMessage: escapes double quotes in message', () => {
  assert.equal(
    injectCommitMessage('git commit', 'say "hello" world'),
    'git commit -m "say \\"hello\\" world"',
  );
});

test('injectCommitMessage: leaves non-commit commands unchanged', () => {
  assert.equal(
    injectCommitMessage('git push origin main', 'irrelevant'),
    'git push origin main',
  );
});

test('injectCommitMessage: works with --amend', () => {
  assert.equal(
    injectCommitMessage('git commit --amend', 'fix typo'),
    'git commit -m "fix typo"',
  );
});

test('injectCommitMessage: replaces message in compound command', () => {
  assert.equal(
    injectCommitMessage('git add . && git commit -m "Commit changes"', 'Update project'),
    'git add . && git commit -m "Update project"',
  );
});

test('injectCommitMessage: adds message to bare commit in compound', () => {
  assert.equal(
    injectCommitMessage('git add . && git commit && git push', 'Update project'),
    'git add . && git commit -m "Update project" && git push',
  );
});

test('injectCommitMessage: preserves trailing &&', () => {
  assert.equal(
    injectCommitMessage('git commit && git push', 'msg'),
    'git commit -m "msg" && git push',
  );
});

// --- Runner ---
async function runAsyncTests() {
  await testAsync('captureDiff: returns empty string in non-git directory', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'nlsh-committer-'));
    const cwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const { captureDiff } = await import('../../src/agent/committer.js');
      const diff = await captureDiff();
      assert.equal(diff, '');
    } finally {
      process.chdir(cwd);
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await testAsync('captureDiff: returns diff in git repo with changes', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'nlsh-committer-'));
    const cwd = process.cwd();
    try {
      execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
      execSync('git config user.email test@test.com', { cwd: tmpDir, stdio: 'pipe' });
      execSync('git config user.name Test', { cwd: tmpDir, stdio: 'pipe' });
      writeFileSync(join(tmpDir, 'test.txt'), 'hello');
      execSync('git add test.txt', { cwd: tmpDir, stdio: 'pipe' });
      execSync('git commit -m "initial"', { cwd: tmpDir, stdio: 'pipe' });
      writeFileSync(join(tmpDir, 'test.txt'), 'world');

      process.chdir(tmpDir);
      const { captureDiff } = await import('../../src/agent/committer.js');
      const diff = await captureDiff();
      assert.ok(diff.includes('+world'), `Expected diff referencing +world, got: ${diff.slice(0, 200)}`);
    } finally {
      process.chdir(cwd);
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
}

await runAsyncTests();

console.log(`\n  committer.test.ts — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
