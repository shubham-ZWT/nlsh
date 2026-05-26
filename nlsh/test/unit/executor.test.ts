import assert from 'node:assert/strict';
import { executeCommand } from '../../src/agent/executor.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => Promise<void>) {
  fn()
    .then(() => {
      passed++;
      console.log(`  ✓ ${name}`);
    })
    .catch((err) => {
      failed++;
      console.log(`  ✗ ${name}: ${(err as Error).message}`);
    });
}

async function run() {
  // --- executeCommand ---
  await test('executeCommand: runs a simple echo command', async () => {
    const result = await executeCommand('echo hello');
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /hello/i);
  });

  await test('executeCommand: captures stderr on failure', async () => {
    const result = await executeCommand('cmd /c "exit 1"');
    assert.equal(result.exitCode, 1);
    assert.equal(result.failed, true);
  });

  await test('executeCommand: does not throw on command not found', async () => {
    const result = await executeCommand('nonexistent_command_xyz123');
    assert.equal(result.failed, true);
    assert.equal(typeof result.exitCode, 'number');
  });

  await test('executeCommand: respects timeout', async () => {
    const result = await executeCommand('ping -n 10 127.0.0.1', { timeout: 500 });
    assert.equal(result.timedOut, true);
  });

  // --- Streaming via onData ---
  await test('executeCommand: onData callback receives stdout chunks', async () => {
    const chunks: string[] = [];
    const result = await executeCommand('echo hello streaming', {
      onData: (chunk: string) => chunks.push(chunk),
    });
    assert.equal(result.exitCode, 0);
    const all = chunks.join('');
    assert.match(all, /hello streaming/i);
  });

  await test('executeCommand: onData fires before result resolves', async () => {
    let dataReceived = false;
    const result = await executeCommand('echo hello', {
      onData: () => { dataReceived = true; },
    });
    assert.equal(result.exitCode, 0);
    assert.equal(dataReceived, true);
  });

  await test('executeCommand: onData is optional', async () => {
    // Should not throw when onData is not provided
    const result = await executeCommand('echo works');
    assert.equal(result.exitCode, 0);
  });

  await test('executeCommand: onData works with multi-line output', async () => {
    const lines: string[] = [];
    const result = await executeCommand('echo line1 & echo line2', {
      onData: (chunk: string) => lines.push(chunk),
    });
    assert.equal(result.exitCode, 0);
    const all = lines.join('');
    assert.match(all, /line1/i);
    assert.match(all, /line2/i);
  });

  // Wait for all async tests
  await new Promise((r) => setTimeout(r, 100));

  console.log(`\n  executor.test.ts — ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

run();
