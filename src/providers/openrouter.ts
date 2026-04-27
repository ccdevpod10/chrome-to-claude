import { LLMProvider, ProviderError, classifyHttp } from "./base";
import { readSSE } from "./openai";

// OpenRouter is OpenAI-compatible. Endpoint: https://openrouter.ai/api/v1/chat/completions
// Recommended headers: HTTP-Referer, X-Title (improves rate limits, attribution).
export const openrouterProvider: LLMProvider = {
  id: "openrouter",
  label: "OpenRouter",
  async generate({ system, user, signal, onChunk }, cfg) {
    const base = (cfg.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
        "HTTP-Referer": "chrome-extension://ai-code-assistant",
        "X-Title": "AI Code Assistant",
      },
      body: JSON.stringify({
        model: cfg.model,
        stream: true,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok || !res.body) {
      const c = classifyHttp(res.status);
      const body = await res.text().catch(() => "");
      throw new ProviderError(`OpenRouter ${res.status}: ${body}`, c.code, c.retriable);
    }
    return readSSE(res.body, onChunk, (data) => {
      try {
        return JSON.parse(data).choices?.[0]?.delta?.content ?? "";
      } catch {
        return "";
      }
    });
  },
};
