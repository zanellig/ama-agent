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
    model: "gpt-5-nano-2025-08-07",
    formatRequest: (text, apiKey) => ({
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5-nano-2025-08-07",
        messages: [{ role: "user", content: text }],
        reasoning_effort: "low",
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
    url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
    model: "gemini-3-flash-preview",
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

// Streaming configurations for each provider
interface StreamConfig {
  getStreamUrl: (baseUrl: string, apiKey: string) => string;
  getStreamBody: (text: string, model: string) => string;
  getStreamHeaders: (apiKey: string) => HeadersInit;
  parseChunk: (line: string) => string | null;
}

const STREAM_CONFIGS: Record<LLMProvider, StreamConfig> = {
  openai: {
    getStreamUrl: (baseUrl) => baseUrl,
    getStreamBody: (text, model) =>
      JSON.stringify({
        model,
        messages: [{ role: "user", content: text }],
        stream: true,
      }),
    getStreamHeaders: (apiKey) => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    }),
    parseChunk: (line) => {
      if (!line.startsWith("data: ")) return null;
      const data = line.slice(6);
      if (data === "[DONE]") return null;
      try {
        const parsed = JSON.parse(data);
        return parsed.choices?.[0]?.delta?.content || null;
      } catch {
        return null;
      }
    },
  },

  claude: {
    getStreamUrl: (baseUrl) => baseUrl,
    getStreamBody: (text, model) =>
      JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: "user", content: text }],
        stream: true,
      }),
    getStreamHeaders: (apiKey) => ({
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    }),
    parseChunk: (line) => {
      if (!line.startsWith("data: ")) return null;
      const data = line.slice(6);
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === "content_block_delta") {
          return parsed.delta?.text || null;
        }
        return null;
      } catch {
        return null;
      }
    },
  },

  gemini: {
    getStreamUrl: (baseUrl, apiKey) =>
      baseUrl.replace(":generateContent", ":streamGenerateContent") +
      `?key=${apiKey}&alt=sse`,
    getStreamBody: (text) =>
      JSON.stringify({
        contents: [{ parts: [{ text }] }],
      }),
    getStreamHeaders: () => ({
      "Content-Type": "application/json",
    }),
    parseChunk: (line) => {
      if (!line.startsWith("data: ")) return null;
      const data = line.slice(6);
      try {
        const parsed = JSON.parse(data);
        return parsed.candidates?.[0]?.content?.parts?.[0]?.text || null;
      } catch {
        return null;
      }
    },
  },

  perplexity: {
    getStreamUrl: (baseUrl) => baseUrl,
    getStreamBody: (text, model) =>
      JSON.stringify({
        model,
        messages: [{ role: "user", content: text }],
        stream: true,
      }),
    getStreamHeaders: (apiKey) => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    }),
    parseChunk: (line) => {
      if (!line.startsWith("data: ")) return null;
      const data = line.slice(6);
      if (data === "[DONE]") return null;
      try {
        const parsed = JSON.parse(data);
        return parsed.choices?.[0]?.delta?.content || null;
      } catch {
        return null;
      }
    },
  },
};

export async function* streamToLLM(
  text: string,
  provider: LLMProvider,
  apiKey: string
): AsyncGenerator<string, void, unknown> {
  const llmConfig = LLM_CONFIGS[provider];
  const streamConfig = STREAM_CONFIGS[provider];

  const url = streamConfig.getStreamUrl(llmConfig.url, apiKey);
  const headers = streamConfig.getStreamHeaders(apiKey);
  const body = streamConfig.getStreamBody(text, llmConfig.model);

  const response = await fetch(url, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${provider} API error: ${response.status} - ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Failed to get response reader");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        const content = streamConfig.parseChunk(trimmedLine);
        if (content) {
          yield content;
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const content = streamConfig.parseChunk(buffer.trim());
      if (content) {
        yield content;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
