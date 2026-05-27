import { callLLM } from '../llm/router.js';
import type { NlshConfig } from '../config.js';
import type { SystemContext } from '../utils/platform.js';
import type { Step, Task } from './memory.js';
import type { TerrainProfile } from '../terrain/index.js';

export interface CommandPlan {
  command: string;
  explanation: string;
  risk: 'low' | 'medium' | 'high';
  reversible: boolean;
  confidence: number;
}

const PLAN_SYSTEM_PROMPT = `You are a shell agent planner. Given a user's intent and their system context, return a JSON array of steps needed to accomplish the goal.

RULES:
- Commands execute directly in the user's current shell. Do NOT generate preamble steps like "open a terminal", "launch shell", "navigate to directory", "check if tool is installed" — the agent is already in a terminal with all context.
- The context already tells you the OS, working directory, and installed tools. Do not add steps to verify these.
- Only generate steps that DO real work toward the goal.
- Each step has only an id and an intent (plain English, not a command).
- Keep the plan lean — 1-5 steps maximum. Prefer fewer, meaningful steps.
- Use the project terrain below to make smarter, project-specific decisions (e.g. use the correct package manager, reference actual service names, match commit style).

Return ONLY valid JSON. No explanation. No markdown.
[{ "id": 1, "intent": "..." }, ...]`;

const COMMAND_SYSTEM_PROMPT = `You are a shell agent. Generate the exact shell command for the current step. Use the history of completed steps and project terrain to inform your decision.

IMPORTANT: If the step involves a "git commit", do NOT include a commit message (-m "..."). Just use bare "git commit" — the system will auto-generate a meaningful message based on the diff.
IMPORTANT: Commands run non-interactively — do NOT use the -it flag. For docker containers, use -d (detached) with a keep-alive process like "sleep infinity" if the container needs to stay running.
For interactive operations (like opening a shell inside a container), generate a command that echoes the manual command the user should run instead, e.g.: echo "Run this in another terminal: docker exec -it <container> bash"

Return ONLY valid JSON:
{
  "command": "...",
  "explanation": "...",
  "risk": "low|medium|high",
  "reversible": true|false,
  "confidence": 0.0-1.0
}`;

export function extractJSON(text: string): string {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start !== -1 && end !== -1) {
    return cleaned.slice(start, end + 1);
  }
  const braceStart = cleaned.indexOf('{');
  const braceEnd = cleaned.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd !== -1) {
    return cleaned.slice(braceStart, braceEnd + 1);
  }
  return cleaned;
}

const META_PATTERNS = [
  /open\s+(a\s+|the\s+)?(terminal|shell|cmd|powershell|command\s+prompt)/i,
  /launch\s+(a\s+)?(terminal|shell|cmd|powershell)/i,
  /start\s+(a\s+)?(terminal|shell|cmd|powershell|command)/i,
  /navigate\s+to/i,
  /change\s+directory/i,
  /cd\s+to/i,
  /check\s+if\s+.+\s+is\s+installed/i,
  /verify\s+.+\s+installation/i,
  /verify\s+.+\s+is\s+installed/i,
  /ensure\s+.+\s+is\s+installed/i,
  /check\s+if\s+(tool|command|binary|executable)/i,
  /verify\s+(installation|tool|command)/i,
];

export function isMetaStep(intent: string): boolean {
  return META_PATTERNS.some((p) => p.test(intent));
}

export function filterPlan(steps: Step[]): Step[] {
  const filtered = steps.filter((s) => !isMetaStep(s.intent));
  if (filtered.length === 0) return steps;
  // renumber
  return filtered.map((s, i) => ({ id: i + 1, intent: s.intent }));
}

function formatTerrain(terrain: TerrainProfile): string {
  const lines: string[] = ['Project terrain:'];
  if (terrain.projectName) lines.push(`- Project: ${terrain.projectName}`);
  if (terrain.stack?.length) lines.push(`- Stack: ${terrain.stack.join(', ')}`);
  if (terrain.packageManager) lines.push(`- Package manager: ${terrain.packageManager}`);
  if (terrain.scripts && Object.keys(terrain.scripts).length > 0) {
    lines.push(`- Available scripts: ${Object.keys(terrain.scripts).join(', ')}`);
  }
  if (terrain.services?.length) {
    lines.push(`- Docker services: ${terrain.services.map((s) => s.name).join(', ')}`);
  }
  if (terrain.requiredEnvVars?.length) {
    lines.push(`- Required env vars: ${terrain.requiredEnvVars.join(', ')}`);
  }
  if (terrain.commitStyle) lines.push(`- Commit style: ${terrain.commitStyle}`);
  if (terrain.currentBranch) lines.push(`- Current branch: ${terrain.currentBranch}`);
  return lines.join('\n');
}

export async function createPlan(
  intent: string,
  context: SystemContext,
  config: NlshConfig,
  terrain?: TerrainProfile
): Promise<Step[]> {
  const parts = [`Context: ${JSON.stringify(context)}`];
  if (terrain) parts.push(formatTerrain(terrain));
  parts.push(`Intent: ${intent}`);
  const userMessage = parts.join('\n\n');

  const raw = await callLLM(
    [{ role: 'user', content: userMessage }],
    PLAN_SYSTEM_PROMPT,
    config
  );

  const json = extractJSON(raw);

  try {
    const steps = JSON.parse(json) as Step[];
    if (!Array.isArray(steps)) throw new Error('Response is not an array');
    return filterPlan(steps);
  } catch (err) {
    throw new Error(`Failed to parse plan from LLM response: ${(err as Error).message}\nRaw: ${raw}`);
  }
}

export async function generateCommand(
  task: Task,
  step: Step,
  config: NlshConfig
): Promise<CommandPlan> {
  const userMessage = `Full task state: ${JSON.stringify(task)}\nCurrent step intent: ${step.intent}`;

  const raw = await callLLM(
    [{ role: 'user', content: userMessage }],
    COMMAND_SYSTEM_PROMPT,
    config
  );

  const json = extractJSON(raw);

  try {
    const cmd = JSON.parse(json) as CommandPlan;
    if (!cmd.command) throw new Error('No command field in response');
    return cmd;
  } catch (err) {
    throw new Error(`Failed to parse command from LLM response: ${(err as Error).message}\nRaw: ${raw}`);
  }
}
