import type { GameErrorCode } from "@contracts/errors";

/*
 * `Plan.md` §2B.11. The free AI quota is shared by every player, so no one
 * visitor may spend it for everyone. Two bounds:
 *
 * 1. Per visitor (client IP), per hour: AI rooms and hints. The socket rate
 *    limit resets on reconnect; this one does not.
 * 2. Per UTC day, a global budget of AI calls. Once spent, no new AI room and
 *    no hint — but a round already played is still checked, because the
 *    checker is what makes scoring fair (priority: checker > bot sheet > hint).
 *
 * Time comes from the injected clock, so tests drive it. Everything is in
 * memory: a restart resets the counts, the same accepted limitation as rooms.
 */

export const VISITOR_WINDOW_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

export type LimitedAction = "aiRoom" | "hint";

export type UsageLimitsConfig = {
  aiRoomsPerVisitorHour: number;
  hintsPerVisitorHour: number;
  aiDailyCallBudget: number;
  coachRunsPerVisitorHour?: number;
};

export type UsageLimits = {
  /** Checks without charging. Null means allowed. */
  check(action: LimitedAction, visitor: string, now: number): Extract<GameErrorCode, "AI_LIMIT" | "RATE_LIMITED"> | null;
  /** Charges one action to the visitor; call it only when AI work is actually started. */
  charge(action: LimitedAction, visitor: string, now: number): void;
  /** Counts one AI call toward today's budget, whatever the operation. */
  countCall(now: number): void;
  /** Atomically charges one admitted coach run and checks current daily availability. */
  admitCoachRun(visitor: string, now: number): Extract<GameErrorCode, "AI_LIMIT" | "RATE_LIMITED"> | null;
  /** Atomically checks and charges one physical coach provider attempt. */
  chargeCoachAttempt(now: number): boolean;
  /** Forgets visitors whose hour has passed. */
  prune(now: number): void;
};

export function createUsageLimits(config: UsageLimitsConfig): UsageLimits {
  const visitors = new Map<string, { startedAt: number; aiRoom: number; hint: number; coachRun: number }>();
  let day = -1;
  let callsToday = 0;

  const maxFor = (action: LimitedAction) =>
    action === "aiRoom" ? config.aiRoomsPerVisitorHour : config.hintsPerVisitorHour;

  const windowOf = (visitor: string, now: number) => {
    const current = visitors.get(visitor);
    if (current && now - current.startedAt < VISITOR_WINDOW_MS) return current;
    return null;
  };

  const rollDay = (now: number) => {
    const today = Math.floor(now / DAY_MS);
    if (today !== day) {
      day = today;
      callsToday = 0;
    }
  };

  return {
    check(action, visitor, now) {
      rollDay(now);
      if (callsToday >= config.aiDailyCallBudget) return "AI_LIMIT";
      const window = windowOf(visitor, now);
      if (window && window[action] >= maxFor(action)) return "RATE_LIMITED";
      return null;
    },
    charge(action, visitor, now) {
      let window = windowOf(visitor, now);
      if (!window) {
        window = { startedAt: now, aiRoom: 0, hint: 0, coachRun: 0 };
        visitors.set(visitor, window);
      }
      window[action] += 1;
    },
    countCall(now) {
      rollDay(now);
      callsToday += 1;
    },
    admitCoachRun(visitor, now) {
      rollDay(now);
      if (callsToday >= config.aiDailyCallBudget) return "AI_LIMIT";
      const current = windowOf(visitor, now);
      if (current && current.coachRun >= (config.coachRunsPerVisitorHour ?? 5)) return "RATE_LIMITED";
      let window = current;
      if (!window) {
        window = { startedAt: now, aiRoom: 0, hint: 0, coachRun: 0 };
        visitors.set(visitor, window);
      }
      window.coachRun += 1;
      return null;
    },
    chargeCoachAttempt(now) {
      rollDay(now);
      if (callsToday >= config.aiDailyCallBudget) return false;
      callsToday += 1;
      return true;
    },
    prune(now) {
      for (const [visitor, window] of visitors) {
        if (now - window.startedAt >= VISITOR_WINDOW_MS) visitors.delete(visitor);
      }
    },
  };
}

/**
 * The visitor's address. Behind a host proxy (Render), the socket's peer is
 * the proxy, so the client is read from `x-forwarded-for` — but only as many
 * hops as the host's own proxies add; entries further left are whatever the
 * browser sent and are not trusted. With 0 hops the header is ignored.
 */
export function visitorAddress(
  forwardedFor: string | string[] | undefined,
  remoteAddress: string | undefined,
  trustedHops: number,
): string {
  const header = Array.isArray(forwardedFor) ? forwardedFor.join(",") : (forwardedFor ?? "");
  const forwarded = trustedHops > 0 ? header.split(",").map((entry) => entry.trim()).filter(Boolean) : [];
  const chain = [...forwarded, remoteAddress ?? "unknown"];
  const picked = chain[Math.max(0, chain.length - 1 - trustedHops)] ?? "unknown";
  // An IPv4 client seen through an IPv6 socket is the same visitor.
  return picked.replace(/^::ffff:/, "");
}
