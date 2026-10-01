/** Limiteur simple à seau de jetons, par socket et par type d'événement. */
const LIMITS: Record<string, { capacity: number; refillPerSec: number }> = {
  action: { capacity: 20, refillPerSec: 6 },
  chat: { capacity: 6, refillPerSec: 1 },
  session: { capacity: 8, refillPerSec: 0.5 },
  // Signalisation WebRTC : rafales normales quand beaucoup de joueurs rejoignent l'audio en même temps.
  signal: { capacity: 2000, refillPerSec: 400 },
};

export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();

  allow(key: string, kind: string, now = Date.now()): boolean {
    const cfg = LIMITS[kind] ?? LIMITS.action;
    const b = this.buckets.get(key) ?? { tokens: cfg.capacity, at: now };
    b.tokens = Math.min(cfg.capacity, b.tokens + ((now - b.at) / 1000) * cfg.refillPerSec);
    b.at = now;
    if (b.tokens < 1) {
      this.buckets.set(key, b);
      return false;
    }
    b.tokens -= 1;
    this.buckets.set(key, b);
    return true;
  }

  forget(prefix: string): void {
    for (const k of this.buckets.keys()) if (k.startsWith(`${prefix}:`)) this.buckets.delete(k);
  }
}
