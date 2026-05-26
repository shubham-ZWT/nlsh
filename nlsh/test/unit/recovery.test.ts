import assert from 'node:assert/strict';

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

// --- Recovery prompt template and response parsing ---
// We test the expected JSON shape that the LLM should return

const VALID_RECOVERY = `{
  "diagnosis": "Remote has 2 commits you don't have. Your branch has diverged.",
  "canContinue": true,
  "revisedRemainingSteps": [
    { "id": 4, "intent": "fetch latest from origin" },
    { "id": 5, "intent": "rebase your commits on top" },
    { "id": 6, "intent": "push again with force lease" }
  ]
}`;

const UNRECOVERABLE = `{
  "diagnosis": "The file does not exist and cannot be created.",
  "canContinue": false,
  "revisedRemainingSteps": []
}`;

function extractJSON(text: string): string {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const braceStart = cleaned.indexOf('{');
  const braceEnd = cleaned.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd !== -1) {
    return cleaned.slice(braceStart, braceEnd + 1);
  }
  return cleaned;
}

interface RecoveryResult {
  diagnosis: string;
  canContinue: boolean;
  revisedRemainingSteps: { id: number; intent: string }[];
}

function parseRecovery(raw: string): RecoveryResult {
  const json = extractJSON(raw);
  const result = JSON.parse(json) as RecoveryResult;
  if (!result.diagnosis) throw new Error('Missing diagnosis');
  return result;
}

test('parseRecovery: extracts diagnosis from valid response', () => {
  const result = parseRecovery(VALID_RECOVERY);
  assert.equal(result.diagnosis.includes("Remote has 2 commits"), true);
});

test('parseRecovery: canContinue is true for recoverable failure', () => {
  const result = parseRecovery(VALID_RECOVERY);
  assert.equal(result.canContinue, true);
});

test('parseRecovery: canContinue is false for unrecoverable failure', () => {
  const result = parseRecovery(UNRECOVERABLE);
  assert.equal(result.canContinue, false);
});

test('parseRecovery: parses revised steps', () => {
  const result = parseRecovery(VALID_RECOVERY);
  assert.equal(result.revisedRemainingSteps.length, 3);
  assert.equal(result.revisedRemainingSteps[0].intent, 'fetch latest from origin');
});

test('parseRecovery: handles markdown code fence', () => {
  const withFence = '```json\n' + VALID_RECOVERY + '\n```';
  const result = parseRecovery(withFence);
  assert.equal(result.canContinue, true);
});

test('parseRecovery: throws on missing diagnosis', () => {
  const bad = '{"canContinue": false, "revisedRemainingSteps": []}';
  assert.throws(() => parseRecovery(bad), /Missing diagnosis/);
});

test('parseRecovery: revisedRemainingSteps can be empty when cannot continue', () => {
  const result = parseRecovery(UNRECOVERABLE);
  assert.equal(result.revisedRemainingSteps.length, 0);
});

console.log(`\n  recovery.test.ts — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
