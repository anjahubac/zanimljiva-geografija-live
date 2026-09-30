import { afterEach, describe, expect, it } from "vitest";
import { io, type Socket } from "socket.io-client";
import { CLIENT_EVENTS, SERVER_EVENTS, type HintAck, type RoundResults, type RoundScheduled } from "@contracts/socket.schemas";
import { VISITOR_WINDOW_MS } from "@server/usage-limits";
import { connectClient, emitAck, settle, waitFor } from "../helpers/socket-client";
import { startTestServer, type TestContext } from "../helpers/test-server";
import { fakeAi, type FakeAi } from "../fakes/fake-ai";

/**
 * Plan §2B.11 over real sockets. Every test client connects from 127.0.0.1,
 * so they are one visitor — which is exactly what a script looks like.
 */

let ctx: TestContext | null = null;
const sockets: Socket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await ctx?.close();
  ctx = null;
});

async function client(): Promise<Socket> {
  const socket = await connectClient(ctx!.port);
  sockets.push(socket);
  return socket;
}

/** A client whose connection carries an x-forwarded-for header, as a proxy would add. */
async function forwardedClient(forwardedFor: string): Promise<Socket> {
  const socket = io(`http://localhost:${ctx!.port}`, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    extraHeaders: { "x-forwarded-for": forwardedFor },
  });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
  return socket;
}

async function twoPlayerRound(ai: FakeAi, config: Record<string, unknown>) {
  ctx = await startTestServer({ letter: "S", ai, config });
  const p1 = await client();
  const p2 = await client();
  const created = await emitAck<{ roomCode: string }>(p1, CLIENT_EVENTS.createRoom, { displayName: "Ana" });
  if (!created.ok) throw new Error("not created");
  const { roomCode } = created.data;
  await emitAck(p2, CLIENT_EVENTS.joinRoom, { roomCode, displayName: "Marko" });
  const scheduled = waitFor<RoundScheduled>(p1, SERVER_EVENTS.roundScheduled);
  await emitAck(p1, CLIENT_EVENTS.clientReady, { roomCode });
  await emitAck(p2, CLIENT_EVENTS.clientReady, { roomCode });
  const { roundId } = await scheduled;
  ctx.advance(ctx.config.countdownMs);
  return { p1, p2, roundId };
}

const hint = (socket: Socket, roundId: string, category: string) =>
  emitAck<HintAck>(socket, CLIENT_EVENTS.hint, { roundId, category, language: "sr" });

describe("per-visitor AI room limit", () => {
  it("survives reconnecting: a play-AI-then-disconnect loop stops at the limit until the hour passes", async () => {
    const ai = fakeAi();
    ctx = await startTestServer({ ai, config: { aiRoomsPerVisitorHour: 2 } });

    for (let i = 0; i < 2; i += 1) {
      const socket = await client();
      expect(await emitAck(socket, CLIENT_EVENTS.playAi, { displayName: "Bot" })).toMatchObject({ ok: true });
      socket.disconnect();
      await settle();
    }

    const third = await client();
    expect(await emitAck(third, CLIENT_EVENTS.playAi, { displayName: "Bot" })).toMatchObject({
      ok: false,
      error: { code: "RATE_LIMITED" },
    });
    // A refused room made no room and cost no AI call.
    expect(ctx.server.store.getRoomBySocket(third.id!)).toBeUndefined();

    ctx.advance(VISITOR_WINDOW_MS);
    expect(await emitAck(third, CLIENT_EVENTS.playAi, { displayName: "Bot" })).toMatchObject({ ok: true });
  });

  it("does not trust a browser's x-forwarded-for when no proxy is configured", async () => {
    // Otherwise forging the header would buy a fresh limit per connection.
    ctx = await startTestServer({ ai: fakeAi(), config: { aiRoomsPerVisitorHour: 1 } });
    const first = await forwardedClient("5.5.5.5");
    expect(await emitAck(first, CLIENT_EVENTS.playAi, { displayName: "Bot" })).toMatchObject({ ok: true });
    const forged = await forwardedClient("6.6.6.6");
    expect(await emitAck(forged, CLIENT_EVENTS.playAi, { displayName: "Bot" })).toMatchObject({
      ok: false,
      error: { code: "RATE_LIMITED" },
    });
  });

  it("behind one trusted proxy, counts each forwarded client separately", async () => {
    ctx = await startTestServer({ ai: fakeAi(), config: { aiRoomsPerVisitorHour: 1, trustProxyHops: 1 } });
    const a = await forwardedClient("5.5.5.5");
    expect(await emitAck(a, CLIENT_EVENTS.playAi, { displayName: "Bot" })).toMatchObject({ ok: true });
    const b = await forwardedClient("6.6.6.6");
    expect(await emitAck(b, CLIENT_EVENTS.playAi, { displayName: "Bot" })).toMatchObject({ ok: true });
    // A spoofed entry before the proxy's own does not make the same client new.
    const again = await forwardedClient("7.7.7.7, 5.5.5.5");
    expect(await emitAck(again, CLIENT_EVENTS.playAi, { displayName: "Bot" })).toMatchObject({
      ok: false,
      error: { code: "RATE_LIMITED" },
    });
  });
});

describe("per-visitor hint limit", () => {
  it("charges only hints that reach the AI, and counts every socket of the visitor", async () => {
    const ai = fakeAi();
    const { p1, p2, roundId } = await twoPlayerRound(ai, { hintsPerVisitorHour: 2 });

    expect(await hint(p1, roundId, "river")).toMatchObject({ ok: true });
    // Refused by the round's own rule before the AI: not charged.
    expect(await hint(p1, roundId, "river")).toMatchObject({ ok: false, error: { code: "HINT_LIMIT" } });
    expect(await hint(p1, roundId, "sea")).toMatchObject({ ok: true });
    // Same address, other socket: the visitor's hour is spent.
    expect(await hint(p2, roundId, "city")).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
    expect(ai.hintCalls).toHaveLength(2);
  });
});

describe("global daily AI budget", () => {
  it("stops hints and new AI rooms once spent, but still checks the round already played", async () => {
    const ai = fakeAi();
    const { p1, p2, roundId } = await twoPlayerRound(ai, { aiDailyCallBudget: 1 });

    expect(await hint(p1, roundId, "river")).toMatchObject({ ok: true });
    expect(await hint(p2, roundId, "sea")).toMatchObject({ ok: false, error: { code: "AI_LIMIT" } });

    const results = waitFor<RoundResults>(p1, SERVER_EVENTS.roundResults);
    await emitAck(p1, CLIENT_EVENTS.finish, { roundId });
    await emitAck(p2, CLIENT_EVENTS.finish, { roundId });
    // The checker is never refused: it is what makes scoring fair.
    expect((await results).verified).toBe(true);
    expect(ai.checkCalls).toHaveLength(1);

    const newcomer = await client();
    expect(await emitAck(newcomer, CLIENT_EVENTS.playAi, { displayName: "Ana" })).toMatchObject({
      ok: false,
      error: { code: "AI_LIMIT" },
    });
    expect(ai.hintCalls).toHaveLength(1);
  });
});
