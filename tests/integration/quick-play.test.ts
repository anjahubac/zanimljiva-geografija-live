import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Socket } from "socket.io-client";
import { CLIENT_EVENTS, SERVER_EVENTS, quickPlayAckSchema } from "@contracts/socket.schemas";
import type { QuickPlayAck, RoomState } from "@contracts/socket.schemas";
import { connectClient, emitAck, settle } from "../helpers/socket-client";
import { startTestServer, type TestContext } from "../helpers/test-server";

describe("playing a stranger from the queue", () => {
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

  const queue = (socket: Socket, displayName: string) =>
    emitAck<QuickPlayAck>(socket, CLIENT_EVENTS.quickPlay, { displayName });

  it("holds the first player and matches the second into one room", async () => {
    const p1 = await open();
    const p2 = await open();

    const first = await queue(p1, "Ana");
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("not queued");
    expect(quickPlayAckSchema.parse(first.data)).toEqual({ status: "queued" });

    // The waiting player is told by broadcast, not by an acknowledgement: the
    // room is created and then joined, so two states arrive and the last one
    // is the matched pair.
    const states: RoomState[] = [];
    p1.on(SERVER_EVENTS.roomState, (payload: RoomState) => states.push(payload));

    const second = await queue(p2, "Marko");
    expect(second.ok).toBe(true);
    if (!second.ok || second.data.status !== "matched") throw new Error("not matched");

    expect(second.data.you).toBe(2);
    await settle();

    // Both ended up in the same room, by the same path a room code takes.
    const seen = states.at(-1)!;
    expect(states).toHaveLength(2);
    expect(seen.roomCode).toBe(second.data.roomCode);
    expect(seen.you).toBe(1);
    expect(seen.phase).toBe("synchronizing");
    expect(seen.players.map((player) => player.displayName).sort()).toEqual(["Ana", "Marko"]);
  });

  it("answers a repeated request with the same queued state, not a second entry", async () => {
    const p1 = await open();
    const p2 = await open();

    await queue(p1, "Ana");
    const again = await queue(p1, "Ana");
    expect(again.ok).toBe(true);
    if (!again.ok) throw new Error("rejected");
    expect(again.data.status).toBe("queued");

    // If the repeat had added a second entry, Marko would match Ana's ghost.
    const matched = await queue(p2, "Marko");
    if (!matched.ok || matched.data.status !== "matched") throw new Error("not matched");

    const third = await open();
    const afterwards = await queue(third, "Jelena");
    if (!afterwards.ok) throw new Error("rejected");
    expect(afterwards.data.status).toBe("queued");
  });

  it("gives up the place in the queue on cancel", async () => {
    const p1 = await open();
    const p2 = await open();

    await queue(p1, "Ana");
    const cancelled = await emitAck(p2, CLIENT_EVENTS.cancelQuickPlay, {});
    expect(cancelled.ok).toBe(true);

    await emitAck(p1, CLIENT_EVENTS.cancelQuickPlay, {});
    const alone = await queue(p2, "Marko");
    if (!alone.ok) throw new Error("rejected");
    // Ana left, so Marko waits rather than matching someone who is gone.
    expect(alone.data.status).toBe("queued");
  });

  it("does not match a player who dropped while waiting", async () => {
    const p1 = await open();
    await queue(p1, "Ana");

    p1.disconnect();
    await settle();

    const p2 = await open();
    const result = await queue(p2, "Marko");
    if (!result.ok) throw new Error("rejected");
    expect(result.data.status).toBe("queued");
  });

  it("refuses to queue a player who is already in a room", async () => {
    const p1 = await open();
    const created = await emitAck<{ roomCode: string }>(p1, CLIENT_EVENTS.createRoom, {
      displayName: "Ana",
    });
    expect(created.ok).toBe(true);

    const queued = await queue(p1, "Ana");
    expect(queued.ok).toBe(false);
    if (queued.ok) throw new Error("should have been refused");
    expect(queued.error.code).toBe("WRONG_PHASE");
  });

  it("rejects a malformed queue request without changing the queue", async () => {
    const p1 = await open();
    const bad = await emitAck(p1, CLIENT_EVENTS.quickPlay, { displayName: "Ana", admin: true });
    expect(bad.ok).toBe(false);
    if (bad.ok) throw new Error("should have been refused");
    expect(bad.error.code).toBe("INVALID_PAYLOAD");

    // The rejected call left nothing behind: the next real player still waits.
    const p2 = await open();
    const queued = await queue(p2, "Marko");
    if (!queued.ok) throw new Error("rejected");
    expect(queued.data.status).toBe("queued");
  });
});
