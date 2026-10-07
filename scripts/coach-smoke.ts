/*
 * Opt-in live check of the round coach against the real Gemini / Groq APIs
 * (`Plan.md` §2C.10, W5-11). Never part of `npm test`.
 *
 *   npm run smoke:coach                               # 1 run, both providers from .env
 *   AI_PROVIDER_ORDER=groq npm run smoke:coach -- 3   # 3 runs on Groq alone (the most allowed)
 *
 * The fixed round of docs/AGENT_EVALS.md: letter Lj, Serbian alphabet. The
 * player left river blank, wrote "Lav" for animal (wrong letter) and
 * "Ljubljana" for country (rejected as the wrong category). Expectations L1-L3
 * were written there before the first run.
 *
 * Each run uses at most 3 model steps, 1 referee call and 5 provider attempts.
 * It prints the run's `agent.run` log (typed fields only) and then the report,
 * whose suggestions a person must read to judge L1-L3. Never a key.
 */
import { randomUUID } from "node:crypto";
import { runCoach } from "@server/agent/coach-agent";
import type { AgentRunRecord } from "@server/agent/run-log";
import type { FocusEntry } from "@server/agent/tools";
import { createAiServiceFromEnv } from "@server/ai/service";

const MAX_RUNS = 3;

const requested = Number(process.argv[2] ?? "1");
if (!Number.isInteger(requested) || requested < 1 || requested > MAX_RUNS) {
  console.error(`Runs per invocation: 1 to ${MAX_RUNS}.`);
  process.exit(1);
}

const loaded = createAiServiceFromEnv(process.env);
if (!loaded) {
  console.error("Neither GEMINI_API_KEY nor GROQ_API_KEY is set (or a model chain is invalid). Put one in .env.");
  process.exit(1);
}
console.info(`Providers: ${loaded.providers.join(" -> ")}. Runs: ${requested}.`);

const focus: FocusEntry[] = [
  { category: "country", yourAnswer: "Ljubljana", whyMissed: "wrong_category" },
  { category: "river", yourAnswer: "", whyMissed: "empty" },
  { category: "animal", yourAnswer: "Lav", whyMissed: "wrong_letter" },
];

for (let index = 1; index <= requested; index += 1) {
  console.info(`\n=== Run ${index} of ${requested}, letter Lj, Serbian alphabet\n`);
  const records: AgentRunRecord[] = [];
  const outcome = await runCoach(
    { runId: randomUUID(), goal: "fill_gaps", language: "sr", snapshot: { letter: "Lj", alphabet: "sr", focus } },
    { ai: loaded.service, now: Date.now, signal: new AbortController().signal, log: (record) => records.push(record) },
  );

  for (const record of records) console.info(`run log: ${JSON.stringify(record)}`);
  if (outcome.cancelled) {
    console.info("cancelled");
    continue;
  }
  const { report } = outcome;
  console.info(`\nreport: ${report.status} (${report.stopReason}), confidence ${report.confidence ?? "-"}`);
  if (report.summary) console.info(`summary: ${report.summary}`);
  for (const tip of report.tips) {
    const startsWithLj = tip.suggestion === null ? "" : tip.suggestion.startsWith("Lj") ? "  [Lj ok]" : "  [NOT Lj]";
    console.info(`  ${tip.category.padEnd(8)} ${tip.suggestion ?? "(no suggestion)"} ${tip.checkedBy ?? ""}${startsWithLj}`);
  }
  if (report.run) console.info(`details: ${JSON.stringify(report.run)}`);
}
console.info("");
