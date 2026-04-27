export interface RetryOpts { retries?: number; baseMs?: number }

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const retries = opts.retries ?? 2;
  const baseMs = opts.baseMs ?? 400;
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e: unknown) {
      lastErr = e;
      const retriable = (e as { retriable?: boolean })?.retriable === true;
      if (!retriable || i === retries) throw e;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw lastErr;
}
