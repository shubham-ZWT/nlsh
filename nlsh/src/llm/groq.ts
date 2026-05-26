export interface GroqOptions {
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
}

const BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GroqChoice {
  message: { content: string };
}

interface GroqResponse {
  choices?: GroqChoice[];
}

export async function callGroq(
  messages: GroqMessage[],
  systemPrompt: string | undefined,
  { apiKey, model, signal }: GroqOptions
): Promise<string> {
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not configured. Run `nlsh setup` first.');
  }

  const body = {
    model: model || 'llama-3.3-70b-versatile',
    messages: [
      ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
      ...messages,
    ],
    temperature: 0.1,
    max_tokens: 4096,
  };

  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Groq API error (${response.status}): ${text}`);
  }

  const data = (await response.json()) as GroqResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Groq returned empty response');
  }

  return content;
}
