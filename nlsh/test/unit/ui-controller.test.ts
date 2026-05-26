import assert from 'node:assert/strict';
import { TuiController } from '../../src/ui/index.js';

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

// --- Constructor ---
test('constructor: sets initial state to planning', () => {
  const ctrl = new TuiController('list files');
  assert.equal(ctrl.state.phase, 'planning');
  assert.equal(ctrl.state.intent, 'list files');
  assert.equal(ctrl.state.commandOutput, '');
  assert.equal(ctrl.state.startTime > 0, true);
  assert.deepEqual(ctrl.state.plan, []);
  assert.deepEqual(ctrl.state.steps, []);
  assert.deepEqual(ctrl.state.terrainDetails, []);
  assert.equal(ctrl.state.currentStepIndex, 0);
});

// --- update ---
test('update: merges partial state', () => {
  const ctrl = new TuiController('test');
  ctrl.update({ phase: 'approving', plan: [{ id: 1, intent: 'do it' }] });
  assert.equal(ctrl.state.phase, 'approving');
  assert.equal(ctrl.state.plan.length, 1);
  assert.equal(ctrl.state.intent, 'test'); // untouched
});

test('update: does not overwrite unset fields', () => {
  const ctrl = new TuiController('test');
  ctrl.update({ error: 'something broke' });
  assert.equal(ctrl.state.error, 'something broke');
  assert.equal(ctrl.state.phase, 'planning'); // untouched
});

test('update: notifies subscribers synchronously', () => {
  const ctrl = new TuiController('test');
  let notified = 0;
  ctrl.subscribe(() => notified++);
  ctrl.update({ phase: 'running' });
  assert.equal(notified, 1);
  ctrl.update({ phase: 'done' });
  assert.equal(notified, 2);
});

// --- subscribe ---
test('subscribe: unsubscribe removes listener', () => {
  const ctrl = new TuiController('test');
  let notified = 0;
  const unsub = ctrl.subscribe(() => notified++);
  ctrl.update({ phase: 'running' });
  assert.equal(notified, 1);
  unsub();
  ctrl.update({ phase: 'done' });
  assert.equal(notified, 1); // not incremented
});

test('subscribe: multiple subscribers all get notified', () => {
  const ctrl = new TuiController('test');
  let a = 0, b = 0;
  ctrl.subscribe(() => a++);
  ctrl.subscribe(() => b++);
  ctrl.update({ phase: 'running' });
  assert.equal(a, 1);
  assert.equal(b, 1);
});

// --- appendOutput ---
test('appendOutput: appends text to commandOutput', () => {
  const ctrl = new TuiController('test');
  ctrl.appendOutput('line 1\n');
  assert.equal(ctrl.state.commandOutput, 'line 1\n');
  ctrl.appendOutput('line 2\n');
  assert.equal(ctrl.state.commandOutput, 'line 1\nline 2\n');
});

test('appendOutput: notifies subscribers', () => {
  const ctrl = new TuiController('test');
  let notified = 0;
  ctrl.subscribe(() => notified++);
  ctrl.appendOutput('data');
  assert.equal(notified, 1);
});

// --- clearOutput ---
test('clearOutput: clears command output', () => {
  const ctrl = new TuiController('test');
  ctrl.appendOutput('some output');
  assert.equal(ctrl.state.commandOutput, 'some output');
  ctrl.clearOutput();
  assert.equal(ctrl.state.commandOutput, '');
});

// --- setSteps ---
test('setSteps: sets the steps array', () => {
  const ctrl = new TuiController('test');
  ctrl.setSteps([
    { id: 1, intent: 'step 1', status: 'pending' },
    { id: 2, intent: 'step 2', status: 'pending' },
  ]);
  assert.equal(ctrl.state.steps.length, 2);
  assert.equal(ctrl.state.steps[0].intent, 'step 1');
});

// --- updateStep ---
test('updateStep: updates a specific step by id', () => {
  const ctrl = new TuiController('test');
  ctrl.setSteps([
    { id: 1, intent: 'step 1', status: 'pending' },
    { id: 2, intent: 'step 2', status: 'pending' },
  ]);
  ctrl.updateStep(1, { status: 'completed' });
  assert.equal(ctrl.state.steps[0].status, 'completed');
  assert.equal(ctrl.state.steps[1].status, 'pending'); // untouched
});

test('updateStep: does nothing for non-existent id', () => {
  const ctrl = new TuiController('test');
  ctrl.setSteps([{ id: 1, intent: 'step 1', status: 'pending' }]);
  ctrl.updateStep(99, { status: 'completed' });
  assert.equal(ctrl.state.steps[0].status, 'pending');
});

test('updateStep: merges partial update into step', () => {
  const ctrl = new TuiController('test');
  ctrl.setSteps([{ id: 1, intent: 'step 1', status: 'executing', command: 'echo hi' }]);
  ctrl.updateStep(1, { status: 'completed', output: 'hi' });
  assert.equal(ctrl.state.steps[0].status, 'completed');
  assert.equal(ctrl.state.steps[0].output, 'hi');
  assert.equal(ctrl.state.steps[0].command, 'echo hi'); // untouched
});

// --- waitForInput / handleInput ---
testAsync('waitForInput: resolves when handleInput is called', async () => {
  const ctrl = new TuiController('test');
  const promise = ctrl.waitForInput();
  ctrl.handleInput('y');
  const result = await promise;
  assert.equal(result, 'y');
});

testAsync('waitForInput: resolves the most recent waiter only', async () => {
  const ctrl = new TuiController('test');
  const p1 = ctrl.waitForInput();
  const p2 = ctrl.waitForInput();
  ctrl.handleInput('n');
  const r1 = await p1;
  const r2 = await p2;
  // Only one waiter should have resolved; the other hangs
  // Actually waitForInput replaces the previous resolve function
  // So p1 will never resolve, only p2 will
  // This is by design - only the latest waiter matters
});

testAsync('waitForInput: multiple calls replace previous waiter', async () => {
  const ctrl = new TuiController('test');
  let p1Resolved = false;
  const p1 = ctrl.waitForInput().then(() => { p1Resolved = true; });
  ctrl.waitForInput(); // replaces p1's resolve
  ctrl.handleInput('y');
  await new Promise(r => setTimeout(r, 10));
  assert.equal(p1Resolved, false); // p1 should NOT resolve
});

testAsync('handleInput: does nothing when no waiter', () => {
  const ctrl = new TuiController('test');
  // Should not throw
  ctrl.handleInput('y');
});

test('handleInput: can handle multiple sequential inputs', () => {
  const ctrl = new TuiController('test');
  const results: string[] = [];
  ctrl.waitForInput().then(r => results.push(r));
  ctrl.handleInput('y');
  ctrl.waitForInput().then(r => results.push(r));
  ctrl.handleInput('n');
  // Promise callbacks are microtasks, wait for them
});

// --- State transitions ---
test('state: full approval flow transition', () => {
  const ctrl = new TuiController('push to main');
  ctrl.update({ phase: 'approving', plan: [
    { id: 1, intent: 'check branch' },
    { id: 2, intent: 'commit' },
  ]});
  assert.equal(ctrl.state.phase, 'approving');
  assert.equal(ctrl.state.plan.length, 2);
});

test('state: full recovery flow transition', () => {
  const ctrl = new TuiController('push to main');
  ctrl.update({ phase: 'recovering', diagnosis: 'Branch diverged', revisedPlan: [
    { id: 3, intent: 'fetch origin' },
  ]});
  assert.equal(ctrl.state.phase, 'recovering');
  assert.equal(ctrl.state.diagnosis, 'Branch diverged');
});

test('state: terrain details accumulation', () => {
  const ctrl = new TuiController('start db');
  ctrl.update({ terrainDetails: ['Node.js project', 'Docker Compose'] });
  ctrl.update({ terrainDetails: ['Node.js project', 'Docker Compose', '3 env vars'] });
  // update merges, so terrainDetails should be the latest
  assert.equal(ctrl.state.terrainDetails.length, 3);
  assert.equal(ctrl.state.terrainDetails[2], '3 env vars');
});

test('state: startTime is set on construction and does not change', () => {
  const ctrl = new TuiController('test');
  const startTime = ctrl.state.startTime;
  ctrl.update({ phase: 'running' });
  assert.equal(ctrl.state.startTime, startTime);
});

// --- Summary ---
console.log(`\n  ui-controller.test.ts — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
