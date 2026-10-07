# Quickstart: validating the round coach

How to validate the built `coach-step.v6` feature on `feature/round-coach`. Each check names the
evals it covers ([`docs/AGENT_EVALS.md`](../../docs/AGENT_EVALS.md)).

## Prerequisites

- Node ≥ 22.13, `npm ci`.
- Fake-provider checks need no key.
- Live checks need `GEMINI_API_KEY` and/or `GROQ_API_KEY` in `.env`, and W4-7
  done first (`Plan.md` §2C.16 decision 9).

## 1. The whole suite (no key)

```bash
npm run verify
```

Expected: typecheck, lint, build clean; every test passes. The last recorded v5 baseline was 655 tests in 34 files; the current gate must be recorded from its output. No test is removed
or weakened. Real Socket.IO tests require localhost listen access.

## 2. The agent loop alone (no key)

```bash
npx vitest run tests/unit/agent-tools.test.ts tests/unit/coach-agent.test.ts
```

Expected: C1, C2, C4–C13, C16, C17 and C19–C22 pass under the approved amendments. The tests drive the
**real gateway** with `tests/fakes/fake-adapter.ts` and `fakeTime`, so a
timeout, a retry and a fallback are the production code paths. Each test
asserts the counts the run log records: model steps, tool calls, provider
attempts, stop reason.

## 3. Over the wire (no key)

```bash
npx vitest run tests/integration/coach.test.ts tests/integration/ai-round.test.ts
```

Expected: C3, C14, C15 pass, and A1–A6 still pass, which shows the reveal
snapshot changed nothing in close and score.

## 4. Mutation checks (no key)

Make each change by hand, run step 2 or 3, confirm the named eval fails, then
restore:

| Change | Must fail |
| --- | --- |
| Skip the allowlist check | C4 |
| Skip the repeat guard | C9 |
| Skip the deadline check before a step | C11 |
| Copy the suggestion from the model's reply instead of the evidence | C13 |

## 5. Limited live run (keys; after W4-7)

```bash
AI_DEBUG_LOG=0 AI_PROVIDER_ORDER=gemini npm run smoke:coach -- 1
AI_DEBUG_LOG=0 AI_PROVIDER_ORDER=groq   npm run smoke:coach -- 1
```

First reconcile smoke and browser runs in `docs/AI_USAGE_LOG.md`; do not
assume the six recorded v1 runs are the complete development count. Run
only these two one-run invocations when the total has room within 15.

The script coaches a fixed round (letter Lj, Serbian alphabet; the player left
Reka blank, wrote "Lav" for Životinja and "Ljubljana" for Država), at most 3
runs per invocation, and prints each run's log: steps, actions, allowed or
rejected, attempts, tool calls, stop reason, time. Desired quality outcome: a completed run whose suggestions start with Lj
and carry referee acceptance. A controlled incomplete/failed run is a
safety result, not a completed-quality result; record it honestly. L1–L3
remain the original expectations, with current-version observations separate. Record every
run in `docs/EVIDENCE_005.md` and count it in `docs/AI_USAGE_LOG.md` (≤ 15 live
runs in development, ≤ 3 in the demo).

## 6. In the browser (keys)

```bash
npm run dev
```

Play against the AI, leave two categories blank, write one wrong-letter
answer, finish. On the results sheet: the coach panel lists those three
categories ticked; untick one; ask. Expected: a status while it runs, then a
report in the interface language with two entries; points unchanged. A repeated identical socket request returns the cached
report with no calls; the panel itself locks after the first report. Switch the language and play again to see the English
summary. With O6, open "Details" and check that it shows counts, provider,
model, time and stop reason, and no words.

## 7. Seven-minute pair demo

Use `docs/EVIDENCE_005.md` §10 as the run sheet: user goal, architecture,
success, boundaries, rejected-tool/failure tests, counts and limitations, then
both contributions. Rehearsal is an observed human activity; preparing this
run sheet does not mark it done. Use recorded live evidence for practice and
keep the final demo within three live coaching runs.
