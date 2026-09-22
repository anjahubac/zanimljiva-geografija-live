import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Socket } from "socket.io-client";
import { CATEGORIES } from "@contracts/game.schemas";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type RoundResults,
  type RoundRevealed,
  type RoundScheduled,
  roundResultsSchema,
  roundRevealedSchema,
} from "@contracts/socket.schemas";
import { connectClient, emitAck, settle, waitFor } from "../helpers/socket-client";
import { startTestServer, type TestContext } from "../helpers/test-server";

/**
 * E2 from docs/EVALS.md: exactly one reveal and one result per player, for
 * every way a round can end.
 */
describe("E2 the round closes and scores exactly once", () => {
  let ctx: TestContext;
  let p1: Socket;
  let p2: Socket;
  let roundId: string;

  const revealed: { socket: "p1" | "p2"; payload: RoundRevealed }[] = [];
  const results: { socket: "p1" | "p2"; payload: RoundResults }[] = [];

  beforeEach(async () => {
    revealed.length = 0;
    results.length = 0;

    ctx = await startTestServer({ letter: "S" });
    p1 = await connectClient(ctx.port);
    p2 = await connectClient(ctx.port);

    for (const [name, socket] of [
      ["p1", p1],
      ["p2", p2],
    ] as const) {
      socket.on(SERVER_EVENTS.roundRevealed, (payload: RoundRevealed) =>
        revealed.push({ socket: name, payload }),
      );
      socket.on(SERVER_EVENTS.roundResults, (payload: RoundResults) =>
        results.push({ socket: name, payload }),
      );
    }

    const created = await emitAck<{ roomCode: string }>(p1, CLIENT_EVENTS.createRoom, {
      displayName: "Ana",
    });
    if (!created.ok) throw new Error("room was not created");
    const roomCode = created.data.roomCode;

    await emitAck(p2, CLIENT_EVENTS.joinRoom, { roomCode, displayName: "Marko" });
    await emitAck(p1, CLIENT_EVENTS.clientReady, { roomCode });
    const scheduled = waitFor<RoundScheduled>(p1, SERVER_EVENTS.roundScheduled);
    await emitAck(p2, CLIENT_EVENTS.clientReady, { roomCode });
    roundId = (await scheduled).roundId;

    ctx.advance(ctx.config.countdownMs);
  });

  afterEach(async () => {
    p1.disconnect();
    p2.disconnect();
    await ctx.close();
  });

  const draft = (socket: Socket, category: string, value: string, revision = 1) =>
    emitAck(socket, CLIENT_EVENTS.draft, { roundId, category, value, revision });

  /** One reveal and one result per player, same roundId, identical totals. */
  function expectClosedExactlyOnce(reason: "both_finished" | "deadline") {
    expect(revealed).toHaveLength(2);
    expect(results).toHaveLength(2);
    expect(new Set(revealed.map((entry) => entry.socket)).size).toBe(2);
    expect(new Set(results.map((entry) => entry.socket)).size).toBe(2);

    for (const entry of revealed) {
      expect(roundRevealedSchema.safeParse(entry.payload).success).toBe(true);
      expect(entry.payload.roundId).toBe(roundId);
      expect(entry.payload.closedReason).toBe(reason);
      expect(entry.payload.player1).toHaveLength(CATEGORIES.length);
      expect(entry.payload.player2).toHaveLength(CATEGORIES.length);
    }
    for (const entry of results) {
      expect(roundResultsSchema.safeParse(entry.payload).success).toBe(true);
      expect(entry.payload.roundId).toBe(roundId);
    }
    // Both players are told the same story.
    expect(revealed[0]?.payload).toEqual(revealed[1]?.payload);
    expect(results[0]?.payload).toEqual(results[1]?.payload);
  }

  it("closes once when both players finish early", async () => {
    await draft(p1, "country", "Srbija");
    await draft(p2, "country", "Slovenija");

    await emitAck(p1, CLIENT_EVENTS.finish, { roundId });
    await emitAck(p2, CLIENT_EVENTS.finish, { roundId });
    await settle();

    expectClosedExactlyOnce("both_finished");
    expect(results[0]?.payload.player1Total).toBe(10);
    expect(results[0]?.payload.player2Total).toBe(10);
    expect(results[0]?.payload.outcome).toBe("draw");
  });

  it("closes once on the deadline when neither player finishes", async () => {
    await draft(p1, "country", "Srbija");
    await draft(p2, "country", "Beograd");

    ctx.advance(ctx.config.roundDurationMs);
    await settle();

    expectClosedExactlyOnce("deadline");
    expect(results[0]?.payload.player1Total).toBe(10);
    expect(results[0]?.payload.player2Total).toBe(0);
    expect(results[0]?.payload.outcome).toBe("player_1");
  });

  it("closes once when a finish one millisecond before the deadline races the timer", async () => {
    await draft(p1, "country", "Srbija");
    await draft(p2, "country", "Srbija");

    ctx.advance(ctx.config.roundDurationMs - 1);
    await emitAck(p1, CLIENT_EVENTS.finish, { roundId });
    ctx.advance(10); // the deadline now fires
    await settle();

    expectClosedExactlyOnce("deadline");
    // The same normalized answer scores 5/5, and player 1's lock is honoured.
    expect(results[0]?.payload.player1Total).toBe(5);
    expect(results[0]?.payload.player2Total).toBe(5);
    expect(results[0]?.payload.outcome).toBe("draw");
  });

  it("acknowledges a duplicate finish without a second reveal or a changed score", async () => {
    await draft(p1, "country", "Srbija");
    await draft(p2, "country", "Slovenija");

    await emitAck(p1, CLIENT_EVENTS.finish, { roundId });
    const duplicate = await emitAck(p1, CLIENT_EVENTS.finish, { roundId });
    expect(duplicate).toEqual({ ok: true, data: { finished: true } });

    await emitAck(p2, CLIENT_EVENTS.finish, { roundId });
    const afterClose = await emitAck(p2, CLIENT_EVENTS.finish, { roundId });
    expect(afterClose).toEqual({ ok: true, data: { finished: true } });
    await settle();

    expectClosedExactlyOnce("both_finished");
    expect(results[0]?.payload.player1Total).toBe(10);
    expect(results[0]?.payload.player2Total).toBe(10);
  });

  it("scores every reason in one round from the locked answers", async () => {
    await draft(p1, "country", "Srbija"); // both valid, different -> 10/10
    await draft(p2, "country", "Slovenija");
    await draft(p1, "city", "Subotica"); // same normalized -> 5/5
    await draft(p2, "city", " subotica ");
    await draft(p1, "river", "Sava"); // only player 1 -> 10/0
    await draft(p2, "mountain", "Suvobor"); // only player 2 -> 0/10
    await draft(p1, "plant", "Breza"); // wrong letter both -> 0/0
    await draft(p2, "plant", "Ruza");

    await emitAck(p1, CLIENT_EVENTS.finish, { roundId });
    await emitAck(p2, CLIENT_EVENTS.finish, { roundId });
    await settle();

    expectClosedExactlyOnce("both_finished");
    const byCategory = Object.fromEntries(
      (results[0]?.payload.scores ?? []).map((score) => [score.category, score]),
    );
    expect(byCategory.country?.reason).toBe("both_different");
    expect(byCategory.city?.reason).toBe("same_answer");
    expect(byCategory.river?.reason).toBe("only_player_1");
    expect(byCategory.mountain?.reason).toBe("only_player_2");
    expect(byCategory.plant?.reason).toBe("neither");
    expect(byCategory.animal?.reason).toBe("neither"); // nobody answered
    expect(results[0]?.payload.player1Total).toBe(25);
    expect(results[0]?.payload.player2Total).toBe(25);
  });

  it("rejects a draft and a finish after the round has closed", async () => {
    ctx.advance(ctx.config.roundDurationMs);
    await settle();

    const lateDraft = await draft(p1, "country", "Srbija", 2);
    expect(lateDraft.ok).toBe(false);
    if (!lateDraft.ok) expect(lateDraft.error.code).toBe("ROUND_STALE");

    const lateFinish = await emitAck(p1, CLIENT_EVENTS.finish, { roundId });
    expect(lateFinish.ok).toBe(false);
    if (!lateFinish.ok) expect(lateFinish.error.code).toBe("ROUND_STALE");

    expectClosedExactlyOnce("deadline");
  });

  it("still reveals to the player who stayed when the opponent disconnects", async () => {
    await draft(p1, "country", "Srbija");
    p2.disconnect();
    await settle();

    ctx.advance(ctx.config.roundDurationMs);
    await settle();

    expect(revealed.filter((entry) => entry.socket === "p1")).toHaveLength(1);
    expect(results.filter((entry) => entry.socket === "p1")).toHaveLength(1);
    expect(results.find((entry) => entry.socket === "p1")?.payload.player1Total).toBe(10);
  });
});
