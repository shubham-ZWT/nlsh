import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface HistoryEntry {
  timestamp: string;
  originalIntent: string;
  command: string;
  exitCode: number;
  risk: string;
  duration: number;
}

const HISTORY_DIR = join(homedir(), '.nlsh');
const HISTORY_FILE = join(HISTORY_DIR, 'history.json');

function ensureDir(): void {
  if (!existsSync(HISTORY_DIR)) {
    mkdirSync(HISTORY_DIR, { recursive: true });
  }
}

export function addEntry(entry: HistoryEntry): void {
  ensureDir();
  const entries = getAllEntries();
  entries.unshift(entry);
  const max = parseInt(process.env.NLSH_HISTORY_MAX || '500', 10);
  if (entries.length > max) {
    entries.length = max;
  }
  writeFileSync(HISTORY_FILE, JSON.stringify(entries, null, 2), 'utf-8');
}

export function getAllEntries(): HistoryEntry[] {
  if (!existsSync(HISTORY_FILE)) return [];
  try {
    const raw = readFileSync(HISTORY_FILE, 'utf-8');
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

export function getRecentEntries(limit = 20): HistoryEntry[] {
  return getAllEntries().slice(0, limit);
}

export function printHistory(limit = 20): void {
  const entries = getRecentEntries(limit);
  if (entries.length === 0) {
    console.log('  No history entries yet.');
    return;
  }

  console.log('');
  console.log('  nlsh history (last ' + entries.length + ' entries)');
  console.log('  ───────────────────────────────────────');
  console.log('');

  for (const entry of entries) {
    const date = new Date(entry.timestamp);
    const time = date.toLocaleTimeString();
    const status = entry.exitCode === 0 ? '✓' : '✗';
    console.log(`  ${status} [${time}] ${entry.command}`);
    console.log(`      Intent: ${entry.originalIntent}`);
    if (entry.risk !== 'low') {
      console.log(`      Risk: ${entry.risk.toUpperCase()}  |  Duration: ${entry.duration}ms`);
    }
    console.log('');
  }
}
