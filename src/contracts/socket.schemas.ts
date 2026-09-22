import { z } from "zod";
import {
  answerValueSchema,
  categorySchema,
  closedReasonSchema,
  categoryScoreSchema,
  displayNameSchema,
  epochMsSchema,
  letterSchema,
  outcomeSchema,
  playerSlotSchema,
  resumeTokenSchema,
  revisionSchema,
  roomCodeSchema,
  roomPhaseSchema,
  roundIdSchema,
} from "./game.schemas";

/* ------------------------------------------------------- client -> server */
/*
 * Every request schema is .strict(). An unexpected key is a rejection, not an
 * ignored field: this is what stops a browser smuggling `letter`, `playerId`,
 * `score`, `endsAt` or `phase` into a mutation.
 */

export const createRoomRequestSchema = z.object({ displayName: displayNameSchema }).strict();
export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>;

export const joinRoomRequestSchema = z
  .object({ roomCode: roomCodeSchema, displayName: displayNameSchema })
  .strict();
export type JoinRoomRequest = z.infer<typeof joinRoomRequestSchema>;

export const clientReadyRequestSchema = z.object({ roomCode: roomCodeSchema }).strict();
export type ClientReadyRequest = z.infer<typeof clientReadyRequestSchema>;

export const draftRequestSchema = z
  .object({
    roundId: roundIdSchema,
    category: categorySchema,
    value: answerValueSchema,
    revision: revisionSchema,
  })
  .strict();
export type DraftRequest = z.infer<typeof draftRequestSchema>;

export const finishRequestSchema = z.object({ roundId: roundIdSchema }).strict();
export type FinishRequest = z.infer<typeof finishRequestSchema>;

/* ------------------------------------------------------- acknowledgements */

/** Returned only to the caller. `resumeToken` is never broadcast. */
export const roomAckSchema = z
  .object({ roomCode: roomCodeSchema, you: playerSlotSchema, resumeToken: resumeTokenSchema })
  .strict();
export type RoomAck = z.infer<typeof roomAckSchema>;

export const clientReadyAckSchema = z.object({ accepted: z.literal(true) }).strict();
export type ClientReadyAck = z.infer<typeof clientReadyAckSchema>;

export const draftAckSchema = z
  .object({ category: categorySchema, acceptedRevision: revisionSchema })
  .strict();
export type DraftAck = z.infer<typeof draftAckSchema>;

export const finishAckSchema = z.object({ finished: z.literal(true) }).strict();
export type FinishAck = z.infer<typeof finishAckSchema>;

/* ------------------------------------------------------- server -> client */

export const publicPlayerSchema = z
  .object({
    slot: playerSlotSchema,
    displayName: displayNameSchema,
    connected: z.boolean(),
    clientReady: z.boolean(),
    finished: z.boolean(),
  })
  .strict();
export type PublicPlayer = z.infer<typeof publicPlayerSchema>;

export const roomStateSchema = z
  .object({
    roomCode: roomCodeSchema,
    phase: roomPhaseSchema,
    you: playerSlotSchema,
    players: z.array(publicPlayerSchema).max(2),
  })
  .strict();
export type RoomState = z.infer<typeof roomStateSchema>;

export const roundScheduledSchema = z
  .object({
    roundId: roundIdSchema,
    letter: letterSchema,
    categories: z.array(categorySchema).length(6),
    serverNow: epochMsSchema,
    startsAt: epochMsSchema,
    endsAt: epochMsSchema,
  })
  .strict();
export type RoundScheduled = z.infer<typeof roundScheduledSchema>;

export const playerFinishedSchema = z.object({ slot: playerSlotSchema }).strict();
export type PlayerFinished = z.infer<typeof playerFinishedSchema>;

export const revealedAnswerSchema = z
  .object({
    category: categorySchema,
    raw: z.string(),
    normalized: z.string(),
    valid: z.boolean(),
  })
  .strict();
export type RevealedAnswer = z.infer<typeof revealedAnswerSchema>;

export const roundRevealedSchema = z
  .object({
    roundId: roundIdSchema,
    letter: letterSchema,
    closedReason: closedReasonSchema,
    player1: z.array(revealedAnswerSchema).length(6),
    player2: z.array(revealedAnswerSchema).length(6),
  })
  .strict();
export type RoundRevealed = z.infer<typeof roundRevealedSchema>;

export const roundResultsSchema = z
  .object({
    roundId: roundIdSchema,
    scores: z.array(categoryScoreSchema).length(6),
    player1Total: z.number().int().nonnegative(),
    player2Total: z.number().int().nonnegative(),
    outcome: outcomeSchema,
  })
  .strict();
export type RoundResults = z.infer<typeof roundResultsSchema>;

/* ------------------------------------------------------------ event names */

export const CLIENT_EVENTS = {
  createRoom: "room:create",
  joinRoom: "room:join",
  clientReady: "room:client-ready",
  draft: "round:draft",
  finish: "round:finish",
} as const;

export const SERVER_EVENTS = {
  roomState: "room:state",
  roundScheduled: "round:scheduled",
  playerFinished: "round:player-finished",
  roundRevealed: "round:revealed",
  roundResults: "round:results",
  gameError: "game:error",
} as const;
