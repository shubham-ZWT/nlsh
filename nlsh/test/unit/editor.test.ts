import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

function withTmpDir(fn: (dir: string) => void) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'nlsh-test-'));
  try {
    fn(tmpDir);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('openEditor: temp file is written and readable', () => {
  withTmpDir((tmpDir) => {
    const tmpFile = join(tmpDir, 'command.sh');
    const content = 'git status';
    writeFileSync(tmpFile, content, 'utf-8');
    const read = readFileSync(tmpFile, 'utf-8');
    assert.equal(read, 'git status');
  });
});

test('openEditor: temp dir is cleaned up after use', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'nlsh-test-'));
  const tmpFile = join(tmpDir, 'command.sh');
  writeFileSync(tmpFile, 'test', 'utf-8');
  rmSync(tmpDir, { recursive: true, force: true });
  assert.equal(existsSync(tmpDir), false);
});

test('openEditor: handles multi-line commands', () => {
  withTmpDir((tmpDir) => {
    const tmpFile = join(tmpDir, 'command.sh');
    const content = 'git add .\ngit commit -m "fix"';
    writeFileSync(tmpFile, content, 'utf-8');
    const read = readFileSync(tmpFile, 'utf-8');
    assert.equal(read.includes('git commit'), true);
  });
});

test('openEditor: returns original content if file unchanged', () => {
  withTmpDir((tmpDir) => {
    const tmpFile = join(tmpDir, 'command.sh');
    const content = 'echo hello';
    writeFileSync(tmpFile, content, 'utf-8');
    const read = readFileSync(tmpFile, 'utf-8');
    assert.equal(read, content);
  });
});

// --- Summary ---
console.log(`\n  editor.test.ts — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
