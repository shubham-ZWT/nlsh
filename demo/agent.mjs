import { runAgent } from '../nlsh/dist/agent/index.js';
import { getConfig } from '../nlsh/dist/config.js';
import { collectContext } from '../nlsh/dist/utils/platform.js';
import { ensureTerrain } from '../nlsh/dist/terrain/index.js';
import { stdin, stdout } from 'node:process';

function write(chunk) {
  return new Promise((resolve) => stdout.write(chunk, resolve));
}

function ctrl(msg) {
  process.stderr.write(JSON.stringify(msg) + '\n');
}

let _stdinBuffer = '';
let _stdinResolve = null;

function onStdinData(chunk) {
  _stdinBuffer += chunk.toString();
  while (_stdinBuffer.includes('\n')) {
    const nl = _stdinBuffer.indexOf('\n');
    const line = _stdinBuffer.slice(0, nl).trim();
    _stdinBuffer = _stdinBuffer.slice(nl + 1);
    if (_stdinResolve) {
      const r = _stdinResolve;
      _stdinResolve = null;
      r(line);
    }
  }
}

stdin.on('data', onStdinData);

function readLine() {
  return new Promise((resolve) => {
    _stdinResolve = resolve;
  });
}

class DemoController {
  constructor(intent) {
    this.state = {
      phase: 'planning', intent, plan: [], steps: [],
      currentStepIndex: 0, commandOutput: '', startTime: Date.now(),
      terrainDetails: [], safetyWarnings: [], fullYesRequired: false,
      dryRun: false, currentCommand: undefined, diagnosis: undefined,
      revisedPlan: undefined, error: undefined,
    };
    this._stepCount = 0;
  }

  update(partial) {
    const prev = this.state.phase;
    const hadCmd = !!this.state.currentCommand;
    Object.assign(this.state, partial);
    if (this.state.phase !== prev) {
      this._onPhaseChange(prev, this.state.phase);
    } else if (this.state.phase === 'running' && partial.currentCommand) {
      this._renderCommand(this.state);
    }
  }

  appendOutput(text) {
    this.state.commandOutput += text;
    write(text);
  }

  clearOutput() { this.state.commandOutput = ''; }
  setSteps(steps) { this.state.steps = steps; this._stepCount = steps.length; }

  updateStep(id, updates) {
    const step = this.state.steps.find((s) => s.id === id);
    if (!step) return;
    const prevStatus = step.status;
    Object.assign(step, updates);

    if (updates.status === 'executing' && prevStatus !== 'executing') {
      write(`  \x1b[36m\u25B6\x1b[0m ${step.intent}  \x1b[2m[${id}/${this._stepCount}]\x1b[0m\n`);
      if (step.command) write(`  \x1b[2m$ ${step.command}\x1b[0m\n`);
    } else if (updates.status === 'completed') {
      write(`  \x1b[32m\u2713\x1b[0m ${step.intent}\n`);
    } else if (updates.status === 'failed') {
      write(`  \x1b[31m\u2717\x1b[0m ${step.intent}\n`);
    } else if (updates.status === 'skipped') {
      write(`  \x1b[2m\u2713 ${step.intent} (skipped)\x1b[0m\n`);
    }
  }

  async waitForInput() {
    const line = await readLine();
    return line.toLowerCase() || 'y';
  }

  get inputProgress() { return ''; }

  _onPhaseChange(prev, phase) {
    const s = this.state;
    switch (phase) {
      case 'planning':
        write(`\x1b[36m\u25C7\x1b[0m Analyzing intent...\n`);
        for (const d of s.terrainDetails) write(`  \x1b[32m\u2713\x1b[0m ${d}\n`);
        break;

      case 'approving':
        write(`\n  \x1b[1mplan\x1b[0m\x1b[2m for \x1b[0m\x1b[1m${s.intent}\x1b[0m\n`);
        for (const step of s.plan) {
          write(`  \x1b[2m${step.id}.\x1b[0m ${step.intent}\n`);
        }
        ctrl({ type: 'input', prompt: '[Y] Run this plan   [n] Cancel' });
        break;

      case 'running':
        if (s.currentCommand) this._renderCommand(s);
        break;

      case 'recovering':
        write(`\n  \x1b[31;1m\u2717 Step Failed\x1b[0m\n`);
        const failed = s.steps.find((st) => st.status === 'failed');
        if (failed) write(`  \x1b[1m${failed.intent}\x1b[0m\n`);
        if (s.diagnosis) write(`  \x1b[2m${s.diagnosis}\x1b[0m\n`);
        if (s.revisedPlan?.length) {
          write(`  \x1b[1mRevised plan:\x1b[0m\n`);
          for (const st of s.revisedPlan) {
            write(`    \x1b[36m\u2192\x1b[0m ${st.intent}\n`);
          }
          ctrl({ type: 'input', prompt: '[Y] Run revised plan   [n] Abort' });
        } else {
          ctrl({ type: 'done', failed: true, message: s.error || 'Task failed' });
        }
        break;

      case 'done':
        ctrl({ type: 'done' });
        break;

      case 'failed':
        ctrl({ type: 'done', failed: true, message: s.error || 'Task failed' });
        break;
    }
  }

  _renderCommand(s) {
    const cmd = s.currentCommand;
    write(`\n  \x1b[2m$ \x1b[0m\x1b[36;1m${cmd.command}\x1b[0m\n`);
    if (cmd.explanation) write(`  \x1b[2m${cmd.explanation}\x1b[0m\n`);
    const rc = cmd.risk === 'high' ? '31' : cmd.risk === 'medium' ? '33' : '32';
    write(`  Risk: \x1b[${rc}m${(cmd.risk || 'LOW').toUpperCase()}\x1b[0m`);
    write(`   Reversible: \x1b[${cmd.reversible ? '32' : '31'}m${cmd.reversible ? 'YES' : 'NO'}\x1b[0m`);
    write(`   Conf: \x1b[${cmd.confidence >= 0.75 ? '32' : '33'}m${Math.round(cmd.confidence * 100)}%\x1b[0m\n`);
    for (const w of s.safetyWarnings) write(`  \x1b[33m\u26A0 ${w}\x1b[0m\n`);
    const prompt = s.fullYesRequired
      ? 'Type "yes" to confirm   [n] Abort'
      : '[Y] Run   [n] Skip   [e] Edit';
    ctrl({ type: 'input', prompt });
  }
}

async function main() {
  const intent = process.argv.slice(2).join(' ');
  if (!intent) {
    ctrl({ type: 'error', message: 'No intent provided' });
    process.exit(1);
  }

  const config = getConfig();
  if (!config.apiKey) {
    ctrl({ type: 'error', message: 'No API key configured. Run `nlsh setup` first.' });
    process.exit(1);
  }

  const controller = new DemoController(intent);
  const context = collectContext();

  let terrain = null;
  try {
    terrain = await ensureTerrain(context.cwd);
    if (terrain) {
      const details = [];
      if (terrain.stack?.length) details.push(terrain.stack.join(', '));
      if (terrain.services?.length) details.push(`${terrain.services.length} service(s)`);
      if (terrain.requiredEnvVars?.length) details.push(`${terrain.requiredEnvVars.length} env var(s)`);
      controller.state.terrainDetails = details;
    }
  } catch {}

  await runAgent(intent, context, config, controller, terrain ?? undefined);
}

main().catch((err) => {
  ctrl({ type: 'error', message: err.message });
  process.exit(1);
});
