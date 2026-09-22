---
description: "The authoritative Zod schema set, the socket event map, and the closed error-code registry. Copy these definitions; do not invent parallel ones."
applyTo: "**/*"
---

# Contracts and Errors Instructions

## Rule

`src/contracts` is the **only** place where a boundary shape is defined. The
client, the server and the tests all import from it. Writing a second interface
that describes the same payload is a defect, even if the fields match.

Every type is inferred with `z.infer`. A hand-written `interface` describing a
socket payload is rejected in review.

The layer is three files: `game.schemas.ts` (constants and primitives),
`errors.ts` (the closed error registry and the `Ack` envelope), and
`socket.schemas.ts` (request, ack and server-event payloads, plus the event-name
constants `CLIENT_EVENTS` / `SERVER_EVENTS`).

## `src/contracts/game.schemas.ts`

```ts
import { z } from "zod";

export const CATEGORIES = ["country", "city", "river", "mountain", "plant", "animal"] as const;
export const SUPPORTED_LETTERS = ["A", "B", "D", "K", "M", "S", "V"] as const;
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const MAX_ANSWER_LENGTH = 40;

export const CATEGORY_LABELS_SR: Record<Category, string> = {
  country: "Država",
  city: "Grad",
  river: "Reka",
  mountain: "Planina",
  plant: "Biljka",
  animal: "Životinja",
};

export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;

export const letterSchema = z.enum(SUPPORTED_LETTERS);
export type Letter = z.infer<typeof letterSchema>;

export const roomCodeSchema = z.string().length(6).regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
export const displayNameSchema = z.string().trim().min(1).max(24);
export const answerValueSchema = z.string().max(MAX_ANSWER_LENGTH);
export const roundIdSchema = z.string().uuid();
export const revisionSchema = z.number().int().nonnegative().max(100_000);
export const epochMsSchema = z.number().int().positive();

export const roomPhaseSchema = z.enum([
  "waiting_for_player",
  "synchronizing",
  "countdown",
  "answering",
  "results",
  "closed",
]);
export type RoomPhase = z.infer<typeof roomPhaseSchema>;

export const scoreReasonSchema = z.enum([
  "both_different",
  "same_answer",
  "only_player_1",
  "only_player_2",
  "neither",
]);

export const pointsSchema = z.union([z.literal(0), z.literal(5), z.literal(10)]);

export const categoryScoreSchema = z.object({
  category: categorySchema,
  player1Points: pointsSchema,
  player2Points: pointsSchema,
  reason: scoreReasonSchema,
});
export type CategoryScore = z.infer<typeof categoryScoreSchema>;

export const serverConfigSchema = z.object({
  port: z.coerce.number().int().min(1).max(65_535).default(3000),
  nodeEnv: z.enum(["development", "test", "production"]).default("development"),
  roundDurationMs: z.coerce.number().int().min(5_000).max(600_000).default(90_000),
  countdownMs: z.coerce.number().int().min(1_000).max(30_000).default(3_000),
  completedRoomTtlMs: z.coerce.number().int().min(10_000).default(300_000),
  waitingRoomTtlMs: z.coerce.number().int().min(60_000).default(1_800_000),
});
export type ServerConfig = z.infer<typeof serverConfigSchema>;
```

`serverConfigSchema.parse()` runs once at startup against `process.env`. An
invalid value exits the process with a clear message; it never falls back to
`NaN` or an unbounded number.

## `src/contracts/socket.schemas.ts`

Client payloads use `.strict()` so that an unexpected key is a rejection, not a
silently ignored field. This is what stops a browser from smuggling `letter`,
`playerId`, `score`, `endsAt` or `phase` into a mutation.

```ts
import { z } from "zod";
import {
  answerValueSchema, categorySchema, displayNameSchema, epochMsSchema,
  categoryScoreSchema, letterSchema, revisionSchema, roomCodeSchema,
  roomPhaseSchema, roundIdSchema,
} from "./game.schemas";

/* ---------- client -> server ---------- */

export const createRoomRequestSchema = z.object({
  displayName: displayNameSchema,
}).strict();

export const joinRoomRequestSchema = z.object({
  roomCode: roomCodeSchema,
  displayName: displayNameSchema,
}).strict();

export const clientReadyRequestSchema = z.object({
  roomCode: roomCodeSchema,
}).strict();

export const draftRequestSchema = z.object({
  roundId: roundIdSchema,
  category: categorySchema,
  value: answerValueSchema,
  revision: revisionSchema,
}).strict();

export const finishRequestSchema = z.object({
  roundId: roundIdSchema,
}).strict();

/* ---------- server -> client ---------- */

export const publicPlayerSchema = z.object({
  slot: z.union([z.literal(1), z.literal(2)]),
  displayName: displayNameSchema,
  connected: z.boolean(),
  clientReady: z.boolean(),
  finished: z.boolean(),
}).strict();

export const roomStateSchema = z.object({
  roomCode: roomCodeSchema,
  phase: roomPhaseSchema,
  you: z.union([z.literal(1), z.literal(2)]),
  players: z.array(publicPlayerSchema).max(2),
}).strict();

export const roundScheduledSchema = z.object({
  roundId: roundIdSchema,
  letter: letterSchema,
  categories: z.array(categorySchema).length(6),
  serverNow: epochMsSchema,
  startsAt: epochMsSchema,
  endsAt: epochMsSchema,
}).strict();

export const draftAckSchema = z.object({
  category: categorySchema,
  acceptedRevision: revisionSchema,
}).strict();

export const revealedAnswerSchema = z.object({
  category: categorySchema,
  raw: z.string(),
  normalized: z.string(),
  valid: z.boolean(),
}).strict();

export const roundRevealedSchema = z.object({
  roundId: roundIdSchema,
  letter: letterSchema,
  closedReason: z.enum(["both_finished", "deadline"]),
  player1: z.array(revealedAnswerSchema).length(6),
  player2: z.array(revealedAnswerSchema).length(6),
}).strict();

export const roundResultsSchema = z.object({
  roundId: roundIdSchema,
  scores: z.array(categoryScoreSchema).length(6),
  player1Total: z.number().int().nonnegative(),
  player2Total: z.number().int().nonnegative(),
  outcome: z.enum(["player_1", "player_2", "draw"]),
}).strict();
```

## Acknowledgement envelope

Every client-to-server event takes a callback with this shape. Nothing else.

```ts
export type Ack<T> = { ok: true; data: T } | { ok: false; error: GameError };

export function ok<T>(data: T): Ack<T>;
export function fail<T = never>(code: GameErrorCode): Ack<T>;
export function ackSchema<T extends z.ZodTypeAny>(data: T); // runtime shape, for tests and the client
```

Handlers build acks with `ok()` / `fail()` from `src/contracts/errors.ts`, so a
message can never drift from the registry.

The client must handle `ok: false` for every call it makes. Ignoring an ack is
a defect, because rejection is how the server communicates timing and privacy
decisions.

## Socket event map

| Direction | Event | Payload schema | Ack data |
| --- | --- | --- | --- |
| C→S | `room:create` | `createRoomRequestSchema` | `roomAckSchema` (`roomCode`, `you`, caller-private `resumeToken`) |
| C→S | `room:join` | `joinRoomRequestSchema` | `roomAckSchema` |
| C→S | `room:client-ready` | `clientReadyRequestSchema` | `clientReadyAckSchema` |
| C→S | `round:draft` | `draftRequestSchema` | `draftAckSchema` |
| C→S | `round:finish` | `finishRequestSchema` | `finishAckSchema` |
| S→C | `room:state` | `roomStateSchema` | — |
| S→C | `round:scheduled` | `roundScheduledSchema` | — |
| S→C | `round:player-finished` | `{ slot }` | — |
| S→C | `round:revealed` | `roundRevealedSchema` | — |
| S→C | `round:results` | `roundResultsSchema` | — |
| S→C | `game:error` | `{ code, message }` | — |

There are no other events in Core. The private resume token is returned **only**
in the `room:create` / `room:join` ack to the caller, and is never part of
`room:state` or any broadcast.

## Error-code registry (closed set)

Return exactly these codes. Do not invent a new string at a call site; add it
here first, with a test.

| Code | When | Client-safe message |
| --- | --- | --- |
| `INVALID_PAYLOAD` | Zod parse failed | "That request was not valid." |
| `ROOM_NOT_FOUND` | Unknown or expired room code | "Room not found. Check the code." |
| `ROOM_FULL` | Third player attempts to join | "That room already has two players." |
| `NOT_IN_ROOM` | Socket is not a bound player | "You are not in this room." |
| `WRONG_PHASE` | Event does not belong to current phase | "That action is not available right now." |
| `ROUND_STALE` | `roundId` is not the active round | "That round has already ended." |
| `TOO_EARLY` | Mutation before `startsAt` | "The round has not started yet." |
| `TOO_LATE` | Mutation at or after `endsAt` | "Time is up." |
| `ALREADY_FINISHED` | Draft after that player locked | "Your answers are already locked." |
| `STALE_REVISION` | Older revision than the accepted one | "A newer answer was already saved." |
| `RATE_LIMITED` | Event flood from one socket | "Too many requests. Slow down." |
| `INTERNAL` | Unexpected server error | "Something went wrong." |

Rules that apply to every rejection:

1. The canonical room state is **unchanged**. Validate fully, then mutate.
2. The message contains no stack trace, file path, token, opponent answer, or
   internal identifier.
3. The rejection is delivered through the ack, not as a thrown exception that
   kills the socket handler.
4. Each code has at least one test proving both the rejection and the
   no-mutation property.
