import { callLLM } from '../llm/router.js';
import type { NlshConfig } from '../config.js';
import type { Task, Step } from './memory.js';
import type { ExecResult } from './executor.js';

export interface RecoveryResult {
  diagnosis: string;
  canContinue: boolean;
  revisedRemainingSteps: Step[];
}

const RECOVERY_SYSTEM_PROMPT = `You are a shell agent debugger. A step failed. Analyze why and return a revised plan for the remaining steps.

Return ONLY valid JSON:
{
  "diagnosis": "plain English explanation of what went wrong",
  "canContinue": true|false,
  "revisedRemainingSteps": [{ "id": N, "intent": "..." }, ...]
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

export async function analyzeFailure(
  task: Task,
  failedStep: Step,
  errorOutput: ExecResult,
  config: NlshConfig
): Promise<RecoveryResult> {
  const userMessage =
    `Full task state including history: ${JSON.stringify(task)}\n` +
    `Failed step: ${JSON.stringify(failedStep)}\n` +
    `Error output: ${JSON.stringify({
      stdout: errorOutput.stdout,
      stderr: errorOutput.stderr,
      all: errorOutput.all,
      exitCode: errorOutput.exitCode,
    })}`;

  const raw = await callLLM(
    [{ role: 'user', content: userMessage }],
    RECOVERY_SYSTEM_PROMPT,
    config
  );

  const json = extractJSON(raw);

  try {
    const result = JSON.parse(json) as RecoveryResult;
    if (!result.diagnosis) throw new Error('Missing diagnosis');
    return result;
  } catch (err) {
    throw new Error(
      `Failed to parse recovery response: ${(err as Error).message}\nRaw: ${raw}`
    );
  }
}
