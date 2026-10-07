---
description: "Where the runtime schemas live, the socket event map, and the closed error-code registry. The code is the source of truth; this file maps it."
applyTo: "**/*"
---

# Contracts and Errors Instructions

## Rule

`src/contracts` is the **only** place where a boundary shape is defined. The
client, the server and the tests all import from it. Writing a second interface
that describes the same payload is a defect, even if the fields match.

Every type is inferred with `z.infer`. A hand-written `interface` describing a
socket payload is rejected in review.

**This file does not copy the schemas.** Earlier versions did, and the copies
fell behind the code (six categories, a 90-second round, no `judging` phase, no
Week 4 events). Read the schema in `src/contracts` itself; where this file and
the code disagree, the code wins and this file is the one to fix.

## Where each shape lives

| File | Holds |
| --- | --- |
| `src/contracts/game.schemas.ts` | Constants (`CATEGORIES`, `ALL_LETTERS`, `SERBIAN_LETTERS`, `ENGLISH_LETTERS`, `ALPHABETS`, `MAX_ANSWER_LENGTH`, `MIN_ANSWER_LENGTH`, `HINTS_PER_ROUND`, `BOT_DISPLAY_NAME`, `LANGUAGES`), category labels in both languages, primitives (room code, display name, `requestedNameSchema`, answer, round id, revision, epoch ms, slot, resume token), `roomPhaseSchema`, reject and score reasons, `serverConfigSchema` |
| `src/contracts/errors.ts` | The closed `GAME_ERROR_CODES` list, the server's (Serbian) message per code, the `Ack<T>` envelope, `ok()`, `fail()`, `ackSchema()` |
| `src/contracts/socket.schemas.ts` | Every client request, every ack, every server event payload, and the event-name constants `CLIENT_EVENTS` / `SERVER_EVENTS` |
| `src/contracts/ai-output.schemas.ts` | What the AI model must return (check, bot answers, hint). Server-only; never sent to a browser |

Client payloads use `.strict()`, so an unexpected key is a rejection, not a
silently ignored field. This is what stops a browser from smuggling `letter`,
`playerId`, `score`, `endsAt` or `phase` into a mutation. `serverConfigSchema`
is parsed once at startup; an invalid value exits the process with a clear
message.

## Acknowledgement envelope

Every client-to-server event takes a callback with the `Ack<T>` shape from
`errors.ts`: `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.
Handlers build acks with `ok()` / `fail()`, so a message can never drift from
the registry. The client must handle `ok: false` for every call it makes.

## Socket event map

Names are the values of `CLIENT_EVENTS` / `SERVER_EVENTS`. There are no other
events. Adding one is a scope change (`Plan.md` §11) and starts in
`socket.schemas.ts`.

| Direction | Event | Payload schema | Ack data |
| --- | --- | --- | --- |
| C→S | `room:create` | `createRoomRequestSchema` (`displayName`, `language` — the room's alphabet, §2B.13) | `roomAckSchema` (`roomCode`, `you`, caller-private `resumeToken`) |
| C→S | `room:join` | `joinRoomRequestSchema` | `roomAckSchema` |
| C→S | `room:quick-play` | `quickPlayRequestSchema` (`displayName`, `language`) | `quickPlayAckSchema` (`queued`, or `matched` + room ack fields) |
| C→S | `room:cancel-quick-play` | `cancelQuickPlayRequestSchema` (empty) | empty |
| C→S | `room:play-ai` | `playAiRequestSchema` (`displayName`, `language`) | `roomAckSchema` — Week 4, §2B.3 |
| C→S | `room:client-ready` | `clientReadyRequestSchema` | `clientReadyAckSchema` |
| C→S | `round:draft` | `draftRequestSchema` | `draftAckSchema` |
| C→S | `round:finish` | `finishRequestSchema` | `finishAckSchema` |
| C→S | `round:hint` | `hintRequestSchema` | `hintAckSchema` (`clue` or `no_known_term`, with `hintsLeft`) — Week 4, §2B.8 |
| S→C | `room:state` | `roomStateSchema` (players carry `bot`) | — |
| S→C | `round:scheduled` | `roundScheduledSchema` | — |
| S→C | `round:player-finished` | `playerFinishedSchema` | — |
| S→C | `round:revealed` | `roundRevealedSchema` (per answer: `valid`, reject `reason`, `hinted`) | — |
| S→C | `round:results` | `roundResultsSchema` (with `verified`, `botFailed`) | — |
| S→C | `game:error` | `gameErrorSchema` | — |

Leaving a room has **no event**: the client drops its socket and the server's
disconnect path handles it (`Plan.md` §2B.10). The private resume token is
returned only in the caller's own ack and is never part of `room:state` or any
broadcast.

## Error-code registry (closed set)

Return exactly these codes. Do not invent a new string at a call site: add it
to `GAME_ERROR_CODES` and this table first, with a test. The server's message
is in `errors.ts`; the client shows the text for the player's language from
`src/client/strings.ts`, looked up by code.

| Code | When |
| --- | --- |
| `INVALID_PAYLOAD` | Zod parse failed |
| `ROOM_NOT_FOUND` | Unknown, expired or released room code |
| `ROOM_FULL` | Third player attempts to join |
| `NOT_IN_ROOM` | Socket is not a bound player |
| `WRONG_PHASE` | Event does not belong to current phase, or the socket is already in a room |
| `ROUND_STALE` | `roundId` is not the active round |
| `TOO_EARLY` | Mutation before `startsAt` |
| `TOO_LATE` | Mutation at or after `endsAt` |
| `ALREADY_FINISHED` | Draft or hint after that player locked |
| `STALE_REVISION` | Older revision than the accepted one |
| `RATE_LIMITED` | Event flood from one socket, or the visitor's hourly AI rooms or hints are spent (`Plan.md` §2B.11) |
| `AI_UNAVAILABLE` | No AI configured, or the AI call failed or timed out (AI room, hint) |
| `AI_LIMIT` | The server's daily AI call budget is spent (play-ai, hint; `Plan.md` §2B.11), or every configured model, on both Gemini and Groq, is out of its daily free quota (hint). Both providers share one interleaved model chain, so one provider running out is not enough |
| `HINT_LIMIT` | Hint while one is pending, for an already hinted category, or beyond `HINTS_PER_ROUND` |
| `INTERNAL` | Unexpected server error |

Rules that apply to every rejection:

1. The canonical room state is **unchanged**. Validate fully, then mutate.
2. The message contains no stack trace, file path, token, opponent answer, AI
   reply, or internal identifier.
3. The rejection is delivered through the ack, not as a thrown exception that
   kills the socket handler.
4. Each code has at least one test proving both the rejection and the
   no-mutation property.

## Week 5 coach contracts

The W05 `round:coach` request and terminal ack are defined once in `src/contracts/coach.schemas.ts` and mapped in `src/contracts/socket.schemas.ts`. Keep the request strict and owner/seat/room fields server-derived. `CoachRunView` is terminal-only: completed includes validated evidence; stopped/failed has `result: null`. Do not add progress/cancel/broadcast event variants. See `specs/010-post-round-coach/contracts/coach-contract.md` and `docs/TOOL_CONTRACTS.md` for the canonical contract.
