# Quickstart: validating the round coach

How to prove the feature works once it is built. **Nothing below can run yet**:
the feature is planned, not implemented (2026-10-07). Each check names the
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

Expected: typecheck, lint, build clean; every test passes. The count rises from
the 490 of 2026-10-07 by the new coach tests, and no existing test is removed
or weakened.

## 2. The agent loop alone (no key)

```bash
npx vitest run tests/unit/agent-tools.test.ts tests/unit/coach-agent.test.ts
```

Expected: C1, C2, C4–C13, C16 pass (and C17 after W5-10a). The tests drive the
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
AI_PROVIDER_ORDER=gemini npm run smoke:coach
AI_PROVIDER_ORDER=groq   npm run smoke:coach
```

The script coaches a fixed round (letter Lj, Serbian alphabet; the player left
Reka blank, wrote "Lav" for Životinja and "Ljubljana" for Država), at most 3
runs per invocation, and prints each run's log: steps, actions, allowed or
rejected, attempts, tool calls, stop reason, time. Expected: at least one
`completed` run per provider whose suggestions all start with Lj. Record every
run in `docs/EVIDENCE_005.md` and count it in `docs/AI_USAGE_LOG.md` (≤ 15 live
runs in development, ≤ 3 in the demo).

## 6. In the browser (keys)

```bash
npm run dev
```

Play against the AI, leave two categories blank, write one wrong-letter
answer, finish. On the results sheet: the coach panel lists those three
categories ticked; untick one; ask. Expected: a status while it runs, then a
report in the interface language with two entries; points unchanged; asking
again answers at once. Switch the language and play again to see the English
summary. With O6, open "Details" and check that it shows counts, provider,
model, time and stop reason, and no words.
