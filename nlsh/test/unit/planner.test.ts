import assert from "node:assert/strict";
import {
  extractJSON,
  isMetaStep,
  filterPlan,
} from "../../src/agent/planner.js";
import type { Step } from "../../src/agent/memory.js";

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

// --- extractJSON ---
test("extractJSON: returns raw JSON from plain text", () => {
  const result = extractJSON('[{"id":1,"intent":"test"}]');
  assert.equal(result, '[{"id":1,"intent":"test"}]');
});

test("extractJSON: strips markdown code fence", () => {
  const input = '```json\n[{"id":1,"intent":"test"}]\n```';
  const result = extractJSON(input);
  assert.equal(result, '[{"id":1,"intent":"test"}]');
});

test("extractJSON: strips code fence without language", () => {
  const input = '```\n[{"id":1,"intent":"test"}]\n```';
  const result = extractJSON(input);
  assert.equal(result, '[{"id":1,"intent":"test"}]');
});

test("extractJSON: finds array in surrounding text", () => {
  const input =
    'Here is the plan:\n[{"id":1,"intent":"do something"}]\nThat is all.';
  const result = extractJSON(input);
  assert.equal(result, '[{"id":1,"intent":"do something"}]');
});

test("extractJSON: finds object in surrounding text", () => {
  const input = 'Result: {"command":"ls","risk":"low"}';
  const result = extractJSON(input);
  assert.equal(result, '{"command":"ls","risk":"low"}');
});

test("extractJSON: returns cleaned text if no JSON found", () => {
  const input = "```\njust some text\n```";
  const result = extractJSON(input);
  assert.equal(result, "just some text");
});

// --- isMetaStep ---
test('isMetaStep: detects "open a terminal"', () => {
  assert.equal(isMetaStep("open a terminal"), true);
});

test('isMetaStep: detects "open terminal"', () => {
  assert.equal(isMetaStep("open terminal"), true);
});

test('isMetaStep: detects "launch a terminal"', () => {
  assert.equal(isMetaStep("launch a terminal"), true);
});

test('isMetaStep: detects "start cmd"', () => {
  assert.equal(isMetaStep("start cmd"), true);
});

test('isMetaStep: detects "navigate to src directory"', () => {
  assert.equal(isMetaStep("navigate to src directory"), true);
});

test('isMetaStep: detects "change directory to /tmp"', () => {
  assert.equal(isMetaStep("change directory to /tmp"), true);
});

test('isMetaStep: detects "cd to project root"', () => {
  assert.equal(isMetaStep("cd to project root"), true);
});

test('isMetaStep: detects "check if docker is installed"', () => {
  assert.equal(isMetaStep("check if docker is installed"), true);
});

test('isMetaStep: detects "verify git installation"', () => {
  assert.equal(isMetaStep("verify git installation"), true);
});

test('isMetaStep: detects "open command prompt"', () => {
  assert.equal(isMetaStep("open command prompt"), true);
});

test("isMetaStep: allows legitimate docker command", () => {
  assert.equal(isMetaStep("list all running docker containers"), false);
});

test('isMetaStep: allows "check current branch"', () => {
  assert.equal(isMetaStep("check current branch"), false);
});

test('isMetaStep: allows "stage all changes"', () => {
  assert.equal(isMetaStep("stage all changes"), false);
});

test('isMetaStep: allows "push to origin main"', () => {
  assert.equal(isMetaStep("push to origin main"), false);
});

test('isMetaStep: allows "install npm dependencies"', () => {
  assert.equal(isMetaStep("install npm dependencies"), false);
});

// --- filterPlan ---
test("filterPlan: removes meta steps from plan", () => {
  const steps: Step[] = [
    { id: 1, intent: "open a terminal" },
    { id: 2, intent: "list all running containers" },
    { id: 3, intent: "verify docker is installed" },
  ];
  const result = filterPlan(steps);
  assert.equal(result.length, 1);
  assert.equal(result[0].intent, "list all running containers");
});

test("filterPlan: renumbers steps after filtering", () => {
  const steps: Step[] = [
    { id: 1, intent: "open a terminal" },
    { id: 2, intent: "list running containers" },
  ];
  const result = filterPlan(steps);
  assert.equal(result[0].id, 1);
  assert.equal(result[0].intent, "list running containers");
});

test("filterPlan: returns original if all steps are meta", () => {
  const steps: Step[] = [
    { id: 1, intent: "open a terminal" },
    { id: 2, intent: "launch shell" },
  ];
  const result = filterPlan(steps);
  assert.equal(result.length, 2);
});

test("filterPlan: leaves clean plans unchanged", () => {
  const steps: Step[] = [
    { id: 1, intent: "list running containers" },
    { id: 2, intent: "stop the database container" },
  ];
  const result = filterPlan(steps);
  assert.equal(result.length, 2);
});

// --- Summary ---
console.log(`\n  planner.test.ts — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
