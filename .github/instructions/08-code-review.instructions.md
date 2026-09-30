---
description: "Risk-based author and reviewer checklist for real-time multiplayer correctness, privacy, tests, and evidence."
applyTo: "**/*"
---

# Code Review Instructions

## Review order

1. Current scope, `GAME_SPEC.md`, and explicit acceptance criteria
2. Server authority and layer boundaries
3. Synchronization, timing, idempotency, and scoring correctness
4. Hidden-answer privacy, identity, validation, and safe errors
5. Tests, Week 3 eval evidence, deployment impact, and diff hygiene

## Mandatory correctness gates

- The second player cannot cause a different letter or timer from the first.
- Both clients receive one identical `roundId`, letter, `startsAt`, and `endsAt`.
- Start is scheduled in the future and enforced by the server.
- Drafts are private and acknowledged without being broadcast.
- Finish locks answers and is idempotent.
- Deadline and both-finish paths converge on one idempotent close operation.
- Reveal and scoring occur exactly once.
- Late/stale updates cannot reopen or change results.
- Validity precedes comparison; normalized equal answers score 5/5 and different valid answers score 10/10.
- The client cannot forge identity, phase, time, validity, or score.
- A third player cannot enter a full room.
- AI changes (`Plan.md` §2B): every AI failure — no key, timeout, quota, bad JSON, schema or semantic mismatch — ends in a scored round marked unverified; `completeRound` runs exactly once whichever of checker and 20 s timeout comes first; the letter is enforced by code, not the model; a hint is charged only when a clue is shown.

## Mandatory privacy and security gates

- Shared runtime schemas validate every external event and environment config.
- Pre-reveal payloads and logs contain no opponent answer values or resume tokens.
- Internal room objects are never sent directly.
- Rejected mutations leave canonical state unchanged.
- String and event-size bounds exist.
- Client-visible errors contain no stack, filesystem path, secret, internal token, or hidden data.
- Production uses HTTPS/WSS and an explicit origin policy when not same-origin.
- AI: keys only in the server environment; no answer, prompt, reply or key in logs; the opponent's and the AI opponent's answers absent before reveal; model replies validated by `ai-output.schemas.ts` before use; hint terms never leave the server; tests use fakes, never a real provider.

## Required evidence

- New behavior has success and rejection/edge tests.
- Timing/race behavior uses a fake clock or deterministic trigger rather than flaky sleeps.
- Privacy tests assert forbidden data is absent.
- `npm test`, typecheck, lint, and build results are reported.
- A deployed behavior change has a two-computer smoke-test result.
- `GAME_SPEC.md`, `Plan.md`, README/protocol docs, evals, and evidence are updated when applicable.

## Risk levels

- Low: copy, styles, documentation, or isolated presentational changes.
- Medium: normalization, answer data, UI state, runtime schemas, or non-critical event changes.
- High: identity, hidden projections, start/deadline behavior, finish/close race, scoring, deployment topology, or reconnection.

Medium/high-risk changes require explicit tests and a compatibility or limitation note.

## Findings to reject

- `setTimeout` or browser time treated as canonical without a server guard.
- `Math.random()` choosing separate letters on clients.
- Opponent answers sent early and merely hidden by UI.
- Scores accepted from a browser payload.
- Client-provided `playerId` trusted after connection.
- Duplicate finish/deadline handling that can emit twice.
- Unvalidated socket payloads cast directly to TypeScript types.
- Unknown geography answers treated as certainly valid or invalid without the documented policy.
- Database, auth, chat, or extra services added without an approved scope change; AI providers other than Gemini and Groq, or AI features beyond `Plan.md` §2B.
- A new path that spends AI calls with no bound (`Plan.md` §2B.11).
- A released prompt version edited in place instead of versioned.
- Secrets, tokens, private answers, or full payloads in source/logs/evidence.
- Claims that checks passed without actual command output.

## Handoff checklist

Report behavior delivered, files/layers affected, tests and commands run, manual/two-computer verification, Week 3 baseline/eval status, known limitations, documentation changes, and commit/deployment status. Push and deployment are separate authorized operations.
