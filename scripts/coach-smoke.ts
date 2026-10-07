import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { coachSourceSchema } from "../src/contracts/coach.schemas";
import { createAiServiceFromEnv } from "../src/server/ai/service";
import { loadConfig } from "../src/server/config";
import { createUsageLimits } from "../src/server/usage-limits";

const credentialPresent = Boolean(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY);
if (process.env.COACH_LIVE_SMOKE !== "1") {
  process.stdout.write(`${JSON.stringify({ status: "not_run", reason: "set COACH_LIVE_SMOKE=1 to opt in", credentialPresent })}\n`);
  process.exit(0);
}
if (!credentialPresent) {
  process.stdout.write(`${JSON.stringify({ status: "pending", reason: "no provider credential configured", credentialPresent: false })}\n`);
  process.exit(0);
}
let config: ReturnType<typeof loadConfig>;
try { config = loadConfig(process.env); } catch {
  process.stdout.write(`${JSON.stringify({ status: "blocked", reason: "server quota configuration unavailable", credentialPresent: true })}\n`);
  process.exit(0);
}
const ai = createAiServiceFromEnv(process.env);
if (!ai) {
  process.stdout.write(`${JSON.stringify({ status: "pending", reason: "provider setup unavailable", credentialPresent: true })}\n`);
  process.exit(0);
}

const mode = process.env.COACH_SMOKE_MODE === "demo" ? "demo" : "development";
const limit = mode === "demo" ? 3 : 15;
const outputDir = new URL("../docs/runs/w05/", import.meta.url);
mkdirSync(outputDir, { recursive: true });
const ledgerPath = new URL("coach-smoke-usage.json", outputDir);
const lockPath = new URL("coach-smoke-usage.lock", outputDir);
let lock: number;
try { lock = openSync(lockPath, "wx"); } catch {
  process.stdout.write(`${JSON.stringify({ status: "not_run", reason: "live run budget is locked", credentialPresent: true })}\n`);
  process.exit(0);
}
let released = false;
const releaseLock = () => {
  if (released) return;
  closeSync(lock);
  unlinkSync(lockPath);
  released = true;
};
const stopWithoutRun = (record: Record<string, unknown>) => {
  process.stdout.write(`${JSON.stringify(record)}\n`);
  releaseLock();
  process.exit(0);
};
const ledgerSchema = z.object({ development: z.number().int().min(0).max(15), demo: z.number().int().min(0).max(3) }).strict();
let counts: { development: number; demo: number } = { development: 0, demo: 0 };
try {
  if (existsSync(ledgerPath)) {
    const parsed = ledgerSchema.safeParse(JSON.parse(readFileSync(ledgerPath, "utf8")));
    if (!parsed.success) throw new Error("invalid_budget_ledger");
    counts = parsed.data;
  }
  if (counts[mode] >= limit) {
    stopWithoutRun({ status: "limit_reached", mode, limit, credentialPresent: true });
  }
counts[mode] += 1;
writeFileSync(ledgerPath, `${JSON.stringify(counts, null, 2)}\n`, "utf8");
} catch {
  stopWithoutRun({ status: "not_run", reason: "live run budget ledger invalid or unavailable", credentialPresent: true });
}
releaseLock();
const source = coachSourceSchema.parse({
  letter: "S", alphabet: "sr", verified: true, total: 0,
  cells: ["country", "city", "river", "mountain", "sea", "animal", "plant", "thing"].map((category) => ({ category, blank: true, accepted: false, rejectReason: null, hinted: false, points: 0, scoringReason: "neither" })),
});
const limits = createUsageLimits({ aiRoomsPerVisitorHour: config.aiRoomsPerVisitorHour, hintsPerVisitorHour: config.hintsPerVisitorHour, aiDailyCallBudget: config.aiDailyCallBudget, coachRunsPerVisitorHour: config.coachRunsPerVisitorHour });
const runAdmission = limits.admitCoachRun("local-coach-smoke", Date.now());
if (runAdmission) {
  process.stdout.write(`${JSON.stringify({ status: "blocked", reason: runAdmission, credentialPresent: true })}\n`);
  process.exit(0);
}
const view = await ai.coach.run({
  runId: randomUUID(), roundId: "11111111-2222-4333-8444-555555555555", source,
  language: "en", sourceVersion: "synthetic-smoke-v1", signal: new AbortController().signal,
  now: Date.now, authorizeAndCharge: () => limits.chargeCoachAttempt(Date.now()),
});
const record = { observedAt: new Date().toISOString(), mode, status: view.status, stopReason: view.stopReason, stepCount: view.stepCount, toolCallCount: view.toolCallCount, providerAttemptCount: view.providerAttemptCount, elapsedMs: view.elapsedMs, maximumPhysicalAttempts: 3, quota: "process-local existing shared usage counter" };
writeFileSync(new URL(`live-smoke-${mode}-${counts[mode]}.json`, outputDir), `${JSON.stringify(record, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(record)}\n`);
