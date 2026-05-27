import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

export interface NlshConfig {
  apiKey: string;
  model?: string;
}

const CONFIG_DIR = join(homedir(), '.nlsh');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: NlshConfig = {
  apiKey: '',
  model: 'llama-3.3-70b-versatile',
};

function readLine(query: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(query, (answer: string) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function getConfig(): NlshConfig {
  const envKey = process.env.GROQ_API_KEY || '';
  if (!existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG, apiKey: envKey };
  }
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const saved = JSON.parse(raw) as Partial<NlshConfig>;
    return {
      apiKey: envKey || saved.apiKey || '',
      model: saved.model || DEFAULT_CONFIG.model,
    };
  } catch {
    return { ...DEFAULT_CONFIG, apiKey: envKey };
  }
}

export async function setupWizard(): Promise<NlshConfig> {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  console.log('');
  console.log('  nlsh setup');
  console.log('  ───────────');
  console.log('');
  console.log('  Using Groq (llama-3.3-70b-versatile)');
  console.log('  Get a free API key at https://console.groq.com');
  console.log('');

  const apiKey = await readLine('  API key: ');

  const config: NlshConfig = {
    apiKey: apiKey || '',
    model: 'llama-3.3-70b-versatile',
  };

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  console.log('');
  console.log(`  ✓ Saved to ~/.nlsh/config.json`);
  console.log('');

  return config;
}
