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
  coachAckSchema,
  coachRequest,
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
  type CoachRequest,
  type CoachAck,
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
import type { z } from "zod";

/**
 * The only place the browser talks to the server. Every acknowledgement and
 * every pushed payload is parsed with the shared schema before it reaches
 * application state: an unparsable message is treated as an error, never
 * rendered on trust.
 */
export type GameSocket = {
  readonly socket: Socket;
  /** `language` is the interface language; it picks the room's alphabet (§2B.13). */
  createRoom(displayName: string, language: Language): Promise<Ack<RoomAck>>;
  joinRoom(roomCode: string, displayName: string): Promise<Ack<RoomAck>>;
  quickPlay(displayName: string, language: Language): Promise<Ack<QuickPlayAck>>;
  cancelQuickPlay(): Promise<Ack<ClientReadyAck>>;
  playAi(displayName: string, language: Language): Promise<Ack<RoomAck>>;
  requestHint(input: HintRequest): Promise<Ack<HintAck>>;
  reviewRound(input: CoachRequest, signal?: AbortSignal): Promise<Ack<CoachAck>>;
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
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<Ack<z.infer<S>>> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: Ack<z.infer<S>>) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve(result);
      };
      const onAbort = () => finish({ ok: false, error: gameError("AI_UNAVAILABLE") });
      const timer = timeoutMs === undefined ? undefined : setTimeout(() => {
        finish({ ok: false, error: gameError("AI_UNAVAILABLE") });
      }, timeoutMs);
      if (signal?.aborted) { onAbort(); return; }
      signal?.addEventListener("abort", onAbort, { once: true });
      if (!socket.connected && timeoutMs !== undefined) { finish({ ok: false, error: gameError("AI_UNAVAILABLE") }); return; }
      socket.emit(event, payload, (raw: unknown) => {
        if (settled) return;
        const parsed = ackSchema(dataSchema).safeParse(raw);
        // A malformed acknowledgement is a failure, not something to guess at.
        finish(parsed.success ? (parsed.data as Ack<z.infer<S>>) : { ok: false, error: gameError("INTERNAL") });
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
    reviewRound: (input, signal) => {
      const parsed = coachRequest.safeParse(input);
      if (!parsed.success) return Promise.resolve({ ok: false, error: gameError("INVALID_PAYLOAD") });
      return emitAck(CLIENT_EVENTS.coach, parsed.data, coachAckSchema, 32_000, signal).then((ack) =>
        ack.ok && ack.data.roundId !== parsed.data.roundId ? { ok: false, error: gameError("INTERNAL") } : ack,
      );
    },
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
