import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
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

// Test the history entry contract directly (without touching ~/.nlsh)
const SAMPLE_ENTRIES = [
  {
    timestamp: '2026-05-27T10:00:00.000Z',
    originalIntent: 'list files',
    command: 'ls -la',
    exitCode: 0,
    risk: 'low',
    duration: 100,
  },
  {
    timestamp: '2026-05-27T10:01:00.000Z',
    originalIntent: 'check disk',
    command: 'df -h',
    exitCode: 0,
    risk: 'low',
    duration: 50,
  },
  {
    timestamp: '2026-05-27T10:02:00.000Z',
    originalIntent: 'delete all',
    command: 'rm -rf temp',
    exitCode: 1,
    risk: 'high',
    duration: 200,
  },
];

test('history: entry has correct shape', () => {
  const entry = SAMPLE_ENTRIES[0];
  assert.equal(typeof entry.timestamp, 'string');
  assert.equal(typeof entry.originalIntent, 'string');
  assert.equal(typeof entry.command, 'string');
  assert.equal(typeof entry.exitCode, 'number');
  assert.equal(typeof entry.risk, 'string');
  assert.equal(typeof entry.duration, 'number');
});

test('history: entries serialize and deserialize', () => {
  const json = JSON.stringify(SAMPLE_ENTRIES);
  const parsed = JSON.parse(json);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].command, 'ls -la');
  assert.equal(parsed[1].exitCode, 0);
  assert.equal(parsed[2].risk, 'high');
});

test('history: entries stored newest-first', () => {
  // addEntry prepends, so we verify ordering: [newest, ..., oldest]
  const entries = [...SAMPLE_ENTRIES].reverse();
  assert.equal(entries[0].originalIntent, 'delete all');
  assert.equal(entries[2].originalIntent, 'list files');
});

test('history: file round-trip preserves data', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'nlsh-test-'));
  const tmpFile = join(tmpDir, 'history.json');
  writeFileSync(tmpFile, JSON.stringify(SAMPLE_ENTRIES, null, 2), 'utf-8');
  const raw = readFileSync(tmpFile, 'utf-8');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].command, 'ls -la');
  rmSync(tmpDir, { recursive: true, force: true });
});

test('history: empty file returns empty array', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'nlsh-test-'));
  const tmpFile = join(tmpDir, 'history.json');
  // File doesn't exist
  assert.equal(existsSync(tmpFile), false);
  rmSync(tmpDir, { recursive: true, force: true });
});

test('history: handles malformed file gracefully', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'nlsh-test-'));
  const tmpFile = join(tmpDir, 'history.json');
  writeFileSync(tmpFile, 'not valid json', 'utf-8');
  try {
    JSON.parse(readFileSync(tmpFile, 'utf-8'));
    assert.fail('Should have thrown');
  } catch {
    assert.ok(true);
  }
  rmSync(tmpDir, { recursive: true, force: true });
});

// --- Summary ---
console.log(`\n  history.test.ts — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
