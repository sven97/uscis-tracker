import { getCase } from "./cases";
import type { Case } from "./types";

// The refresh endpoint returns immediately and fetches in the background. Poll the
// case until its last_checked advances past `since` (the fetch finished), then call
// onUpdate. Gives up after timeoutMs (a cold Cloudflare solve can take ~90s).
export async function pollUntilChecked(
  id: number,
  since: string | null,
  onUpdate: (c: Case) => void,
  { intervalMs = 3000, timeoutMs = 150000 }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const c = await getCase(id);
      if (c.last_checked && c.last_checked !== since) {
        onUpdate(c);
        return;
      }
    } catch {
      /* keep polling */
    }
  }
}
