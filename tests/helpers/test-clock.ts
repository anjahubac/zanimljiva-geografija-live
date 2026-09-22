import type { Cancel, Clock, Scheduler } from "@server/clock";

/**
 * Deterministic time for orchestration tests. Never replaces global timers, so
 * it is safe alongside real Socket.IO clients (module 13).
 */
export function createTestClock(start = 1_700_000_000_000) {
  let now = start;
  const pending: { atMs: number; fn: () => void; cancelled: boolean }[] = [];

  const clock: Clock = { now: () => now };

  const scheduler: Scheduler = {
    schedule(atMs, fn): Cancel {
      const entry = { atMs, fn, cancelled: false };
      pending.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
  };

  /** Move server time forward and fire everything that became due. */
  function advance(ms: number) {
    now += ms;
    for (const entry of [...pending].sort((a, b) => a.atMs - b.atMs)) {
      if (!entry.cancelled && entry.atMs <= now) {
        entry.cancelled = true;
        entry.fn();
      }
    }
  }

  return {
    clock,
    scheduler,
    advance,
    setNow: (t: number) => {
      now = t;
    },
    pendingCount: () => pending.filter((entry) => !entry.cancelled).length,
  };
}
