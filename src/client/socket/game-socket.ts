import { io, type Socket } from "socket.io-client";
import { type Ack, ackSchema, gameError, gameErrorSchema } from "@contracts/errors";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  clientReadyAckSchema,
  draftAckSchema,
  finishAckSchema,
  playerFinishedSchema,
  quickPlayAckSchema,
  roomAckSchema,
  roomStateSchema,
  roundResultsSchema,
  roundRevealedSchema,
  roundScheduledSchema,
  type ClientReadyAck,
  type DraftAck,
  type DraftRequest,
  type FinishAck,
  type PlayerFinished,
  type QuickPlayAck,
  type RoomAck,
  type RoomState,
  type RoundResults,
  type RoundRevealed,
  type RoundScheduled,
} from "@contracts/socket.schemas";
import type { GameError } from "@contracts/errors";
import type { z } from "zod";

/**
 * The only place the browser talks to the server. Every acknowledgement and
 * every pushed payload is parsed with the shared schema before it reaches
 * application state: an unparsable message is treated as an error, never
 * rendered on trust.
 */
export type GameSocket = {
  readonly socket: Socket;
  createRoom(displayName: string): Promise<Ack<RoomAck>>;
  joinRoom(roomCode: string, displayName: string): Promise<Ack<RoomAck>>;
  quickPlay(displayName: string): Promise<Ack<QuickPlayAck>>;
  cancelQuickPlay(): Promise<Ack<ClientReadyAck>>;
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
    createRoom: (displayName) =>
      emitAck(CLIENT_EVENTS.createRoom, { displayName }, roomAckSchema),
    joinRoom: (roomCode, displayName) =>
      emitAck(CLIENT_EVENTS.joinRoom, { roomCode, displayName }, roomAckSchema),
    quickPlay: (displayName) =>
      emitAck(CLIENT_EVENTS.quickPlay, { displayName }, quickPlayAckSchema),
    cancelQuickPlay: () =>
      emitAck(CLIENT_EVENTS.cancelQuickPlay, {}, clientReadyAckSchema),
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
