import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Socket } from "socket.io-client";
import { CLIENT_EVENTS, SERVER_EVENTS, type RoundScheduled } from "@contracts/socket.schemas";
import { connectClient, emitAck, settle, waitFor } from "../helpers/socket-client";
import { startTestServer, type TestContext } from "../helpers/test-server";

describe("drafts, revisions and pre-reveal privacy", () => {
  let ctx: TestContext;
  let p1: Socket;
  let p2: Socket;
  let roomCode: string;
  let roundId: string;

  /** Everything player 2's socket has ever received, for absence assertions. */
  let seenByP2: unknown[];

  beforeEach(async () => {
    ctx = await startTestServer({ letter: "S" });
    p1 = await connectClient(ctx.port);
    p2 = await connectClient(ctx.port);

    seenByP2 = [];
    p2.onAny((_event, ...args) => seenByP2.push(...args));

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

    ctx.advance(ctx.config.countdownMs);
  });

  afterEach(async () => {
    p1.disconnect();
    p2.disconnect();
    await ctx.close();
  });

  const draft = (socket: Socket, category: string, value: string, revision: number) =>
    emitAck<{ category: string; acceptedRevision: number }>(socket, CLIENT_EVENTS.draft, {
      roundId,
      category,
      value,
      revision,
    });

  it("acknowledges each accepted draft with its category and revision", async () => {
    const first = await draft(p1, "city", "Subotica", 1);
    expect(first).toEqual({ ok: true, data: { category: "city", acceptedRevision: 1 } });

    const second = await draft(p1, "city", "Smederevo", 2);
    expect(second).toEqual({ ok: true, data: { category: "city", acceptedRevision: 2 } });
  });

  it("keeps the newest accepted revision when an older one arrives late", async () => {
    await draft(p1, "river", "Studenica", 5);

    const late = await draft(p1, "river", "Sava", 4);
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error.code).toBe("STALE_REVISION");

    // The value that survives is the one the server accepted, not the last to
    // arrive. Subscribe before closing the round: the reveal is emitted inside
    // the second finish, so a listener attached afterwards misses it.
    const revealed = waitFor<{ player1: { category: string; raw: string }[] }>(
      p1,
      SERVER_EVENTS.roundRevealed,
    );
    await emitAck(p1, CLIENT_EVENTS.finish, { roundId });
    await emitAck(p2, CLIENT_EVENTS.finish, { roundId });

    const payload = await revealed;
    expect(payload.player1.find((answer) => answer.category === "river")?.raw).toBe("Studenica");
  });

  it("rejects a repeated revision for the same category", async () => {
    await draft(p1, "plant", "Suncokret", 3);
    const repeat = await draft(p1, "plant", "Salata", 3);
    expect(repeat.ok).toBe(false);
    if (!repeat.ok) expect(repeat.error.code).toBe("STALE_REVISION");
  });

  it("tracks revisions per category, not per player", async () => {
    await draft(p1, "city", "Subotica", 7);
    // A lower revision in a different category is still the newest for that field.
    expect((await draft(p1, "animal", "Sova", 1)).ok).toBe(true);
  });

  it("never lets an opponent draft reach the other player before reveal", async () => {
    await draft(p1, "city", "Subotica", 1);
    await draft(p1, "mountain", "Suvobor", 1);
    await emitAck(p1, CLIENT_EVENTS.finish, { roundId });
    await settle();

    const serialized = JSON.stringify(seenByP2);
    expect(serialized).not.toContain("Subotica");
    expect(serialized).not.toContain("subotica");
    expect(serialized).not.toContain("Suvobor");
    // Player 2 does learn that player 1 finished — status is public, answers are not.
    expect(serialized).toContain("slot");
  });

  it("never sends a resume token to the opponent", async () => {
    const created = await emitAck<{ resumeToken: string }>(p1, CLIENT_EVENTS.createRoom, {
      displayName: "Ana",
    });
    if (!created.ok) throw new Error("room was not created");

    await settle();
    expect(JSON.stringify(seenByP2)).not.toContain(created.data.resumeToken);
  });

  it("releases both answer sets only after the canonical close", async () => {
    await draft(p1, "city", "Subotica", 1);
    await draft(p2, "city", "Smederevo", 1);
    await settle();
    expect(JSON.stringify(seenByP2)).not.toContain("Subotica");

    const revealed = waitFor<{ player1: { raw: string }[]; player2: { raw: string }[] }>(
      p2,
      SERVER_EVENTS.roundRevealed,
    );
    await emitAck(p1, CLIENT_EVENTS.finish, { roundId });
    await emitAck(p2, CLIENT_EVENTS.finish, { roundId });

    const payload = await revealed;
    expect(payload.player1.map((answer) => answer.raw)).toContain("Subotica");
    expect(payload.player2.map((answer) => answer.raw)).toContain("Smederevo");
  });
});
