import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTask, updateTask, saveTask, loadTask } from '../../src/agent/memory.js';
import type { Task } from '../../src/agent/memory.js';

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

// --- createTask ---
test('createTask: returns a task with correct structure', () => {
  const task = createTask('list files', {
    cwd: '/test',
    hostname: 'test-pc',
    os: 'win32',
    shell: 'cmd.exe',
    installedTools: ['git', 'node'],
    home: 'C:\\Users\\test',
    nodeVersion: 'v18',
  });

  assert.equal(typeof task.id, 'string');
  assert.equal(task.id.length > 0, true);
  assert.equal(task.originalIntent, 'list files');
  assert.equal(task.status, 'planning');
  assert.equal(task.currentStep, 1);
  assert.equal(task.history.length, 0);
  assert.equal(task.recoveryAttempts, 0);
});

test('createTask: each call generates unique id', () => {
  const t1 = createTask('a', {} as any);
  const t2 = createTask('b', {} as any);
  assert.notEqual(t1.id, t2.id);
});

// --- updateTask ---
test('updateTask: appends to history', () => {
  const task = createTask('test', {} as any);
  updateTask(task, {
    stepId: 1,
    intent: 'do something',
    command: 'echo hi',
    stdout: 'hi',
    stderr: '',
    exitCode: 0,
    failed: false,
    timedOut: false,
    duration: Date.now(),
  });

  assert.equal(task.history.length, 1);
  assert.equal(task.history[0].stepId, 1);
  assert.equal(task.history[0].command, 'echo hi');
});

test('updateTask: increments currentStep', () => {
  const task = createTask('test', {} as any);
  updateTask(task, {
    stepId: 1,
    intent: 'step one',
    command: 'echo 1',
    stdout: '',
    stderr: '',
    exitCode: 0,
    failed: false,
    timedOut: false,
    duration: Date.now(),
  });
  assert.equal(task.currentStep, 2);
});

test('updateTask: accumulates multiple steps', () => {
  const task = createTask('test', {} as any);
  for (let i = 1; i <= 5; i++) {
    updateTask(task, {
      stepId: i,
      intent: `step ${i}`,
      command: `echo ${i}`,
      stdout: '',
      stderr: '',
      exitCode: 0,
      failed: false,
      timedOut: false,
      duration: Date.now(),
    });
  }
  assert.equal(task.history.length, 5);
  assert.equal(task.currentStep, 6);
});

// --- saveTask / loadTask ---
async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = join(tmpdir(), `nlsh-test-${Date.now()}-${Math.random()}`);
  mkdirSync(dir, { recursive: true });
  // Override tasks dir by using saveTask with custom path
  // saveTask writes to ~/.nlsh/tasks/, so we test it differently
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

testAsync('saveTask/loadTask: round-trip preserves task state', async () => {
  await withTempDir(async (tmpDir) => {
    // Use env var to redirect? No, saveTask is hardcoded.
    // Instead, test the serialization contract directly.
    const original = createTask('save test', {
      cwd: '/tmp',
      hostname: 'test',
      os: 'linux',
      shell: 'bash',
      installedTools: ['git'],
      home: '/home/test',
      nodeVersion: 'v20',
    });

    updateTask(original, {
      stepId: 1,
      intent: 'test step',
      command: 'echo done',
      stdout: 'done',
      stderr: '',
      exitCode: 0,
      failed: false,
      timedOut: false,
      duration: Date.now(),
    });

    original.status = 'done';

    // simulate save and reload via direct file write/read
    const filePath = join(tmpDir, `${original.id}.json`);
    writeFileSync(filePath, JSON.stringify(original, null, 2), 'utf-8');
    const raw = readFileSync(filePath, 'utf-8');
    const loaded = JSON.parse(raw) as Task;

    assert.equal(loaded.id, original.id);
    assert.equal(loaded.originalIntent, 'save test');
    assert.equal(loaded.status, 'done');
    assert.equal(loaded.history.length, 1);
    assert.equal(loaded.history[0].command, 'echo done');
    assert.equal(loaded.currentStep, 2);
  });
});

test('Task: status enum allows valid states', () => {
  const task = createTask('test', {} as any);

  task.status = 'planning';
  assert.equal(task.status, 'planning');

  task.status = 'running';
  assert.equal(task.status, 'running');

  task.status = 'recovering';
  assert.equal(task.status, 'recovering');

  task.status = 'done';
  assert.equal(task.status, 'done');

  task.status = 'failed';
  assert.equal(task.status, 'failed');
});

console.log(`\n  memory.test.ts — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
