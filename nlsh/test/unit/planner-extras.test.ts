import assert from 'node:assert/strict';
import { isMetaStep, filterPlan, extractJSON } from '../../src/agent/planner.js';
import type { Step } from '../../src/agent/memory.js';

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

// --- extractJSON edge cases ---
test('extractJSON: handles nested braces', () => {
  const input = '{"command": "echo {hello}", "risk": "low"}';
  const result = extractJSON(input);
  assert.equal(result, '{"command": "echo {hello}", "risk": "low"}');
});

test('extractJSON: handles empty array in text', () => {
  const input = 'some text [] more';
  const result = extractJSON(input);
  assert.equal(result, '[]');
});

test('extractJSON: handles mixed surrounding text with code fences', () => {
  const input = 'Here:\n```\n[{"id":1}]\n```\nDone.';
  const result = extractJSON(input);
  assert.equal(result, '[{"id":1}]');
});

test('extractJSON: prefers array over object when both present', () => {
  const input = '[{"id":1}] and also {"name":"test"}';
  const result = extractJSON(input);
  assert.equal(result, '[{"id":1}]');
});

// --- isMetaStep edge cases ---
test('isMetaStep: detects "open powershell"', () => {
  assert.equal(isMetaStep('open powershell'), true);
});

test('isMetaStep: detects "open the command prompt"', () => {
  assert.equal(isMetaStep('open the command prompt'), true);
});

test('isMetaStep: allows "open a file in editor"', () => {
  assert.equal(isMetaStep('open a file in editor'), false);
});

test('isMetaStep: detects "verify python is installed"', () => {
  assert.equal(isMetaStep('verify python is installed'), true);
});

test('isMetaStep: detects "check if node is installed"', () => {
  assert.equal(isMetaStep('check if node is installed'), true);
});

test('isMetaStep: allows "check git status"', () => {
  assert.equal(isMetaStep('check git status'), false);
});

test('isMetaStep: allows "check node version"', () => {
  assert.equal(isMetaStep('check node version'), false);
});

// --- filterPlan edge cases ---
test('filterPlan: removes all meta steps and leaves only real steps', () => {
  const steps: Step[] = [
    { id: 1, intent: 'open terminal' },
    { id: 2, intent: 'cd to project' },
    { id: 3, intent: 'run npm test' },
    { id: 4, intent: 'verify jest is installed' },
  ];
  const result = filterPlan(steps);
  assert.equal(result.length, 1);
  assert.equal(result[0].intent, 'run npm test');
});

test('filterPlan: renumbers correctly after removing some steps', () => {
  const steps: Step[] = [
    { id: 1, intent: 'open terminal' },
    { id: 2, intent: 'list files' },
    { id: 3, intent: 'open shell' },
    { id: 4, intent: 'show disk usage' },
  ];
  const result = filterPlan(steps);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 1);
  assert.equal(result[0].intent, 'list files');
  assert.equal(result[1].id, 2);
  assert.equal(result[1].intent, 'show disk usage');
});

// --- Summary ---
console.log(`\n  planner-extras.test.ts — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
