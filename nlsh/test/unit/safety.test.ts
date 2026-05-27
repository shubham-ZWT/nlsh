import assert from 'node:assert/strict';
import { checkSafety } from '../../src/agent/safety.js';

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

// --- Blocklist ---
test('safety: blocks rm -rf /', () => {
  const r = checkSafety('rm -rf /', 'low', true, 0.9);
  assert.equal(r.blocked, true);
  assert.ok(r.blockReason);
});

test('safety: blocks rm -rf /*', () => {
  const r = checkSafety('rm -rf /*', 'low', true, 0.9);
  assert.equal(r.blocked, true);
});

test('safety: blocks mkfs command', () => {
  const r = checkSafety('mkfs.ext4 /dev/sda1', 'high', false, 0.5);
  assert.equal(r.blocked, true);
});

test('safety: blocks dd if=/dev/zero', () => {
  const r = checkSafety('dd if=/dev/zero of=/dev/sda bs=4M', 'high', false, 0.3);
  assert.equal(r.blocked, true);
});

test('safety: blocks fork bomb', () => {
  const r = checkSafety(':(){ :|:& };:', 'high', false, 0.1);
  assert.equal(r.blocked, true);
});

// --- Safe commands pass ---
test('safety: allows safe commands', () => {
  const r = checkSafety('git status', 'low', true, 0.95);
  assert.equal(r.blocked, false);
  assert.equal(r.fullYesRequired, false);
  assert.equal(r.warnings.length, 0);
});

test('safety: allows echo', () => {
  const r = checkSafety('echo hello', 'low', true, 0.99);
  assert.equal(r.blocked, false);
  assert.equal(r.fullYesRequired, false);
});

// --- Risk check ---
test('safety: high risk requires full yes', () => {
  const r = checkSafety('docker rm -f $(docker ps -aq)', 'high', false, 0.8);
  assert.equal(r.blocked, false);
  assert.equal(r.fullYesRequired, true);
});

// --- Irreversible check ---
test('safety: irreversible command requires full yes', () => {
  const r = checkSafety('rm important-file.txt', 'low', false, 0.95);
  assert.equal(r.blocked, false);
  assert.equal(r.fullYesRequired, true);
  assert.ok(r.warnings.some(w => w.includes('irreversible')));
});

// --- Sudo check ---
test('safety: sudo command requires full yes', () => {
  const r = checkSafety('sudo apt update', 'low', true, 0.9);
  assert.equal(r.blocked, false);
  assert.equal(r.fullYesRequired, true);
  assert.ok(r.warnings.some(w => w.includes('sudo')));
});

test('safety: sudo high risk requires full yes once', () => {
  const r = checkSafety('sudo rm -rf /var/log', 'high', false, 0.7);
  assert.equal(r.blocked, false);
  assert.equal(r.fullYesRequired, true);
});

// --- Low confidence check ---
test('safety: low confidence adds warning', () => {
  const r = checkSafety('some-risky-command', 'medium', true, 0.6);
  assert.equal(r.blocked, false);
  assert.equal(r.fullYesRequired, false);
  assert.ok(r.warnings.some(w => w.includes('60%')));
});

test('safety: confidence 0.75 is fine', () => {
  const r = checkSafety('git push', 'low', true, 0.75);
  assert.equal(r.warnings.length, 0);
});

// --- Combined warnings ---
test('safety: multiple warnings accumulate', () => {
  const r = checkSafety('sudo rm important', 'high', false, 0.5);
  assert.equal(r.blocked, false);
  assert.equal(r.fullYesRequired, true);
  assert.ok(r.warnings.length >= 2);
});

test('safety: blocks rmdir /s on Windows', () => {
  const r = checkSafety('rmdir /s /q node_modules', 'low', true, 0.9);
  assert.equal(r.blocked, true);
  assert.ok(r.blockReason);
});

test('safety: overrides low risk for destructive delete', () => {
  const r = checkSafety('rm -rf node_modules', 'low', true, 0.9);
  assert.equal(r.blocked, false);
  assert.equal(r.fullYesRequired, true);
  assert.ok(r.warnings.some(w => w.includes('overridden')));
});

// --- Summary ---
console.log(`\n  safety.test.ts — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
