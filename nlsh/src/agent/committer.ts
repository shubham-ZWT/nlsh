import { executeCommand } from './executor.js';
import { callLLM } from '../llm/router.js';
import type { NlshConfig } from '../config.js';
import type { Task } from './memory.js';

const MAX_DIFF_LENGTH = 8000;

const COMMIT_SYSTEM_PROMPT = `You are a commit message generator. Given a git diff and project context, generate a concise, meaningful commit message.

RULES:
- First line: max 72 characters, capitalized, no trailing period
- If commit style is "conventional" use: type(scope): description
- If commit style is "plain" use: Short imperative description
- Follow the existing style from the project's recent commit history
- Be specific about what changed and why
- Return ONLY the commit message text. No quotes. No explanation. No markdown.`;

export function isCommitCommand(command: string): boolean {
  const c = command.trim().toLowerCase();
  return /\bgit\s+commit\b/.test(c) && !/\bgit\s+commit\s+--allow-empty/.test(c);
}

export function injectCommitMessage(command: string, message: string): string {
  const escaped = message.replace(/"/g, '\\"');
  const replacement = `git commit -m "${escaped}"`;
  // 1) If already has -m "..." — replace the message
  let result = command.replace(/git\s+commit\s+-m\s+"[^"]*"/gi, replacement);
  // 2) Otherwise replace bare `git commit` (with optional flags, preserving trailing && ; || or EOL)
  if (result === command) {
    result = command.replace(
      /git\s+commit(?:\s+--?\w+)*(\s*$|\s+(&&|[;|]|&|;)\s*|$)/gi,
      (_, trailing) => `${replacement}${trailing || ''}`,
    );
  }
  return result;
}

export async function captureDiff(): Promise<string> {
  // Try combined diff (all changes vs HEAD) — covers `git add . && git commit` flow
  const head = await executeCommand('git diff HEAD');
  if (head.stdout.trim()) return head.stdout.slice(0, MAX_DIFF_LENGTH);
  // Fall back to staged (for `git commit` without add)
  const staged = await executeCommand('git diff --cached');
  if (staged.stdout.trim()) return staged.stdout.slice(0, MAX_DIFF_LENGTH);
  // Last: unstaged only
  const unstaged = await executeCommand('git diff');
  if (unstaged.stdout.trim()) return unstaged.stdout.slice(0, MAX_DIFF_LENGTH);
  return '';
}

export async function generateCommitMessage(
  diff: string,
  task: Task,
  config: NlshConfig,
): Promise<string> {
  const terrain = task.terrain || {};
  const commitStyle = (terrain as Record<string, unknown>).commitStyle || 'plain';
  const currentBranch = (terrain as Record<string, unknown>).currentBranch || 'unknown';
  const context = `Current branch: ${currentBranch}\nCommit style: ${commitStyle}\nIntent: ${task.originalIntent}`;

  const messages = [
    {
      role: 'user' as const,
      content: `Project context:\n${context}\n\ngit diff:\n\`\`\`diff\n${diff}\n\`\`\``,
    },
  ];

  const response = await callLLM(messages, COMMIT_SYSTEM_PROMPT, config);
  return response.trim().replace(/^["']|["']$/g, '');
}
