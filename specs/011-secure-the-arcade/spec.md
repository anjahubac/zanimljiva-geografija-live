# Feature Specification: Secure the Arcade (W08 hardening of the post-round coach)

**Feature Branch**: `011-secure-the-arcade` (local, from `010-post-round-coach` at `67aa13e`)

**Created**: 2026-10-25

**Status**: Implemented and verified by automated tests; see [EVIDENCE_W08](../../docs/EVIDENCE_W08.md). Pair-contribution and live-demo gates are open.

**Input**: W08 assignment "Secure the Arcade" (`weekly-assignment.md`, 2026-10-23). Harden one existing agent flow end to end, from the browser action to the rendered result, and prove its boundaries with executable tests.

**Chosen flow**: the W05 post-round coach (`round:coach`, [spec 010](../010-post-round-coach/spec.md)). It is the only flow with two model decisions and a real tool (`analyze_round`) between them.

**Source of truth**: this spec owns the W08 invariants and limits. The threat model, data inventory, test matrix and observed results live only in [EVIDENCE_W08](../../docs/EVIDENCE_W08.md). The W05 behavior (steps, tool, result shape) stays owned by spec 010 and is not changed.

## Security model in one paragraph

There are no accounts. A player's identity is the server-side socket bound to a seat in a room; a room's results are private to its two players. The browser sends data, the model proposes steps, and the server decides: it validates every message at runtime, binds the coach to the caller's own seat and round, executes only `analyze_round` with checked arguments, checks the tool result and the final choices against server-computed evidence, and renders only closed, localized text. W08 adds what was missing for that statement to hold under load and in the browser: a transport size cap, a global concurrency cap, a production CSP, and minimal security events.

## User Scenarios & Testing

### User Story 1 — A legitimate player still gets the review (P1)

**Acceptance**:

1. **Given** a completed round, **When** the player asks for a review, **Then** it completes with exactly 2 model decisions, 1 executed `analyze_round` and a validated result (I8).
2. **Given** the same round before and after the run, **When** compared, **Then** phase, round flags, locked answers, drafts, hints and the captured coach source are identical (I4).
3. **Given** the production build served with the real headers, **When** the player plays and asks for the review, **Then** the game and review work with zero CSP violations (I5, I8).

### User Story 2 — A hostile client cannot widen its authority (P1)

**Acceptance**:

1. **Given** a request with a wrong type, a missing or null field, an unknown goal or language, or malformed wire JSON, **Then** it is refused before any provider or tool work (I1).
2. **Given** a request carrying `role`, `maxSteps`, `ownerId`, `seat`, `provider`, `model` or a deadline, **Then** each is refused on its own and the next legitimate request runs under unchanged server policy (I2).
3. **Given** a message over 16 KiB, **Then** the transport refuses it before decoding; a message just under the cap gets a normal schema answer (I6).
4. **Given** another room's round id or a nonexistent one, **Then** the response is identical and no provider work starts (I1, I3).
5. **Given** a client-supplied score, points, total or verification flag, or tampered `localStorage`, **Then** it is refused or ignored and the server's own scoring stands (I2).
6. **Given** a socket from another browser origin, **Then** the handshake is refused (G).

### User Story 3 — A hostile or broken model cannot act outside the policy (P1)

**Acceptance**:

1. **Given** any tool name other than exactly `analyze_round` (including `constructor`, `toString`, `__proto__`), **Then** zero tools execute (I3).
2. **Given** `analyze_round` with invalid, extra or oversized arguments, **Then** zero tools execute; every valid `focus` executes once (I3).
3. **Given** player text with an injection attempt and a fake model that proposes `set_score`, reading the other seat, or smuggling a seat into the arguments, **Then** the executor refuses, game state is unchanged and the opponent receives nothing (I3, I4).
4. **Given** a tool result with an extra field, a different source version, an altered fact or an oversized payload, **Then** it is rejected before the second model call (I3, I7).
5. **Given** a final answer with markup, prose or an unsupported recommendation, **Then** no result is shown and the UI shows only a fixed localized status (I5).

### User Story 4 — Work and secrets stay bounded (P1)

**Acceptance**:

1. Attempts, retries and fallbacks share one run budget of 3 calls; a step change or provider switch never resets it (I6).
2. A hanging call is cut at 8 s; a run stops at 30 s even when every call is within its own timeout, and a late reply is discarded (I6).
3. At most 2 runs are active per server process; the excess is refused before provider work and before the visitor allowance is charged; cancellation and completion free the slot (I6).
4. A synthetic server key loaded by the real provider wiring never appears in the client bundle, socket payloads, the model context or logs, including in adapter errors (I7).
5. Every refused request and every finished run produces one JSON event from a closed field set; forged newlines produce no extra event (I7).

## Invariants (W08 §2.2)

| ID | Invariant | Enforced in | Proven by |
| --- | --- | --- | --- |
| I1 | A request that fails input or access checks starts no provider call and no tool. | `register-handlers.ts` strict schema parse; `room-store.ts` `reviewRound` checks before a run exists | T01, T02, T03 |
| I2 | Browser and model do not choose identity, permissions, provider config or limits. | Seat from the socket, never the payload; strict schemas; limits are server constants/config | T02, T15, T09 |
| I3 | Only the allowlisted tool runs, with valid arguments, on the caller's own data. | `coach-engine.ts` exact-name check and `parseAnalyzeRoundArgs`; source bound to the caller's seat in `room-store.ts` | T07, T08, T09, T10, T03 |
| I4 | The read-only flow never changes canonical game state. | `analyze_round` is a pure function over a frozen snapshot; the coach never calls `closeRound` or scoring | T00, T09 |
| I5 | Untrusted content never becomes executable in the browser. | React text interpolation only; closed coach vocabulary; CSP without inline/eval | T04, T05, T16 |
| I6 | Calls, time, data size and concurrency have server limits. | Transport cap, attempt guard, engine deadline, global run cap, visitor allowance | T02, T11, T12, T13 |
| I7 | Secrets stay on the server; browser, model context and logs get only what they need. | Key in a request header only; closed error codes; closed-field telemetry and security events | T10, T14, T16 |
| I8 | The normal W05 flow still succeeds. | — | T00, T16 browser smoke |

## Limits (W08 §4.E)

The assignment's table is a teaching example, not a standard. The chosen values and reasons:

| Resource | Server limit | Why it fits this project | Where |
| --- | --- | --- | --- |
| Socket.IO message (all events) | 16 KiB, refused by the transport before decode | Largest legitimate message (draft/name) is < 1 KiB | `MAX_SOCKET_MESSAGE_BYTES`, `index.ts` `maxHttpBufferSize` |
| Coach request | 512 B, 3 fixed fields, strict | Request has no free text | `COACH_MAX_REQUEST_BYTES` |
| Tool arguments / tool result | 128 B / 16 KiB | One enum argument; ten evidence records | `COACH_MAX_TOOL_ARGS_BYTES`, `COACH_MAX_TOOL_RESULT_BYTES` |
| Model reply | 8 KiB decoded text, 1,024 output tokens (server-side) | Replies are short JSON choices | `COACH_MAX_MODEL_TEXT_BYTES`, guard `maxOutputTokens` |
| Model decisions / provider attempts | 2 / 3 per run, 2 per step, 1 recovery | W05 topology; retry and fallback share the budget | `coach-attempt-guard.ts`, `coach-engine.ts` |
| Tool executions | 1 per run | One analysis is enough | `coach-engine.ts` |
| Attempt timeout / run deadline | 8 s / 30 s | W05 values kept; observed latency fits | guard, engine |
| Tool time | 250 ms, bounded pure calculation over 8 cells | No external work | `coach-engine.ts` |
| Concurrent runs | 2 per server process (new in W08) | Free-tier provider quota; one small instance | `COACH_MAX_CONCURRENT_RUNS`, `room-store.ts` |
| Admission rate | 5 runs per visitor (client IP) per hour; 60 socket events/s per socket | Stricter than the 5/60 s example; quota is shared | `usage-limits.ts`, `register-handlers.ts` |
| Daily calls | Shared app budget, charged before each real attempt | W04/W05 accounting | `usage-limits.ts` |

All limits are in memory and per process. A restart resets them; two processes would each allow 2 concurrent runs.

## Out of scope

Accounts or login, a verified leaderboard, anti-cheat, new AI features, rich text rendering, HTTPS infrastructure, dependency major upgrades (recorded as findings), and any write-capable tool.
