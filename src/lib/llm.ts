export type LLMProvider = "openai" | "claude" | "gemini" | "perplexity";

interface LLMConfig {
  url: string;
  model: string;
  formatRequest: (
    text: string,
    apiKey: string
  ) => { headers: HeadersInit; body: string };
  parseResponse: (data: unknown) => string;
}

const LLM_CONFIGS: Record<LLMProvider, LLMConfig> = {
  openai: {
    url: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o",
    formatRequest: (text, apiKey) => ({
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: text }],
      }),
    }),
    parseResponse: (data) =>
      (data as { choices: { message: { content: string } }[] }).choices[0]
        .message.content,
  },

  claude: {
    url: "https://api.anthropic.com/v1/messages",
    model: "claude-opus-4-5-20251101",
    formatRequest: (text, apiKey) => ({
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5-20251101",
        max_tokens: 4096,
        messages: [{ role: "user", content: text }],
      }),
    }),
    parseResponse: (data) => {
      const content = (data as { content: { type: string; text?: string }[] })
        .content;
      return content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
    },
  },

  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    model: "gemini-2.0-flash",
    formatRequest: (text, _apiKey) => ({
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
      }),
    }),
    parseResponse: (data) => {
      const candidates = (
        data as { candidates: { content: { parts: { text: string }[] } }[] }
      ).candidates;
      return candidates[0]?.content?.parts?.[0]?.text || "";
    },
  },

  perplexity: {
    url: "https://api.perplexity.ai/chat/completions",
    model: "llama-3.1-sonar-large-128k-online",
    formatRequest: (text, apiKey) => ({
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-sonar-large-128k-online",
        messages: [{ role: "user", content: text }],
      }),
    }),
    parseResponse: (data) =>
      (data as { choices: { message: { content: string } }[] }).choices[0]
        .message.content,
  },
};

export async function sendToLLM(
  text: string,
  provider: LLMProvider,
  apiKey: string
): Promise<string> {
  const config = LLM_CONFIGS[provider];

  // Special handling for Gemini which uses URL params for auth
  let url = config.url;
  if (provider === "gemini") {
    url = `${config.url}?key=${apiKey}`;
  }

  const { headers, body } = config.formatRequest(text, apiKey);

  const response = await fetch(url, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${provider} API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return config.parseResponse(data);
}
