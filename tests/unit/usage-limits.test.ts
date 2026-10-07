import { describe, expect, it } from "vitest";
import { createUsageLimits, visitorAddress, VISITOR_WINDOW_MS } from "@server/usage-limits";

/** Plan §2B.11: one visitor cannot spend the shared AI quota for everyone. */
const T0 = Date.UTC(2026, 8, 30, 10, 0, 0);
const limits = (overrides: Partial<Parameters<typeof createUsageLimits>[0]> = {}) =>
  createUsageLimits({ aiRoomsPerVisitorHour: 2, hintsPerVisitorHour: 3, aiDailyCallBudget: 5, ...overrides });

describe("per-visitor hourly limit", () => {
  it("refuses the action past the limit, for that visitor only, until the hour has passed", () => {
    const usage = limits();
    for (let i = 0; i < 2; i += 1) {
      expect(usage.check("aiRoom", "1.1.1.1", T0)).toBeNull();
      usage.charge("aiRoom", "1.1.1.1", T0);
    }
    expect(usage.check("aiRoom", "1.1.1.1", T0 + 1)).toBe("RATE_LIMITED");
    expect(usage.check("aiRoom", "2.2.2.2", T0 + 1)).toBeNull();
    // Hints are counted separately from AI rooms.
    expect(usage.check("hint", "1.1.1.1", T0 + 1)).toBeNull();
    expect(usage.check("aiRoom", "1.1.1.1", T0 + VISITOR_WINDOW_MS)).toBeNull();
  });

  it("only a charge counts; a check alone costs nothing", () => {
    const usage = limits({ hintsPerVisitorHour: 1 });
    for (let i = 0; i < 5; i += 1) expect(usage.check("hint", "1.1.1.1", T0)).toBeNull();
    usage.charge("hint", "1.1.1.1", T0);
    expect(usage.check("hint", "1.1.1.1", T0)).toBe("RATE_LIMITED");
  });

  it("prune forgets visitors whose hour is over, and keeps the rest", () => {
    const usage = limits({ aiRoomsPerVisitorHour: 1 });
    usage.charge("aiRoom", "old", T0);
    usage.charge("aiRoom", "new", T0 + VISITOR_WINDOW_MS - 1);
    usage.prune(T0 + VISITOR_WINDOW_MS);
    expect(usage.check("aiRoom", "old", T0 + VISITOR_WINDOW_MS)).toBeNull();
    expect(usage.check("aiRoom", "new", T0 + VISITOR_WINDOW_MS)).toBe("RATE_LIMITED");
  });
});

describe("global daily budget", () => {
  it("refuses new AI work for everyone once the day's calls are spent, and resets at UTC midnight", () => {
    const usage = limits({ aiDailyCallBudget: 3 });
    for (let i = 0; i < 3; i += 1) usage.countCall(T0);
    expect(usage.check("aiRoom", "fresh visitor", T0)).toBe("AI_LIMIT");
    expect(usage.check("hint", "fresh visitor", T0)).toBe("AI_LIMIT");

    const nextDay = Date.UTC(2026, 9, 1, 0, 0, 0);
    expect(usage.check("aiRoom", "fresh visitor", nextDay - 1)).toBe("AI_LIMIT");
    expect(usage.check("aiRoom", "fresh visitor", nextDay)).toBeNull();
  });

  it("names the daily limit before the per-visitor one", () => {
    const usage = limits({ aiRoomsPerVisitorHour: 1, aiDailyCallBudget: 1 });
    usage.charge("aiRoom", "a", T0);
    usage.countCall(T0);
    expect(usage.check("aiRoom", "a", T0)).toBe("AI_LIMIT");
  });

  it("atomically admits at most five coach runs per visitor and charges each physical attempt", () => {
    const usage = limits({ aiDailyCallBudget: 7, coachRunsPerVisitorHour: 5 });
    for (let i = 0; i < 5; i += 1) expect(usage.admitCoachRun("visitor", T0)).toBeNull();
    expect(usage.admitCoachRun("visitor", T0)).toBe("RATE_LIMITED");
    expect(usage.admitCoachRun("other", T0)).toBeNull();
    for (let i = 0; i < 7; i += 1) expect(usage.chargeCoachAttempt(T0)).toBe(true);
    expect(usage.chargeCoachAttempt(T0)).toBe(false);
    expect(usage.admitCoachRun("fresh", T0)).toBe("AI_LIMIT");
  });
});

describe("visitorAddress", () => {
  it("ignores x-forwarded-for when no proxy is trusted, so a browser cannot claim a fresh address", () => {
    expect(visitorAddress("9.9.9.9", "127.0.0.1", 0)).toBe("127.0.0.1");
  });

  it("takes the entry the trusted proxy added, not the ones the browser sent before it", () => {
    expect(visitorAddress("6.6.6.6, 7.7.7.7, 5.5.5.5", "10.0.0.2", 1)).toBe("5.5.5.5");
    expect(visitorAddress("6.6.6.6, 5.5.5.5, 10.0.0.9", "10.0.0.2", 2)).toBe("5.5.5.5");
    expect(visitorAddress(["6.6.6.6", "5.5.5.5"], "10.0.0.2", 1)).toBe("5.5.5.5");
  });

  it("falls back to the leftmost available address when the header is shorter than expected", () => {
    expect(visitorAddress(undefined, "10.0.0.2", 1)).toBe("10.0.0.2");
    expect(visitorAddress("5.5.5.5", "10.0.0.2", 3)).toBe("5.5.5.5");
  });

  it("treats an IPv4 client seen through an IPv6 socket as the same visitor", () => {
    expect(visitorAddress(undefined, "::ffff:127.0.0.1", 0)).toBe("127.0.0.1");
  });
});
