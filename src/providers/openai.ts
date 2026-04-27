import { LLMProvider, ProviderError, classifyHttp } from "./base";

export const openaiProvider: LLMProvider = {
  id: "openai",
  label: "OpenAI",
  async generate({ system, user, signal, onChunk }, cfg) {
    const url = `${cfg.baseUrl ?? "https://api.openai.com"}/v1/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
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
      throw new ProviderError(`OpenAI ${res.status}: ${await res.text().catch(() => "")}`, c.code, c.retriable);
    }
    return await readSSE(res.body, onChunk, (data) => {
      try {
        return JSON.parse(data).choices?.[0]?.delta?.content ?? "";
      } catch {
        return "";
      }
    });
  },
};

export async function readSSE(
  body: ReadableStream<Uint8Array>,
  onChunk: (d: string) => void,
  parseDelta: (data: string) => string,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const ln of lines) {
      if (!ln.startsWith("data:")) continue;
      const data = ln.slice(5).trim();
      if (!data) continue;
      if (data === "[DONE]") return full;
      const delta = parseDelta(data);
      if (delta) {
        full += delta;
        onChunk(delta);
      }
    }
  }
  return full;
}
