import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Socket } from "socket.io-client";
import { ERROR_MESSAGES, GAME_ERROR_CODES, type GameErrorCode } from "@contracts/errors";
import { CLIENT_EVENTS, SERVER_EVENTS, type RoundScheduled } from "@contracts/socket.schemas";
import { connectClient, emitAck, settle, waitFor } from "../helpers/socket-client";
import { startTestServer, type TestContext } from "../helpers/test-server";

/**
 * E3 from docs/EVALS.md: every code in the module 12 registry is produced by a
 * real rejection, and no rejection changes canonical state.
 */
describe("E3 invalid input never mutates canonical state", () => {
  let ctx: TestContext;
  let p1: Socket;
  let p2: Socket;
  let p3: Socket;
  let roomCode: string;
  let roundId: string;

  /** Codes actually observed in this suite, checked for completeness at the end. */
  const observed = new Set<GameErrorCode>();

  beforeEach(async () => {
    ctx = await startTestServer({ letter: "S" });
    p1 = await connectClient(ctx.port);
    p2 = await connectClient(ctx.port);
    p3 = await connectClient(ctx.port);

    const created = await emitAck<{ roomCode: string }>(p1, CLIENT_EVENTS.createRoom, {
      displayName: "Ana",
    });
    if (!created.ok) throw new Error("room was not created");
    roomCode = created.data.roomCode;

    await emitAck(p2, CLIENT_EVENTS.joinRoom, { roomCode, displayName: "Marko" });
    await emitAck(p1, CLIENT_EVENTS.clientReady, { roomCode });
    const scheduled = waitFor<RoundScheduled>(p1, SERVER_EVENTS.roundScheduled);
    await emitAck(p2, CLIENT_EVENTS.clientReady, { roomCode });
    roundId = (await scheduled).roundId;
  });

  afterEach(async () => {
    for (const socket of [p1, p2, p3]) socket.disconnect();
    await ctx.close();
  });

  /** Byte-identical canonical state before and after, plus the expected code. */
  async function expectRejection(
    code: GameErrorCode,
    attempt: () => Promise<{ ok: boolean; error?: { code: string; message: string } }>,
  ) {
    const room = ctx.server.store.getRoomByCode(roomCode);
    if (!room) throw new Error("room missing");
    const projectionBefore = JSON.stringify(ctx.server.store.projectRoomState(room, 1));
    const internalBefore = JSON.stringify(room);

    const result = await attempt();
    await settle();

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe(code);
    // The safe message comes from the registry: no stack, path, token or answer.
    expect(result.error?.message).toBe(ERROR_MESSAGES[code]);
    observed.add(code);

    const after = ctx.server.store.getRoomByCode(roomCode);
    if (!after) throw new Error("room missing");
    expect(JSON.stringify(ctx.server.store.projectRoomState(after, 1))).toBe(projectionBefore);
    expect(JSON.stringify(after)).toBe(internalBefore);
  }

  it("rejects a join for an unknown room code", async () => {
    await expectRejection("ROOM_NOT_FOUND", () =>
      emitAck(p3, CLIENT_EVENTS.joinRoom, { roomCode: "ZZZZZZ", displayName: "Cveta" }),
    );
  });

  it("rejects a third player", async () => {
    await expectRejection("ROOM_FULL", () =>
      emitAck(p3, CLIENT_EVENTS.joinRoom, { roomCode, displayName: "Cveta" }),
    );
  });

  it("rejects a ready acknowledgement from a socket that is not in the room", async () => {
    await expectRejection("NOT_IN_ROOM", () =>
      emitAck(p3, CLIENT_EVENTS.clientReady, { roomCode }),
    );
  });

  it("rejects a ready acknowledgement once the round is scheduled", async () => {
    await expectRejection("WRONG_PHASE", () =>
      emitAck(p1, CLIENT_EVENTS.clientReady, { roomCode }),
    );
  });

  it("rejects an unknown category", async () => {
    await expectRejection("INVALID_PAYLOAD", () =>
      emitAck(p1, CLIENT_EVENTS.draft, {
        roundId,
        category: "continent",
        value: "Srbija",
        revision: 1,
      }),
    );
  });

  it("rejects a draft carrying an extra authority key", async () => {
    await expectRejection("INVALID_PAYLOAD", () =>
      emitAck(p1, CLIENT_EVENTS.draft, {
        roundId,
        category: "country",
        value: "Srbija",
        revision: 1,
        score: 10,
      }),
    );
  });

  it("rejects an over-length answer at the schema boundary", async () => {
    await expectRejection("INVALID_PAYLOAD", () =>
      emitAck(p1, CLIENT_EVENTS.draft, {
        roundId,
        category: "country",
        value: "S".repeat(41),
        revision: 1,
      }),
    );
  });

  it("rejects a draft before startsAt", async () => {
    await expectRejection("TOO_EARLY", () =>
      emitAck(p1, CLIENT_EVENTS.draft, {
        roundId,
        category: "country",
        value: "Srbija",
        revision: 1,
      }),
    );
  });

  it("rejects a draft at or after endsAt, before the deadline callback runs", async () => {
    ctx.advance(ctx.config.countdownMs);
    const room = ctx.server.store.getRoomByCode(roomCode);
    // setNow, not advance: the wall clock passes endsAt while the deadline
    // timer has not fired, which is how a late draft reaches a still-open round.
    ctx.setNow(room?.round?.endsAt ?? 0);

    await expectRejection("TOO_LATE", () =>
      emitAck(p1, CLIENT_EVENTS.draft, {
        roundId,
        category: "country",
        value: "Srbija",
        revision: 1,
      }),
    );
  });

  it("rejects a draft after that player finished", async () => {
    ctx.advance(ctx.config.countdownMs);
    await emitAck(p1, CLIENT_EVENTS.draft, {
      roundId,
      category: "country",
      value: "Srbija",
      revision: 1,
    });
    await emitAck(p1, CLIENT_EVENTS.finish, { roundId });
    await settle();

    await expectRejection("ALREADY_FINISHED", () =>
      emitAck(p1, CLIENT_EVENTS.draft, {
        roundId,
        category: "country",
        value: "Slovenija",
        revision: 2,
      }),
    );
  });

  it("rejects a stale revision", async () => {
    ctx.advance(ctx.config.countdownMs);
    await emitAck(p1, CLIENT_EVENTS.draft, {
      roundId,
      category: "country",
      value: "Srbija",
      revision: 4,
    });
    await settle();

    await expectRejection("STALE_REVISION", () =>
      emitAck(p1, CLIENT_EVENTS.draft, {
        roundId,
        category: "country",
        value: "Slovenija",
        revision: 3,
      }),
    );
  });

  it("rejects a draft carrying a stale roundId", async () => {
    ctx.advance(ctx.config.countdownMs);
    await expectRejection("ROUND_STALE", () =>
      emitAck(p1, CLIENT_EVENTS.draft, {
        roundId: "11111111-2222-4333-8444-555555555555",
        category: "country",
        value: "Srbija",
        revision: 1,
      }),
    );
  });

  it("rate-limits one socket flooding the server", async () => {
    ctx.advance(ctx.config.countdownMs);

    // Well past the per-second budget, all from a single socket.
    const attempts = await Promise.all(
      Array.from({ length: 120 }, (_unused, index) =>
        emitAck<{ acceptedRevision: number }>(p1, CLIENT_EVENTS.draft, {
          roundId,
          category: "country",
          value: "Srbija",
          revision: index + 1,
        }),
      ),
    );

    const limited = attempts.filter(
      (attempt) => !attempt.ok && attempt.error.code === "RATE_LIMITED",
    );
    expect(limited.length).toBeGreaterThan(0);
    expect(limited[0]).toEqual({
      ok: false,
      error: { code: "RATE_LIMITED", message: ERROR_MESSAGES.RATE_LIMITED },
    });
    observed.add("RATE_LIMITED");

    // The opponent is unaffected by their neighbour's flood.
    const opponent = await emitAck(p2, CLIENT_EVENTS.draft, {
      roundId,
      category: "country",
      value: "Slovenija",
      revision: 1,
    });
    expect(opponent.ok).toBe(true);
  });

  it("returns a generic INTERNAL error when a handler throws, without leaking why", async () => {
    ctx.advance(ctx.config.countdownMs);

    // Fault injection: the only realistic way to exercise the catch-all.
    const original = ctx.server.store.applyDraft;
    ctx.server.store.applyDraft = () => {
      throw new Error("/Users/secret/path exploded with token abc123");
    };

    try {
      const result = await emitAck(p1, CLIENT_EVENTS.draft, {
        roundId,
        category: "country",
        value: "Srbija",
        revision: 1,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toEqual({ code: "INTERNAL", message: ERROR_MESSAGES.INTERNAL });
        expect(JSON.stringify(result.error)).not.toContain("secret");
        expect(JSON.stringify(result.error)).not.toContain("abc123");
      }
      observed.add("INTERNAL");
    } finally {
      ctx.server.store.applyDraft = original;
    }
  });

  it("delivers a rejection as game:error when the client sends no acknowledgement", async () => {
    const error = waitFor<{ code: string; message: string }>(p1, SERVER_EVENTS.gameError);
    p1.emit(CLIENT_EVENTS.draft, { roundId, category: "nonsense", value: "x", revision: 1 });

    expect(await error).toEqual({
      code: "INVALID_PAYLOAD",
      message: ERROR_MESSAGES.INVALID_PAYLOAD,
    });
  });

  it("covers every code in the closed registry", () => {
    // Guards against a code existing in the registry with no proof it can occur.
    expect([...observed].sort()).toEqual([...GAME_ERROR_CODES].sort());
  });
});
