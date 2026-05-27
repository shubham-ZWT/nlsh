import type { NlshConfig } from '../config.js';
import type { SystemContext } from '../utils/platform.js';
import { createPlan, generateCommand } from './planner.js';
import { executeCommand } from './executor.js';
import { createTask, updateTask, saveTask } from './memory.js';
import { analyzeFailure } from './recovery.js';
import { checkSafety } from './safety.js';
import { isCommitCommand, captureDiff, generateCommitMessage, injectCommitMessage } from './committer.js';
import { addEntry } from '../history/index.js';
import type { TerrainProfile } from '../terrain/index.js';
import type { Task, Step, StepRecord } from './memory.js';
import type { TuiController } from '../ui/index.js';
import { openEditor } from '../utils/editor.js';

export async function runAgent(
  intent: string,
  context: SystemContext,
  config: NlshConfig,
  controller: TuiController,
  terrain?: TerrainProfile
): Promise<Task> {
  const task = createTask(intent, context);
  if (terrain) task.terrain = terrain as unknown as Record<string, unknown>;
  const dryRun = controller.state.dryRun;

  // --- Plan ---
  controller.update({ phase: 'planning' });
  controller.setSteps([]);
  let plan: Step[];
  try {
    plan = await createPlan(intent, context, config, terrain ?? undefined);
  } catch (err) {
    controller.update({ phase: 'failed', error: `Failed to create plan: ${(err as Error).message}` });
    task.status = 'failed';
    saveTask(task);
    return task;
  }

  task.plan = plan;
  task.status = 'running';
  saveTask(task);

  const steps = plan.map((s) => ({
    id: s.id,
    intent: s.intent,
    status: 'pending' as const,
  }));
  controller.setSteps(steps);

  // --- Approve plan ---
  controller.update({ phase: 'approving', plan });
  const approve = await controller.waitForInput();
  if (approve !== 'y') {
    task.status = 'failed';
    saveTask(task);
    controller.update({ phase: 'failed', error: 'Plan cancelled by user' });
    return task;
  }

  // --- Execute steps ---
  while (task.currentStep <= plan.length) {
    const step = plan.find((s) => s.id === task.currentStep);
    if (!step) {
      task.currentStep++;
      continue;
    }

    controller.clearOutput();
    controller.updateStep(step.id, { status: 'confirming' });

    // Generate command
    let cmd;
    try {
      cmd = await generateCommand(task, step, config);
    } catch (err) {
      controller.updateStep(step.id, { status: 'failed' });
      controller.update({ phase: 'failed', error: `Failed to generate command: ${(err as Error).message}` });
      task.status = 'failed';
      saveTask(task);
      break;
    }

    // --- Commit message generation for git commit steps ---
    if (isCommitCommand(cmd.command)) {
      const diff = await captureDiff();
      if (diff) {
        try {
          const commitMsg = await generateCommitMessage(diff, task, config);
          cmd.command = injectCommitMessage(cmd.command, commitMsg);
          cmd.explanation += `\nCommit message: ${commitMsg}`;
        } catch {
          // LLM call failed, proceed with original command
        }
      }
    }

    // --- Safety check ---
    const safety = checkSafety(cmd.command, cmd.risk, cmd.reversible, cmd.confidence);
    if (safety.blocked) {
      controller.updateStep(step.id, { status: 'failed', command: cmd.command });
      controller.update({
        phase: 'failed',
        error: `Command blocked: ${safety.blockReason}`,
        safetyWarnings: [],
        fullYesRequired: false,
      });
      task.status = 'failed';
      saveTask(task);
      break;
    }

    controller.updateStep(step.id, {
      command: cmd.command,
      explanation: cmd.explanation,
      risk: cmd.risk,
      reversible: cmd.reversible,
      confidence: cmd.confidence,
    });
    controller.update({
      phase: 'running',
      currentCommand: cmd,
      safetyWarnings: safety.warnings,
      fullYesRequired: safety.fullYesRequired,
    });

    // Await command confirmation
    const cmdInput = await controller.waitForInput();
    const wasFullYes = controller.state.fullYesRequired;
    controller.update({ fullYesRequired: false });

    if (cmdInput === 'n') {
      if (wasFullYes) {
        // User aborted a high-risk/irreversible command — stop everything
        controller.updateStep(step.id, { status: 'failed' });
        controller.update({ phase: 'failed', error: 'Execution aborted by user' });
        task.status = 'failed';
        saveTask(task);
        break;
      }
      controller.updateStep(step.id, { status: 'skipped' });
      const record: StepRecord = {
        stepId: step.id,
        intent: step.intent,
        command: cmd.command,
        stdout: '',
        stderr: '',
        exitCode: -1,
        failed: false,
        timedOut: false,
        duration: Date.now(),
      };
      updateTask(task, record);
      saveTask(task);
      continue;
    }

    if (cmdInput === 'e') {
      controller.updateStep(step.id, { status: 'confirming' });
      const modified = await openEditor(cmd.command);
      if (modified !== cmd.command) {
        cmd.command = modified;
        cmd.explanation += ' [edited]';
        controller.updateStep(step.id, { command: modified });
        controller.update({ currentCommand: cmd });
      }
    }

    // Execute (or skip in dry run)
    controller.clearOutput();
    controller.updateStep(step.id, { status: 'executing' });

    let result;
    if (dryRun) {
      // Simulate a successful dry-run result
      controller.appendOutput('[DRY RUN — not executed]\n');
      result = {
        stdout: '[DRY RUN — not executed]\n',
        stderr: '',
        all: '[DRY RUN — not executed]\n',
        exitCode: 0,
        failed: false,
        timedOut: false,
        duration: Date.now(),
      };
    } else {
      result = await executeCommand(cmd.command, {
        onData: (chunk) => controller.appendOutput(chunk),
      });
    }

    const record: StepRecord = {
      stepId: step.id,
      intent: step.intent,
      command: cmd.command,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      failed: result.failed,
      timedOut: result.timedOut,
      duration: result.duration,
    };

    updateTask(task, record);
    saveTask(task);

    // Log to user history
    addEntry({
      timestamp: new Date().toISOString(),
      originalIntent: intent,
      command: cmd.command,
      exitCode: result.exitCode,
      risk: cmd.risk,
      duration: result.duration,
    });

    if (result.exitCode === 0) {
      controller.updateStep(step.id, { status: 'completed', output: result.stdout });
    } else {
      controller.updateStep(step.id, { status: 'failed', output: result.stderr || result.stdout });

      // --- Recovery ---
      task.status = 'recovering';
      task.recoveryAttempts++;
      saveTask(task);

      try {
        const recovery = await analyzeFailure(task, step, result, config);

        if (recovery.canContinue && recovery.revisedRemainingSteps.length > 0) {
          controller.update({
            phase: 'recovering',
            diagnosis: recovery.diagnosis,
            revisedPlan: recovery.revisedRemainingSteps,
          });
          const recoveryInput = await controller.waitForInput();
          if (recoveryInput !== 'y') {
            task.status = 'failed';
            saveTask(task);
            controller.update({ phase: 'failed', error: 'Recovery cancelled by user' });
            break;
          }

          const completedSteps = task.history.map((h) => h.stepId);
          task.plan = [
            ...task.plan.filter((s) => completedSteps.includes(s.id)),
            ...recovery.revisedRemainingSteps,
          ];
          task.currentStep = recovery.revisedRemainingSteps[0]?.id ?? task.currentStep;
          task.status = 'running';
          saveTask(task);

          plan = task.plan;
          controller.update({ phase: 'running', currentStepIndex: task.currentStep - 1 });
          continue;
        } else {
          controller.update({ phase: 'failed', error: recovery.diagnosis || 'Recovery cannot continue' });
          task.status = 'failed';
          saveTask(task);
          break;
        }
      } catch (recoveryErr) {
        controller.update({ phase: 'failed', error: `Recovery analysis failed: ${(recoveryErr as Error).message}` });
        task.status = 'failed';
        saveTask(task);
        break;
      }
    }
  }

  if (task.status === 'running') {
    task.status = 'done';
    saveTask(task);
  }

  const finalPhase = task.status === 'done' ? 'done' : 'failed';
  controller.update({ phase: finalPhase, commandOutput: '' });

  return task;
}
