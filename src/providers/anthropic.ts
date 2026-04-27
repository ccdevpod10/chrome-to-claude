import { LLMProvider, ProviderError, classifyHttp } from "./base";

export const anthropicProvider: LLMProvider = {
  id: "anthropic",
  label: "Anthropic",
  async generate({ system, user, signal, onChunk }, cfg) {
    const url = `${cfg.baseUrl ?? "https://api.anthropic.com"}/v1/messages`;
    const res = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 4096,
        stream: true,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok || !res.body) {
      const c = classifyHttp(res.status);
      throw new ProviderError(`Anthropic ${res.status}: ${await res.text().catch(() => "")}`, c.code, c.retriable);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let full = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const events = buf.split("\n\n");
      buf = events.pop() ?? "";
      for (const ev of events) {
        const dataLine = ev.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        const data = dataLine.slice(5).trim();
        if (!data) continue;
        try {
          const j = JSON.parse(data);
          if (j.type === "content_block_delta") {
            const delta = j.delta?.text ?? "";
            if (delta) {
              full += delta;
              onChunk(delta);
            }
          }
        } catch {
          // ignore non-JSON keepalives
        }
      }
    }
    return full;
  },
};
