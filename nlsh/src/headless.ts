import { createPlan, generateCommand } from './agent/planner.js';
import { executeCommand } from './agent/executor.js';
import { createTask, updateTask, saveTask } from './agent/memory.js';
import { analyzeFailure } from './agent/recovery.js';
import { checkSafety } from './agent/safety.js';
import { isCommitCommand, captureDiff, generateCommitMessage, injectCommitMessage } from './agent/committer.js';
import { addEntry } from './history/index.js';
import { openEditor } from './utils/editor.js';
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import type { NlshConfig } from './config.js';
import type { SystemContext } from './utils/platform.js';
import type { TerrainProfile } from './terrain/index.js';
import type { Task, Step, StepRecord } from './agent/memory.js';

export async function runHeadless(
  intent: string,
  context: SystemContext,
  config: NlshConfig,
  terrain?: TerrainProfile
): Promise<Task> {
  const q = (prompt: string): Promise<string> =>
    new Promise((resolve) => {
      const rl = createInterface({ input: stdin, output: stdout });
      rl.question(prompt, (a) => {
        rl.close();
        resolve(a.trim().toLowerCase() || 'y');
      });
    });

  const task = createTask(intent, context);
  if (terrain) task.terrain = terrain as unknown as Record<string, unknown>;

  console.log(`\n  intent: ${intent}\n`);

  try {
    const plan = await createPlan(intent, context, config, terrain ?? undefined);
    task.plan = plan;
    task.status = 'running';
    saveTask(task);

    console.log('  plan:');
    for (const s of plan) console.log(`    ${s.id}. ${s.intent}`);
    const ok = await q('\n  [Y] Run this plan   [n] Cancel  ');
    if (ok !== 'y') {
      task.status = 'failed';
      saveTask(task);
      console.log('  cancelled');
      return task;
    }

    while (task.currentStep <= plan.length) {
      const step = plan.find((s) => s.id === task.currentStep);
      if (!step) { task.currentStep++; continue; }

      const cmd = await generateCommand(task, step, config);

      if (isCommitCommand(cmd.command)) {
        const diff = await captureDiff();
        if (diff) {
          try {
            const msg = await generateCommitMessage(diff, task, config);
            cmd.command = injectCommitMessage(cmd.command, msg);
          } catch {}
        }
      }

      const safety = checkSafety(cmd.command, cmd.risk, cmd.reversible, cmd.confidence);
      if (safety.blocked) {
        console.log(`  blocked: ${safety.blockReason}`);
        task.status = 'failed';
        saveTask(task);
        return task;
      }

      console.log(`\n  $ ${cmd.command}`);
      if (cmd.explanation) console.log(`  ${cmd.explanation}`);
      for (const w of safety.warnings) console.log(`  \u26A0 ${w}`);

      const input = await q(`  [Y] Run   [n] Skip   [e] Edit  `);
      if (input === 'n') {
        const record: StepRecord = { stepId: step.id, intent: step.intent, command: cmd.command, stdout: '', stderr: '', exitCode: -1, failed: false, timedOut: false, duration: Date.now() };
        updateTask(task, record);
        saveTask(task);
        continue;
      }
      if (input === 'e') {
        const modified = await openEditor(cmd.command);
        if (modified !== cmd.command) {
          cmd.command = modified;
          cmd.explanation += ' [edited]';
        }
      }

      const result = await executeCommand(cmd.command, { onData: (chunk) => stdout.write(chunk) });

      const record: StepRecord = { stepId: step.id, intent: step.intent, command: cmd.command, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, failed: result.failed, timedOut: result.timedOut, duration: result.duration };
      updateTask(task, record);
      saveTask(task);

      addEntry({ timestamp: new Date().toISOString(), originalIntent: intent, command: cmd.command, exitCode: result.exitCode, risk: cmd.risk, duration: result.duration });

      if (result.exitCode === 0) {
        console.log(`  \u2713 ${step.intent}`);
      } else {
        console.log(`  \u2717 ${step.intent}`);
        task.status = 'recovering';
        task.recoveryAttempts++;
        saveTask(task);

        const recovery = await analyzeFailure(task, step, result, config);
        if (recovery.canContinue && recovery.revisedRemainingSteps.length > 0) {
          console.log(`\n  ${recovery.diagnosis}`);
          console.log('  Revised plan:');
          for (const s of recovery.revisedRemainingSteps) console.log(`    \u2192 ${s.intent}`);
          const rOk = await q('\n  [Y] Run revised plan   [n] Abort  ');
          if (rOk !== 'y') {
            task.status = 'failed';
            saveTask(task);
            return task;
          }
          const completedSteps = task.history.map((h) => h.stepId);
          task.plan = [...task.plan.filter((s) => completedSteps.includes(s.id)), ...recovery.revisedRemainingSteps];
          task.currentStep = recovery.revisedRemainingSteps[0]?.id ?? task.currentStep;
          task.status = 'running';
          saveTask(task);
          plan.length = 0;
          plan.push(...task.plan);
          continue;
        } else {
          task.status = 'failed';
          saveTask(task);
          return task;
        }
      }
    }

    task.status = 'done';
    saveTask(task);
    return task;
  } finally {} // rl cleaned up on process exit
}
