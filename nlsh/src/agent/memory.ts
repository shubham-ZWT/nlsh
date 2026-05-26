import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { v4 as uuid } from 'uuid';
import type { SystemContext } from '../utils/platform.js';

export interface Step {
  id: number;
  intent: string;
}

export interface StepRecord {
  stepId: number;
  intent: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  failed: boolean;
  timedOut: boolean;
  duration: number;
}

export interface Task {
  id: string;
  originalIntent: string;
  context: SystemContext;
  plan: Step[];
  currentStep: number;
  history: StepRecord[];
  status: 'planning' | 'running' | 'recovering' | 'done' | 'failed';
  recoveryAttempts: number;
  terrain?: Record<string, unknown>;
  [key: string]: unknown;
}

const TASKS_DIR = join(homedir(), '.nlsh', 'tasks');

function ensureTasksDir(): void {
  if (!existsSync(TASKS_DIR)) {
    mkdirSync(TASKS_DIR, { recursive: true });
  }
}

export function createTask(intent: string, context: SystemContext): Task {
  return {
    id: uuid(),
    originalIntent: intent,
    context,
    plan: [],
    currentStep: 1,
    history: [],
    status: 'planning',
    recoveryAttempts: 0,
  };
}

export function updateTask(
  task: Task,
  record: StepRecord
): void {
  task.history.push(record);
  task.currentStep = record.stepId + 1;
}

export function saveTask(task: Task): void {
  ensureTasksDir();
  const path = join(TASKS_DIR, `${task.id}.json`);
  writeFileSync(path, JSON.stringify(task, null, 2), 'utf-8');
}

export function loadTask(id: string): Task | null {
  const path = join(TASKS_DIR, `${id}.json`);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as Task;
  } catch {
    return null;
  }
}
