export interface ProviderConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface GenerateInput {
  system: string;
  user: string;
  signal: AbortSignal;
  onChunk: (delta: string) => void;
}

export interface LLMProvider {
  readonly id: string;
  readonly label: string;
  generate(input: GenerateInput, cfg: ProviderConfig): Promise<string>;
}

export class ProviderError extends Error {
  retriable: boolean;
  code: string;
  constructor(message: string, code: string, retriable = false) {
    super(message);
    this.code = code;
    this.retriable = retriable;
  }
}

export function classifyHttp(status: number): { retriable: boolean; code: string } {
  if (status === 401 || status === 403) return { retriable: false, code: "auth" };
  if (status === 429) return { retriable: true, code: "rate_limit" };
  if (status >= 500) return { retriable: true, code: `http_${status}` };
  return { retriable: false, code: `http_${status}` };
}
