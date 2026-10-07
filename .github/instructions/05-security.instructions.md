---
description: "Real-time trust boundaries, hidden-answer privacy, identity, input validation, tokens, secrets, and safe logging."
applyTo: "**/*"
---

# Security Instructions

## Trust model

Treat all browser events, room codes, display names, answers, revisions, resume tokens, headers, environment values, and stored room data as untrusted or sensitive according to their role.

The server is the sole authority for:

- Socket-to-player identity
- Room membership and capacity
- Active round and phase
- Letter and categories
- Start and end timestamps
- Whether a draft is on time
- Locked submissions
- Answer validity (the local rule plus the AI checker's verdict, applied by server code)
- Category points and totals

Never accept these values as authoritative merely because a client sent them.

## Hidden-answer boundary

- Keep internal room state separate from recipient-specific projections.
- During `COUNTDOWN` and `ANSWERING`, never emit the opponent's raw/normalized answers or private revisions.
- Do not include hidden data in broad room snapshots, acknowledgement errors, debug responses, analytics, or logs.
- Reveal only from the single canonical close transition.
- Add automated assertions that forbidden fields are absent before reveal.

## Identity and room isolation

- Associate a player with the socket/session on the server; ignore client-supplied identity claims in later events.
- Generate room codes and resume tokens with cryptographically secure randomness.
- Room codes may be shareable; resume tokens are private credentials.
- Never send one player's resume token to the other player.
- Verify room, player, socket, and active round on every mutation.
- Reject a third player and any cross-room or stale-round event without mutation.
- Apply bounded room creation/join attempts if public deployment is abused; heavy account/auth systems are out of scope.

## Input validation and limits

- Parse every client event with a shared strict runtime schema.
- Bound display-name length, answer length, room-code format, category values, revision integers, and event frequency.
- Reject control characters or unsafe display content; React text rendering must remain escaped.
- Do not interpret answers as HTML, Markdown, code, file paths, queries, or commands.
- Keep server error payloads generic and stable.

## Time and transition safety

- Check authoritative time and phase before every draft/finish mutation.
- Mark a round closed before subsequent reveal/scoring work.
- Make close, finish, and cleanup paths idempotent.
- Clear deadline timers during normal close and room cleanup.
- Never reopen a closed round because a late client event arrives.

## AI boundary (Week 4, `Plan.md` §2B)

- Only the server calls the AI, only through `src/server/ai/service.ts`. The
  browser never sees a key, a prompt, a model reply, or the hint's term.
- An opponent's answers reach the AI only after both sheets are locked, inside
  the close path; the AI opponent's answers are absent from every payload
  before `round:revealed`.
- Answers are untrusted data in a prompt: control characters stripped,
  JSON-encoded in the user message, and the system prompt says never to follow
  instructions inside them.
- A model reply is untrusted too: JSON parse, then the schema in
  `src/contracts/ai-output.schemas.ts`, then semantic checks (exactly the item
  ids sent, each once). Anything else is a failure, and a failure falls back
  to the letter rule — never a stuck round and never a guessed verdict.
- The round letter is enforced by code on the recognised name; the model is
  never trusted to apply it.
- A hint clue that contains its term, or any 4 consecutive letters of it in
  Serbian or English, is discarded.
- Answers go to third parties (Google, Groq). The lobby tells players so;
  never send display names, room codes, socket ids or tokens to a provider.
- AI quota is a shared resource, bounded per visitor and per day
  (`Plan.md` §2B.11, `src/server/usage-limits.ts`). A new path that spends AI
  calls goes through the room store's counted AI service and, if a visitor
  can trigger it at will, a per-visitor limit. The visitor's address comes
  from the transport, never the payload, and `x-forwarded-for` is trusted
  only for the configured number of proxy hops.

## Agent boundary (Week 5, `Plan.md` §2C)

- **The model proposes, the application decides.** Every step's reply is
  untrusted: JSON parse, the envelope schema, the step's allowlist
  (`allowedActions`), the action's shape, then the tool's own argument schema,
  run scope and repeat guard. A name outside `TOOLS` is `unknown_tool` and
  nothing runs; a refused proposal is never counted as a tool call.
- **Read-only.** The coach runs only in phase `results`, from the reveal
  already sent to both players (`Round.reveal`). No coach path writes an
  answer, validity, point, phase or timer, and no tool reads the opponent's
  sheet. The model sees only the caller's own misses (`Plan.md` §2C.5).
- **Caller-only.** The report is the `round:coach` ack; there is no broadcast.
- **Evidence, not text.** A suggestion shown to a player is copied from a
  passing `check_candidates` item of the same run; the final cites ids, and a
  final that cites anything else is rejected whole.
- **Bounded by code.** `RUN_LIMITS` (steps, tool calls, attempts per step and
  per run, time) is checked before every step, and the gateway's
  `maxAttempts` caps each step. Every model step counts toward
  `AI_DAILY_CALL_BUDGET`; runs are capped per visitor
  (`COACH_RUNS_PER_VISITOR_HOUR`).
- **The run log holds no content.** `agent.run` is built from typed fields:
  counts, actions, decisions, attempts, stop reason — never an answer, a
  proposed word, a prompt, a reply or a key.

## Secrets and logging

- Keep `.env`, deployment credentials, tokens, private URLs, and production data out of git, prompts, screenshots, evidence, fixtures, and responses.
- Commit only placeholder names in `.env.example`.
- Never log full socket payloads, raw answers before reveal, resume tokens, environment contents, API keys, prompts or model replies, or stack traces to clients. AI telemetry logs counts, models and outcomes only; `AI_DEBUG_LOG` is for local debugging and is ignored in production.
- Prefer structured summaries: event name, request ID, redacted room ID, phase, accepted/rejected outcome, and safe reason code.

## Production transport

- Use HTTPS/WSS in production through the hosting platform.
- Prefer same-origin SPA and Socket.IO hosting. If origins differ, use an explicit allowlist; never use unrestricted production CORS with credentials.
- Do not claim strong anti-cheat or durable sessions. The in-memory, no-account model has documented limitations.

## Security-sensitive change completion

A privacy, identity, validation, or timing fix is not complete until a test proves the old unsafe path is rejected and canonical state remains unchanged.
