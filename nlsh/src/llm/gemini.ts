export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmOptions {
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
}

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiContent {
  parts: { text: string }[];
  role?: string;
}

interface GeminiCandidate {
  content: GeminiContent;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

export async function callGemini(
  messages: LlmMessage[],
  systemPrompt: string | undefined,
  { apiKey, model, signal }: LlmOptions
): Promise<string> {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured. Run `nlsh setup` first.');
  }

  const modelName = model || 'gemini-2.0-flash';
  const url = `${BASE_URL}/${modelName}:generateContent?key=${apiKey}`;

  const contents: GeminiContent[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      // system messages handled separately below
      continue;
    }
    contents.push({
      parts: [{ text: msg.content }],
      role: msg.role === 'assistant' ? 'model' : 'user',
    });
  }

  const body: Record<string, unknown> = { contents };

  if (systemPrompt) {
    body.systemInstruction = {
      parts: [{ text: systemPrompt }],
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${text}`);
  }

  const data = (await response.json()) as GeminiResponse;
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) {
    throw new Error('Gemini returned empty response');
  }

  return content;
}
