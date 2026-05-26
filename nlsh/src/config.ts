import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

export type Provider = 'groq' | 'gemini';

export interface NlshConfig {
  provider: Provider;
  model: string;
  apiKey: string;
}

const PROVIDER_ENV_VARS: Record<Provider, string> = {
  groq: 'GROQ_API_KEY',
  gemini: 'GEMINI_API_KEY',
};

const DEFAULT_MODELS: Record<Provider, string> = {
  groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-2.0-flash',
};

const CONFIG_DIR = join(homedir(), '.nlsh');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: NlshConfig = {
  provider: 'groq',
  model: 'llama-3.3-70b-versatile',
  apiKey: '',
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
  if (!existsSync(CONFIG_PATH)) {
    const provider: Provider = 'groq';
    const envKey = process.env[PROVIDER_ENV_VARS[provider]] || '';
    return { provider, model: DEFAULT_MODELS[provider], apiKey: envKey };
  }
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const saved = JSON.parse(raw) as Partial<NlshConfig>;
    const provider: Provider = saved.provider === 'gemini' ? 'gemini' : 'groq';
    const envVar = PROVIDER_ENV_VARS[provider];
    const envKey = process.env[envVar] || '';
    return {
      provider,
      model: saved.model || DEFAULT_MODELS[provider],
      apiKey: envKey || saved.apiKey || '',
    };
  } catch {
    const provider: Provider = 'groq';
    const envKey = process.env[PROVIDER_ENV_VARS[provider]] || '';
    return { provider, model: DEFAULT_MODELS[provider], apiKey: envKey };
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

  const providerRaw = await readLine('  Provider (groq/gemini) [groq]: ');
  const provider: Provider = providerRaw === 'gemini' ? 'gemini' : 'groq';
  const defaultModel = DEFAULT_MODELS[provider];
  const model = await readLine(`  Model [${defaultModel}]: `);
  const apiKey = await readLine('  API key: ');

  const config: NlshConfig = {
    provider,
    model: model || defaultModel,
    apiKey: apiKey || '',
  };

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  console.log('');
  console.log(`  ✓ Saved to ~/.nlsh/config.json`);
  console.log('');

  return config;
}
