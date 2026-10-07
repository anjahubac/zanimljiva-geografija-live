import { io, type Socket } from "socket.io-client";
import { type Ack, ackSchema, gameError, gameErrorSchema } from "@contracts/errors";
import type { Language } from "@contracts/game.schemas";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  clientReadyAckSchema,
  draftAckSchema,
  finishAckSchema,
  hintAckSchema,
  playerFinishedSchema,
  quickPlayAckSchema,
  roomAckSchema,
  roomStateSchema,
  roundResultsSchema,
  roundRevealedSchema,
  roundScheduledSchema,
  type ClientReadyAck,
  type CreateRoomRequest,
  type DraftAck,
  type DraftRequest,
  type FinishAck,
  type HintAck,
  type HintRequest,
  type PlayAiRequest,
  type PlayerFinished,
  type QuickPlayAck,
  type QuickPlayRequest,
  type RoomAck,
  type RoomState,
  type RoundResults,
  type RoundRevealed,
  type RoundScheduled,
} from "@contracts/socket.schemas";
import type { GameError } from "@contracts/errors";
import { coachReportSchema, type CoachReport, type CoachRequest } from "@contracts/coach.schemas";
import type { z } from "zod";

/**
 * The only place the browser talks to the server. Every acknowledgement and
 * every pushed payload is parsed with the shared schema before it reaches
 * application state: an unparsable message is treated as an error, never
 * rendered on trust.
 */
/**
 * How long the browser waits for a coach report: 10 s beyond the server's
 * 35 s (the 25 s run deadline plus the repair step's 10 s, owner 2026-10-07;
 * `Plan.md` §2C, FR-023). The only ack with a timeout.
 */
export const COACH_ACK_TIMEOUT_MS = 45_000;

/** Null when no answer came in time; otherwise the parsed ack, a malformed one as INTERNAL. */
export function parseCoachAck(error: unknown, raw: unknown): Ack<CoachReport> | null {
  if (error) return null;
  const parsed = ackSchema(coachReportSchema).safeParse(raw);
  return parsed.success ? (parsed.data as Ack<CoachReport>) : { ok: false, error: gameError("INTERNAL") };
}

export type GameSocket = {
  readonly socket: Socket;
  /** `language` is the interface language; it picks the room's alphabet (§2B.13). */
  createRoom(displayName: string, language: Language): Promise<Ack<RoomAck>>;
  joinRoom(roomCode: string, displayName: string): Promise<Ack<RoomAck>>;
  quickPlay(displayName: string, language: Language): Promise<Ack<QuickPlayAck>>;
  cancelQuickPlay(): Promise<Ack<ClientReadyAck>>;
  playAi(displayName: string, language: Language): Promise<Ack<RoomAck>>;
  requestHint(input: HintRequest): Promise<Ack<HintAck>>;
  /** Week 5 (§2C). Resolves null when no report arrives within `COACH_ACK_TIMEOUT_MS`. */
  requestCoach(input: CoachRequest): Promise<Ack<CoachReport> | null>;
  clientReady(roomCode: string): Promise<Ack<ClientReadyAck>>;
  sendDraft(input: DraftRequest): Promise<Ack<DraftAck>>;
  finishRound(roundId: string): Promise<Ack<FinishAck>>;
  onRoomState(handler: (payload: RoomState) => void): void;
  onRoundScheduled(handler: (payload: RoundScheduled) => void): void;
  onPlayerFinished(handler: (payload: PlayerFinished) => void): void;
  onRoundRevealed(handler: (payload: RoundRevealed) => void): void;
  onRoundResults(handler: (payload: RoundResults) => void): void;
  onGameError(handler: (payload: GameError) => void): void;
  onConnectionChange(handler: (connected: boolean) => void): void;
  disconnect(): void;
};

export function createGameSocket(url?: string): GameSocket {
  // Same origin in production: the Node process serves the SPA and the socket.
  const socket = url ? io(url, { reconnection: false }) : io({ reconnection: false });

  function emitAck<S extends z.ZodTypeAny>(
    event: string,
    payload: unknown,
    dataSchema: S,
  ): Promise<Ack<z.infer<S>>> {
    return new Promise((resolve) => {
      socket.emit(event, payload, (raw: unknown) => {
        const parsed = ackSchema(dataSchema).safeParse(raw);
        // A malformed acknowledgement is a failure, not something to guess at.
        resolve(parsed.success ? (parsed.data as Ack<z.infer<S>>) : { ok: false, error: gameError("INTERNAL") });
      });
    });
  }

  function subscribe<S extends z.ZodTypeAny>(
    event: string,
    schema: S,
    handler: (payload: z.infer<S>) => void,
  ): void {
    socket.on(event, (raw: unknown) => {
      const parsed = schema.safeParse(raw);
      if (parsed.success) handler(parsed.data as z.infer<S>);
    });
  }

  return {
    socket,
    createRoom: (displayName, language) =>
      emitAck(CLIENT_EVENTS.createRoom, { displayName, language } satisfies CreateRoomRequest, roomAckSchema),
    joinRoom: (roomCode, displayName) =>
      emitAck(CLIENT_EVENTS.joinRoom, { roomCode, displayName }, roomAckSchema),
    quickPlay: (displayName, language) =>
      emitAck(CLIENT_EVENTS.quickPlay, { displayName, language } satisfies QuickPlayRequest, quickPlayAckSchema),
    cancelQuickPlay: () =>
      emitAck(CLIENT_EVENTS.cancelQuickPlay, {}, clientReadyAckSchema),
    playAi: (displayName, language) =>
      emitAck(CLIENT_EVENTS.playAi, { displayName, language } satisfies PlayAiRequest, roomAckSchema),
    requestHint: (input) => emitAck(CLIENT_EVENTS.hint, input, hintAckSchema),
    requestCoach: (input) =>
      new Promise((resolve) => {
        socket.timeout(COACH_ACK_TIMEOUT_MS).emit(CLIENT_EVENTS.coach, input, (error: unknown, raw: unknown) => {
          resolve(parseCoachAck(error, raw));
        });
      }),
    clientReady: (roomCode) =>
      emitAck(CLIENT_EVENTS.clientReady, { roomCode }, clientReadyAckSchema),
    sendDraft: (input) => emitAck(CLIENT_EVENTS.draft, input, draftAckSchema),
    finishRound: (roundId) => emitAck(CLIENT_EVENTS.finish, { roundId }, finishAckSchema),

    onRoomState: (handler) => subscribe(SERVER_EVENTS.roomState, roomStateSchema, handler),
    onRoundScheduled: (handler) =>
      subscribe(SERVER_EVENTS.roundScheduled, roundScheduledSchema, handler),
    onPlayerFinished: (handler) =>
      subscribe(SERVER_EVENTS.playerFinished, playerFinishedSchema, handler),
    onRoundRevealed: (handler) =>
      subscribe(SERVER_EVENTS.roundRevealed, roundRevealedSchema, handler),
    onRoundResults: (handler) => subscribe(SERVER_EVENTS.roundResults, roundResultsSchema, handler),
    onGameError: (handler) => subscribe(SERVER_EVENTS.gameError, gameErrorSchema, handler),
    onConnectionChange: (handler) => {
      socket.on("connect", () => handler(true));
      socket.on("disconnect", () => handler(false));
    },
    disconnect: () => socket.disconnect(),
  };
}
