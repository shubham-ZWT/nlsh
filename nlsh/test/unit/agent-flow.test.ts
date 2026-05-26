import assert from 'node:assert/strict';
import { TuiController } from '../../src/ui/index.js';
import { createTask, saveTask, updateTask } from '../../src/agent/memory.js';
import { executeCommand } from '../../src/agent/executor.js';
import type { Step, StepRecord } from '../../src/agent/memory.js';

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

// --- TuiController + Task integration ---
test('TuiController + Task: controller state reflects task phase transitions', () => {
  const ctrl = new TuiController('list files');
  const task = createTask('list files', {
    cwd: '/test',
    hostname: 'test-pc',
    os: 'linux',
    shell: 'bash',
    installedTools: ['git', 'node'],
    home: '/home/test',
    nodeVersion: 'v20',
  });

  // Simulate planning -> approving transition
  ctrl.update({ phase: 'planning' });
  task.status = 'planning';
  assert.equal(ctrl.state.phase, 'planning');

  const plan: Step[] = [
    { id: 1, intent: 'list files' },
    { id: 2, intent: 'show details' },
  ];
  task.plan = plan;
  task.status = 'running';
  ctrl.update({ phase: 'approving', plan });
  ctrl.setSteps(plan.map(s => ({ id: s.id, intent: s.intent, status: 'pending' as const })));

  assert.equal(ctrl.state.phase, 'approving');
  assert.equal(ctrl.state.plan.length, 2);
  assert.equal(ctrl.state.steps.length, 2);
});

testAsync('TuiController + Executor: command output streams to controller', async () => {
  const ctrl = new TuiController('test');
  const result = await executeCommand('echo hello world', {
    onData: (chunk) => ctrl.appendOutput(chunk),
  });
  assert.equal(result.exitCode, 0);
  assert.match(ctrl.state.commandOutput, /hello world/i);
});

test('TuiController: plan approval -> running transition with step tracking', () => {
  const ctrl = new TuiController('deploy app');

  // Approving phase
  const plan: Step[] = [
    { id: 1, intent: 'build project' },
    { id: 2, intent: 'run tests' },
    { id: 3, intent: 'deploy' },
  ];
  ctrl.update({ phase: 'approving', plan });
  ctrl.setSteps(plan.map(s => ({ id: s.id, intent: s.intent, status: 'pending' })));

  // User approves -> start running
  ctrl.update({ phase: 'running' });
  assert.equal(ctrl.state.phase, 'running');

  // Step 1: confirming
  ctrl.updateStep(1, { status: 'confirming', command: 'npm run build' });
  ctrl.update({ currentCommand: { command: 'npm run build', explanation: 'Build the project', risk: 'medium', reversible: false, confidence: 0.9 } });

  // User confirms -> executing
  ctrl.clearOutput();
  ctrl.updateStep(1, { status: 'executing' });
  ctrl.appendOutput('Building...\nDone!');
  ctrl.updateStep(1, { status: 'completed', output: 'Building...\nDone!' });

  // Step 2: confirming
  ctrl.updateStep(2, { status: 'confirming', command: 'npm test' });
  ctrl.update({ currentCommand: { command: 'npm test', explanation: 'Run tests', risk: 'medium', reversible: true, confidence: 0.8 } });
  assert.equal(ctrl.state.currentCommand?.command, 'npm test');
  assert.equal(ctrl.state.steps[0].status, 'completed');
  assert.equal(ctrl.state.steps[1].status, 'confirming');
});

test('TuiController: recovery flow with diagnosis', () => {
  const ctrl = new TuiController('push to main');

  // Setup steps
  const plan: Step[] = [
    { id: 1, intent: 'check branch' },
    { id: 2, intent: 'push changes' },
  ];
  ctrl.setSteps(plan.map(s => ({ id: s.id, intent: s.intent, status: 'pending' })));

  // Step 1 completes
  ctrl.updateStep(1, { status: 'completed' });

  // Step 2 fails
  ctrl.updateStep(2, { status: 'failed', output: 'error: failed to push' });

  // Recovery analysis
  ctrl.update({
    phase: 'recovering',
    diagnosis: 'Remote has commits you lack',
    revisedPlan: [
      { id: 3, intent: 'fetch origin' },
      { id: 4, intent: 'rebase' },
      { id: 5, intent: 'push again' },
    ],
  });

  assert.equal(ctrl.state.phase, 'recovering');
  assert.equal(ctrl.state.diagnosis?.includes('Remote has commits'), true);
  assert.equal(ctrl.state.revisedPlan?.length, 3);
});

test('TuiController: step skip flow', () => {
  const ctrl = new TuiController('test');
  ctrl.setSteps([
    { id: 1, intent: 'step 1', status: 'confirming', command: 'echo 1' },
    { id: 2, intent: 'step 2', status: 'pending' },
  ]);
  ctrl.update({ currentCommand: { command: 'echo 1', explanation: '', risk: 'low', reversible: true, confidence: 1 } });

  // User skips step 1
  ctrl.updateStep(1, { status: 'skipped' });
  ctrl.update({ currentCommand: undefined });

  // Move to step 2
  ctrl.updateStep(2, { status: 'confirming', command: 'echo 2' });
  ctrl.update({ currentCommand: { command: 'echo 2', explanation: '', risk: 'low', reversible: true, confidence: 1 } });

  assert.equal(ctrl.state.steps[0].status, 'skipped');
  assert.equal(ctrl.state.steps[1].status, 'confirming');
});

test('TuiController: done panel after all steps completed', () => {
  const ctrl = new TuiController('test');
  ctrl.setSteps([
    { id: 1, intent: 'step 1', status: 'completed' },
    { id: 2, intent: 'step 2', status: 'completed' },
  ]);
  ctrl.update({ phase: 'done' });

  assert.equal(ctrl.state.phase, 'done');
  const allDone = ctrl.state.steps.every(s => s.status === 'completed');
  assert.equal(allDone, true);
});

test('TuiController: can recover from failed step via Y input', async () => {
  const ctrl = new TuiController('deploy');
  const plan: Step[] = [
    { id: 1, intent: 'build' },
    { id: 2, intent: 'deploy' },
  ];
  ctrl.setSteps(plan.map(s => ({ id: s.id, intent: s.intent, status: 'pending' })));
  ctrl.updateStep(1, { status: 'completed' });
  ctrl.updateStep(2, { status: 'failed', output: 'deploy failed' });

  // Recovery shows with revised plan
  const revisedPlan = [{ id: 3, intent: 'retry deploy' }];
  ctrl.update({ phase: 'recovering', diagnosis: 'Network timeout', revisedPlan });
  assert.equal(ctrl.state.phase, 'recovering');

  // Simulate user pressing Y
  ctrl.update({ phase: 'running', revisedPlan: undefined });
  assert.equal(ctrl.state.phase, 'running');
});

// --- Executor edge cases with controller ---
testAsync('executeCommand: streaming with empty output', async () => {
  const ctrl = new TuiController('test');
  const result = await executeCommand('echo -n "" 2>&1', {
    onData: (chunk) => ctrl.appendOutput(chunk),
  });
  // Empty output should still succeed
  assert.equal(result.exitCode, 0);
});

testAsync('executeCommand: streaming stderr to controller', async () => {
  const ctrl = new TuiController('test');
  // Use PowerShell to write to stderr
  const result = await executeCommand('powershell -Command "[Console]::Error.WriteLine(\"error msg\")" 2>&1', {
    onData: (chunk) => ctrl.appendOutput(chunk),
  });
  // This test verifies that onData doesn't crash when stderr is captured
  assert.equal(typeof result.exitCode, 'number');
});

// --- Summary ---
console.log(`\n  agent-flow.test.ts — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
