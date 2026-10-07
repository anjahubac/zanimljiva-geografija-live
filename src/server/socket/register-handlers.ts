import type { Server, Socket } from "socket.io";
import type { z } from "zod";
import { type Ack, fail, ok } from "@contracts/errors";
import { coachRequestSchema } from "@contracts/coach.schemas";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  clientReadyAckSchema,
  clientReadyRequestSchema,
  createRoomRequestSchema,
  draftRequestSchema,
  finishRequestSchema,
  hintRequestSchema,
  joinRoomRequestSchema,
  playAiRequestSchema,
  roomAckSchema,
  quickPlayRequestSchema,
  quickPlayAckSchema,
  cancelQuickPlayRequestSchema,
} from "@contracts/socket.schemas";
import type { RoomStore } from "@server/rooms/room-store";
import { visitorAddress } from "@server/usage-limits";

/**
 * Flood protection for one socket. Wall-clock time is correct here: this is a
 * transport concern, unrelated to the canonical round clock, which stays
 * injected everywhere it decides game outcomes.
 */
const RATE_LIMIT_WINDOW_MS = 1_000;
const RATE_LIMIT_MAX_EVENTS = 60;

type AckCallback = (response: unknown) => void;

function createRateLimiter() {
  const windows = new Map<string, { startedAt: number; count: number }>();

  return {
    allow(socketId: string): boolean {
      const now = Date.now();
      const current = windows.get(socketId);
      if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
        windows.set(socketId, { startedAt: now, count: 1 });
        return true;
      }
      current.count += 1;
      return current.count <= RATE_LIMIT_MAX_EVENTS;
    },
    forget(socketId: string): void {
      windows.delete(socketId);
    },
  };
}

/**
 * The socket layer only translates events into store calls. It owns no phase,
 * no timing and no scoring decision: it parses, resolves the caller from the
 * socket (never from the payload), delegates, and acknowledges.
 */
export function registerHandlers(io: Server, store: RoomStore, options: { trustProxyHops: number }): void {
  const limiter = createRateLimiter();

  io.on("connection", (socket: Socket) => {
    // Who the AI usage limits count against (§2B.11); read once, from the transport, never the payload.
    const visitor = visitorAddress(
      socket.handshake.headers["x-forwarded-for"],
      socket.handshake.address,
      options.trustProxyHops,
    );

    const handle = <S extends z.ZodTypeAny, T>(
      event: string,
      schema: S,
      raw: unknown,
      ack: unknown,
      run: (input: z.infer<S>) => Ack<T> | Promise<Ack<T> | null>,
    ): void => {
      const respond = (response: Ack<T> | null): void => {
        // Null: a cancelled coach run, which answers nobody (§2C.9).
        if (response === null) return;
        if (typeof ack === "function") {
          (ack as AckCallback)(response);
          return;
        }
        // A client that omitted the acknowledgement still learns it was
        // rejected, because ignoring a rejection is how UIs desynchronize.
        if (!response.ok) socket.emit(SERVER_EVENTS.gameError, response.error);
      };

      if (!limiter.allow(socket.id)) {
        respond(fail("RATE_LIMITED"));
        return;
      }

      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        // The parse error itself is not logged: it quotes the rejected value,
        // which may be an unrevealed answer.
        respond(fail("INVALID_PAYLOAD"));
        return;
      }

      const failed = (error: unknown): void => {
        // Event name and error type only. A message or stack could carry an
        // answer, a token, or a path (module 05).
        console.error(`handler failed: event=${event} error=${(error as Error)?.name ?? "unknown"}`);
        respond(fail("INTERNAL"));
      };

      try {
        // Only a hint and the coach await the AI; every other handler answers synchronously.
        void Promise.resolve(run(parsed.data as z.infer<S>)).then(respond, failed);
      } catch (error) {
        failed(error);
      }
    };

    socket.on(CLIENT_EVENTS.createRoom, (raw: unknown, ack: unknown) => {
      handle(CLIENT_EVENTS.createRoom, createRoomRequestSchema, raw, ack, (input) => {
        const existing = store.getRoomBySocket(socket.id);
        if (existing) {
          const player = Object.values(existing.players).find((each) => each.socketId === socket.id);
          if (!player) return fail("NOT_IN_ROOM");
          return ok(roomAckSchema.parse({ roomCode: existing.roomCode, you: player.slot, resumeToken: player.resumeToken }));
        }
        const created = store.createRoom(input.displayName, socket.id, input.language);
        return ok(
          roomAckSchema.parse({
            roomCode: created.room.roomCode,
            you: created.slot,
            resumeToken: created.resumeToken,
          }),
        );
      });
    });

    socket.on(CLIENT_EVENTS.joinRoom, (raw: unknown, ack: unknown) => {
      handle(CLIENT_EVENTS.joinRoom, joinRoomRequestSchema, raw, ack, (input) => {
        if (store.getRoomBySocket(socket.id)) return fail("WRONG_PHASE");
        const joined = store.joinRoom(input.roomCode, input.displayName, socket.id);
        if (!joined.ok) return joined;
        return ok(
          roomAckSchema.parse({
            roomCode: joined.data.room.roomCode,
            you: joined.data.slot,
            resumeToken: joined.data.resumeToken,
          }),
        );
      });
    });

    socket.on(CLIENT_EVENTS.quickPlay, (raw: unknown, ack: unknown) => {
      handle(CLIENT_EVENTS.quickPlay, quickPlayRequestSchema, raw, ack, (input) => {
        const result = store.quickPlay(input.displayName, socket.id, input.language);
        if (!result.ok) return result;

        return ok(
          quickPlayAckSchema.parse(
            result.data.status === "queued"
              ? { status: "queued" }
              : {
                  status: "matched",
                  roomCode: result.data.room.roomCode,
                  you: result.data.slot,
                  resumeToken: result.data.resumeToken,
                },
          ),
        );
      });
    });

    socket.on(CLIENT_EVENTS.playAi, (raw: unknown, ack: unknown) => {
      handle(CLIENT_EVENTS.playAi, playAiRequestSchema, raw, ack, (input) => {
        const created = store.createAiRoom(input.displayName, socket.id, input.language, visitor);
        if (!created.ok) return created;
        return ok(
          roomAckSchema.parse({
            roomCode: created.data.room.roomCode,
            you: created.data.slot,
            resumeToken: created.data.resumeToken,
          }),
        );
      });
    });

    socket.on(CLIENT_EVENTS.cancelQuickPlay, (raw: unknown, ack: unknown) => {
      handle(CLIENT_EVENTS.cancelQuickPlay, cancelQuickPlayRequestSchema, raw, ack, () => {
        store.cancelQuickPlay(socket.id);
        return ok({ accepted: true as const });
      });
    });

    socket.on(CLIENT_EVENTS.clientReady, (raw: unknown, ack: unknown) => {
      handle(CLIENT_EVENTS.clientReady, clientReadyRequestSchema, raw, ack, (input) => {
        const ready = store.markClientReady(input.roomCode, socket.id);
        if (!ready.ok) return ready;
        return ok(clientReadyAckSchema.parse(ready.data));
      });
    });

    socket.on(CLIENT_EVENTS.draft, (raw: unknown, ack: unknown) => {
      handle(CLIENT_EVENTS.draft, draftRequestSchema, raw, ack, (input) =>
        store.applyDraft(input, socket.id),
      );
    });

    socket.on(CLIENT_EVENTS.finish, (raw: unknown, ack: unknown) => {
      handle(CLIENT_EVENTS.finish, finishRequestSchema, raw, ack, (input) =>
        store.finish(input.roundId, socket.id),
      );
    });

    socket.on(CLIENT_EVENTS.hint, (raw: unknown, ack: unknown) => {
      handle(CLIENT_EVENTS.hint, hintRequestSchema, raw, ack, (input) => store.requestHint(input, socket.id, visitor));
    });

    // Week 5 (§2C): the round coach. The report is this ack, so it reaches only the caller.
    socket.on(CLIENT_EVENTS.coach, (raw: unknown, ack: unknown) => {
      handle(CLIENT_EVENTS.coach, coachRequestSchema, raw, ack, (input) => store.requestCoach(input, socket.id, visitor));
    });

    socket.on("disconnect", () => {
      limiter.forget(socket.id);
      store.markDisconnected(socket.id);
    });
  });
}
