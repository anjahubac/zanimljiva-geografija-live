import type { AiFailureCode } from "./types";

/*
 * Model rotation (owner-approved plan A, 2026-09-30). Remembers, per serverless
 * instance, which models are currently failing, so the next request starts
 * from a healthy model instead of paying a known-slow model's timeout again.
 *
 *   cooling    — after a timeout, 5xx, network error or per-minute 429:
 *                skipped for a short while, tried again afterwards
 *   exhausted  — after a per-day quota 429: skipped until the daily reset
 *                (midnight Pacific time, when Gemini RPD quotas reset)
 *
 * Best-effort: memory is per instance, so a fresh instance learns again at the
 * cost of at most one failed attempt per model. Nothing here is persisted.
 */

export type SkipReason = "cooling" | "exhausted";
export type SkippedModel = { model: string; reason: SkipReason };

export interface ModelHealth {
  /** Healthy models in chain order; if none, cooling ones soonest-first; never exhausted ones. */
  plan(chain: readonly string[], now: number): { usable: string[]; skipped: SkippedModel[] };
  report(model: string, outcome: AiFailureCode | "success", now: number, retryAfterMs?: number): void;
}

export const COOL_DOWN_MS = 60_000;
/** A model that keeps failing cools down longer each time: 1, 2, 4, 8 min, capped here. */
export const MAX_COOL_DOWN_MS = 15 * 60_000;
export const MISSING_MODEL_COOL_DOWN_MS = 10 * 60_000;

/** The next midnight in America/Los_Angeles, as epoch ms. */
export function nextPacificMidnight(now: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(now));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const sinceMidnight = ((value("hour") * 60 + value("minute")) * 60 + value("second")) * 1000 + (now % 1000);
  return now - sinceMidnight + 24 * 60 * 60 * 1000;
}

export function createModelHealth(): ModelHealth {
  const blocked = new Map<string, { until: number; reason: SkipReason }>();
  const strikes = new Map<string, number>();
  const coolDown = (model: string): number => {
    const count = (strikes.get(model) ?? 0) + 1;
    strikes.set(model, count);
    return Math.min(COOL_DOWN_MS * 2 ** (count - 1), MAX_COOL_DOWN_MS);
  };

  return {
    plan(chain, now) {
      const usable: string[] = [];
      const skipped: SkippedModel[] = [];
      const cooling: Array<{ model: string; until: number }> = [];

      for (const model of chain) {
        const state = blocked.get(model);
        if (!state || state.until <= now) {
          blocked.delete(model); // strikes are kept: a relapse cools down longer
          usable.push(model);
        } else {
          skipped.push({ model, reason: state.reason });
          if (state.reason === "cooling") cooling.push({ model, until: state.until });
        }
      }

      // Nothing healthy: a cooling model is still worth a try; an exhausted one is not.
      if (usable.length === 0 && cooling.length > 0) {
        cooling.sort((a, b) => a.until - b.until);
        const retried = new Set(cooling.map(({ model }) => model));
        return { usable: cooling.map(({ model }) => model), skipped: skipped.filter(({ model }) => !retried.has(model)) };
      }
      return { usable, skipped };
    },

    report(model, outcome, now, retryAfterMs) {
      switch (outcome) {
        case "success":
          blocked.delete(model);
          strikes.delete(model);
          return;
        case "quota_exhausted":
          // Gemini's daily quota resets at Pacific midnight. Groq says when its
          // own window resets, and that is used instead when it is known.
          blocked.set(model, {
            until: retryAfterMs !== undefined ? now + retryAfterMs : nextPacificMidnight(now),
            reason: "exhausted",
          });
          return;
        case "rate_limited":
          blocked.set(model, { until: now + (retryAfterMs ?? COOL_DOWN_MS), reason: "cooling" });
          return;
        case "model_unavailable":
          blocked.set(model, { until: now + MISSING_MODEL_COOL_DOWN_MS, reason: "cooling" });
          return;
        case "timeout":
        case "transport":
        case "provider_transient":
          blocked.set(model, { until: now + coolDown(model), reason: "cooling" });
          return;
        default:
          // Bad requests, refusals and malformed output say nothing about the model's health.
          return;
      }
    },
  };
}
