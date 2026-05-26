import { callGroq } from './groq.js';
import { callGemini } from './gemini.js';
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
  switch (config.provider) {
    case 'gemini':
      return callGemini(messages, systemPrompt, config);
    case 'groq':
    default:
      return callGroq(messages, systemPrompt, config);
  }
}
