import { LLMProvider, ProviderError, classifyHttp } from "./base";
import { readSSE } from "./openai";

// OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, etc.)
export const localProvider: LLMProvider = {
  id: "local",
  label: "Local (OpenAI-compatible)",
  async generate({ system, user, signal, onChunk }, cfg) {
    if (!cfg.baseUrl) throw new ProviderError("Local baseUrl not set", "config", false);
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
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
      throw new ProviderError(`Local ${res.status}`, c.code, c.retriable);
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
