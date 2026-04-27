import { LLMProvider } from "./base";
import { openrouterProvider } from "./openrouter";
import { openaiProvider } from "./openai";
import { anthropicProvider } from "./anthropic";
import { localProvider } from "./local";

const providers: Record<string, LLMProvider> = {
  [openrouterProvider.id]: openrouterProvider,
  [openaiProvider.id]: openaiProvider,
  [anthropicProvider.id]: anthropicProvider,
  [localProvider.id]: localProvider,
};

export const getProvider = (id: string): LLMProvider | null => providers[id] ?? null;
export const listProviders = (): LLMProvider[] => Object.values(providers);
