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
- Answer validity and review status
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

## Secrets and logging

- Keep `.env`, deployment credentials, tokens, private URLs, and production data out of git, prompts, screenshots, evidence, fixtures, and responses.
- Commit only placeholder names in `.env.example`.
- Never log full socket payloads, raw answers before reveal, resume tokens, environment contents, or stack traces to clients.
- Prefer structured summaries: event name, request ID, redacted room ID, phase, accepted/rejected outcome, and safe reason code.

## Production transport

- Use HTTPS/WSS in production through the hosting platform.
- Prefer same-origin SPA and Socket.IO hosting. If origins differ, use an explicit allowlist; never use unrestricted production CORS with credentials.
- Do not claim strong anti-cheat or durable sessions. The Week 3 in-memory, no-account model has documented limitations.

## Security-sensitive change completion

A privacy, identity, validation, or timing fix is not complete until a test proves the old unsafe path is rejected and canonical state remains unchanged.
