import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Socket } from "socket.io-client";
import { CATEGORIES } from "@contracts/game.schemas";
import { CLIENT_EVENTS, SERVER_EVENTS, type RoundScheduled } from "@contracts/socket.schemas";
import { connectClient, emitAck, expectNoEvent, waitFor } from "../helpers/socket-client";
import { startTestServer, type TestContext } from "../helpers/test-server";

/**
 * E1 from docs/EVALS.md: the fairness guarantee of `Plan.md` §5. The assertion
 * is not "a round started" but that the first ready client triggers nothing and
 * that both scheduled payloads are deeply equal.
 */
describe("E1 synchronized start", () => {
  let ctx: TestContext;
  const sockets: Socket[] = [];

  beforeEach(async () => {
    ctx = await startTestServer({ letter: "S" });
  });

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.disconnect();
    await ctx.close();
  });

  async function open(): Promise<Socket> {
    const socket = await connectClient(ctx.port);
    sockets.push(socket);
    return socket;
  }

  it("sends both players one identical scheduled round, only after both are ready", async () => {
    const p1 = await open();
    const p2 = await open();

    const created = await emitAck<{ roomCode: string; you: 1 | 2 }>(p1, CLIENT_EVENTS.createRoom, {
      displayName: "Ana",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("room was not created");
    const roomCode = created.data.roomCode;
    expect(created.data.you).toBe(1);

    const joined = await emitAck<{ you: 1 | 2 }>(p2, CLIENT_EVENTS.joinRoom, {
      roomCode,
      displayName: "Marko",
    });
    expect(joined.ok).toBe(true);
    if (joined.ok) expect(joined.data.you).toBe(2);

    // Nothing may be scheduled before both clients acknowledge.
    const readyP1 = await emitAck(p1, CLIENT_EVENTS.clientReady, { roomCode });
    expect(readyP1.ok).toBe(true);
    await expectNoEvent(p1, SERVER_EVENTS.roundScheduled);
    await expectNoEvent(p2, SERVER_EVENTS.roundScheduled);

    const scheduled1 = waitFor<RoundScheduled>(p1, SERVER_EVENTS.roundScheduled);
    const scheduled2 = waitFor<RoundScheduled>(p2, SERVER_EVENTS.roundScheduled);
    const readyP2 = await emitAck(p2, CLIENT_EVENTS.clientReady, { roomCode });
    expect(readyP2.ok).toBe(true);

    const [a, b] = await Promise.all([scheduled1, scheduled2]);
    expect(a).toEqual(b);
    expect(a.letter).toBe("S");
    expect(a.categories).toEqual([...CATEGORIES]);
    expect(a.startsAt).toBeGreaterThan(a.serverNow);
    expect(a.startsAt - a.serverNow).toBe(ctx.config.countdownMs);
    expect(a.endsAt - a.startsAt).toBe(ctx.config.roundDurationMs);
  });

  it("never reveals a letter to player 1 while player 1 is alone", async () => {
    const p1 = await open();

    const created = await emitAck<{ roomCode: string }>(p1, CLIENT_EVENTS.createRoom, {
      displayName: "Ana",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("room was not created");

    // A ready acknowledgement from a lone player is rejected, not queued.
    const ready = await emitAck(p1, CLIENT_EVENTS.clientReady, { roomCode: created.data.roomCode });
    expect(ready.ok).toBe(false);
    if (!ready.ok) expect(ready.error.code).toBe("WRONG_PHASE");

    await expectNoEvent(p1, SERVER_EVENTS.roundScheduled);
  });

  it("unlocks the answering phase only when the server reaches startsAt", async () => {
    const p1 = await open();
    const p2 = await open();

    const created = await emitAck<{ roomCode: string }>(p1, CLIENT_EVENTS.createRoom, {
      displayName: "Ana",
    });
    if (!created.ok) throw new Error("room was not created");
    const roomCode = created.data.roomCode;
    await emitAck(p2, CLIENT_EVENTS.joinRoom, { roomCode, displayName: "Marko" });
    await emitAck(p1, CLIENT_EVENTS.clientReady, { roomCode });

    const scheduled = waitFor<RoundScheduled>(p1, SERVER_EVENTS.roundScheduled);
    await emitAck(p2, CLIENT_EVENTS.clientReady, { roomCode });
    const round = await scheduled;

    // One millisecond before startsAt the server still refuses input.
    ctx.advance(ctx.config.countdownMs - 1);
    const early = await emitAck(p1, CLIENT_EVENTS.draft, {
      roundId: round.roundId,
      category: "city",
      value: "Subotica",
      revision: 1,
    });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error.code).toBe("TOO_EARLY");

    ctx.advance(1);
    const accepted = await emitAck(p1, CLIENT_EVENTS.draft, {
      roundId: round.roundId,
      category: "city",
      value: "Subotica",
      revision: 1,
    });
    expect(accepted.ok).toBe(true);
  });
});
