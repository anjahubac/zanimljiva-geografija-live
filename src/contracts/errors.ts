import { z } from "zod";

/**
 * Closed set. A handler may only return a code listed here; adding one means
 * editing this file and module 12, and adding a test.
 */
export const GAME_ERROR_CODES = [
  "INVALID_PAYLOAD",
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "NOT_IN_ROOM",
  "WRONG_PHASE",
  "ROUND_STALE",
  "TOO_EARLY",
  "TOO_LATE",
  "ALREADY_FINISHED",
  "STALE_REVISION",
  "RATE_LIMITED",
  "INTERNAL",
] as const;

export const gameErrorCodeSchema = z.enum(GAME_ERROR_CODES);
export type GameErrorCode = z.infer<typeof gameErrorCodeSchema>;

/**
 * Client-facing text. Deliberately vague: no stack, path, token, internal id or
 * opponent answer may ever reach a client.
 */
export const ERROR_MESSAGES: Record<GameErrorCode, string> = {
  INVALID_PAYLOAD: "That request was not valid.",
  ROOM_NOT_FOUND: "Room not found. Check the code.",
  ROOM_FULL: "That room already has two players.",
  NOT_IN_ROOM: "You are not in this room.",
  WRONG_PHASE: "That action is not available right now.",
  ROUND_STALE: "That round has already ended.",
  TOO_EARLY: "The round has not started yet.",
  TOO_LATE: "Time is up.",
  ALREADY_FINISHED: "Your answers are already locked.",
  STALE_REVISION: "A newer answer was already saved.",
  RATE_LIMITED: "Too many requests. Slow down.",
  INTERNAL: "Something went wrong.",
};

export const gameErrorSchema = z
  .object({ code: gameErrorCodeSchema, message: z.string().min(1) })
  .strict();
export type GameError = z.infer<typeof gameErrorSchema>;

export function gameError(code: GameErrorCode): GameError {
  return { code, message: ERROR_MESSAGES[code] };
}

/* --------------------------------------------------------- ack envelope */

export type Ack<T> = { ok: true; data: T } | { ok: false; error: GameError };

export function ok<T>(data: T): Ack<T> {
  return { ok: true, data };
}

export function fail<T = never>(code: GameErrorCode): Ack<T> {
  return { ok: false, error: gameError(code) };
}

/** Runtime schema for an ack, used by tests and by the client adapter. */
export function ackSchema<T extends z.ZodTypeAny>(data: T) {
  return z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data }).strict(),
    z.object({ ok: z.literal(false), error: gameErrorSchema }).strict(),
  ]);
}
