import { callGroq } from './groq.js';
import type { NlshConfig } from '../config.js';

interface RouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function callLLM(
  messages: RouterMessage[],
  systemPrompt: string | undefined,
  config: NlshConfig
): Promise<string> {
  return callGroq(messages, systemPrompt, config);
}
