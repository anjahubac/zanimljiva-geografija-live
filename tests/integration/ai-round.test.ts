import { afterEach, describe, expect, it } from "vitest";
import type { Socket } from "socket.io-client";
import { CATEGORIES, HINTS_PER_ROUND } from "@contracts/game.schemas";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type HintAck,
  type RoundResults,
  type RoundRevealed,
  type RoundScheduled,
} from "@contracts/socket.schemas";
import { JUDGE_TIMEOUT_MS } from "@server/rooms/room-store";
import { answerKey } from "@server/features/check-round";
import { connectClient, emitAck, expectNoEvent, settle, waitFor } from "../helpers/socket-client";
import { startTestServer, type TestContext } from "../helpers/test-server";
import { DEFAULT_CLUE, deferred, fakeAi, type FakeAi } from "../fakes/fake-ai";

/**
 * Pre-registered evals A1-A6 (`Plan.md` §2B.6), over real sockets with a fake
 * AI service. Every test states the invariant it protects.
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

/** Two humans in one room, round scheduled. */
async function twoPlayerRound(ai: FakeAi) {
  ctx = await startTestServer({ letter: "S", ai });
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
  return { p1, p2, roomCode, roundId };
}

const draft = (socket: Socket, roundId: string, category: string, value: string) =>
  emitAck(socket, CLIENT_EVENTS.draft, { roundId, category, value, revision: 1 });

describe("A1 — the AI checker decides what counts", () => {
  it("rejects an invented answer with a reason, scores the rest traditionally, in one call", async () => {
    const ai = fakeAi();
    ai.onCheck = async () =>
      new Map([
        [answerKey(1, "country"), { valid: true, canonical: "srbija" }],
        [answerKey(2, "country"), { valid: false, reason: "not_real" }],
        [answerKey(1, "river"), { valid: true, canonical: "sava" }],
        [answerKey(2, "river"), { valid: true, canonical: "sava" }],
      ]);
    const { p1, p2, roundId } = await twoPlayerRound(ai);

    await draft(p1, roundId, "country", "Srbija");
    await draft(p2, roundId, "country", "Srbistan");
    await draft(p1, roundId, "river", "Sava");
    // English for the same river: the canonical names match, so it is the same answer.
    await draft(p2, roundId, "river", "Sava river");
    await draft(p2, roundId, "city", "Beograd");

    const revealed = waitFor<RoundRevealed>(p1, SERVER_EVENTS.roundRevealed);
    const results = waitFor<RoundResults>(p1, SERVER_EVENTS.roundResults);
    await emitAck(p1, CLIENT_EVENTS.finish, { roundId });
    await emitAck(p2, CLIENT_EVENTS.finish, { roundId });

    const reveal = await revealed;
    const scored = await results;

    expect(ai.checkCalls).toHaveLength(1);
    expect(scored.verified).toBe(true);
    const p2Country = reveal.player2.find((answer) => answer.category === "country")!;
    expect(p2Country).toMatchObject({ raw: "Srbistan", valid: false, reason: "not_real" });
    // Failed the local letter rule, so it was never sent, and says why.
    expect(reveal.player2.find((answer) => answer.category === "city")).toMatchObject({
      valid: false,
      reason: "wrong_letter",
    });
    expect(scored.scores.find((score) => score.category === "country")).toMatchObject({
      player1Points: 10,
      player2Points: 0,
    });
    expect(scored.scores.find((score) => score.category === "river")).toMatchObject({ reason: "same_answer" });
  });
});

describe("A2 — finish racing the deadline while the checker is pending", () => {
  it("makes one AI call, one reveal and one result", async () => {
    const ai = fakeAi();
    const pending = deferred<null>();
    ai.onCheck = () => pending.promise;
    const { p1, p2, roundId } = await twoPlayerRound(ai);

    let reveals = 0;
    let results = 0;
    p1.on(SERVER_EVENTS.roundRevealed, () => (reveals += 1));
    p1.on(SERVER_EVENTS.roundResults, () => (results += 1));

    await emitAck(p1, CLIENT_EVENTS.finish, { roundId });
    const finishing = emitAck(p2, CLIENT_EVENTS.finish, { roundId });
    ctx!.advance(ctx!.config.roundDurationMs);
    await finishing;
    await settle();
    expect(ctx!.server.store.getRoomBySocket(p1.id!)?.phase).toBe("judging");

    pending.resolve(null);
    await waitFor(p1, SERVER_EVENTS.roundResults).catch(() => undefined);
    await settle(10);

    expect(ai.checkCalls).toHaveLength(1);
    expect(reveals).toBe(1);
    expect(results).toBe(1);
  });
});

describe("A3 — AI failure never leaves a round stuck", () => {
  it("scores with the local rule, marked unverified, when the checker fails", async () => {
    const ai = fakeAi();
    ai.onCheck = async () => null;
    const { p1, p2, roundId } = await twoPlayerRound(ai);
    await draft(p1, roundId, "country", "Srbistan");

    const results = waitFor<RoundResults>(p1, SERVER_EVENTS.roundResults);
    await emitAck(p1, CLIENT_EVENTS.finish, { roundId });
    await emitAck(p2, CLIENT_EVENTS.finish, { roundId });

    const scored = await results;
    expect(scored.verified).toBe(false);
    expect(scored.player1Total).toBe(10);
  });

  it("falls back after JUDGE_TIMEOUT_MS when the checker never answers", async () => {
    const ai = fakeAi();
    ai.onCheck = () => new Promise(() => {});
    const { p1, p2, roundId } = await twoPlayerRound(ai);

    await emitAck(p1, CLIENT_EVENTS.finish, { roundId });
    await emitAck(p2, CLIENT_EVENTS.finish, { roundId });
    await expectNoEvent(p1, SERVER_EVENTS.roundResults, 100);

    const results = waitFor<RoundResults>(p1, SERVER_EVENTS.roundResults);
    ctx!.advance(JUDGE_TIMEOUT_MS);
    expect((await results).verified).toBe(false);
  });
});

describe("A4 — a hint is private and charged only when shown", () => {
  it("gives the caller a clue, tells the opponent nothing, and marks the cell at reveal", async () => {
    const ai = fakeAi();
    const { p1, p2, roundId } = await twoPlayerRound(ai);

    const leaked: unknown[] = [];
    p2.onAny((_event, payload) => leaked.push(payload));

    const first = await emitAck<HintAck>(p1, CLIENT_EVENTS.hint, { roundId, category: "river", language: "en" });
    expect(first).toEqual({
      ok: true,
      data: { kind: "clue", category: "river", clue: DEFAULT_CLUE, hintsLeft: HINTS_PER_ROUND - 1 },
    });
    expect(ai.hintCalls[0]).toEqual({ letter: "S", category: "river", language: "en" });
    expect(JSON.stringify(leaked)).not.toContain(DEFAULT_CLUE);

    // "No known term" is an answer, not a spent credit.
    ai.onHint = async () => ({ ok: true, outcome: { kind: "no_known_term" } });
    const none = await emitAck<HintAck>(p1, CLIENT_EVENTS.hint, { roundId, category: "sea", language: "sr" });
    expect(none).toEqual({ ok: true, data: { kind: "no_known_term", category: "sea", hintsLeft: 1 } });

    const revealed = waitFor<RoundRevealed>(p2, SERVER_EVENTS.roundRevealed);
    await emitAck(p1, CLIENT_EVENTS.finish, { roundId });
    await emitAck(p2, CLIENT_EVENTS.finish, { roundId });
    const reveal = await revealed;
    expect(reveal.player1.filter((answer) => answer.hinted).map((answer) => answer.category)).toEqual(["river"]);
    expect(reveal.player2.every((answer) => !answer.hinted)).toBe(true);
  });

  it("charges nothing when the round closes while the hint is being written", async () => {
    const ai = fakeAi();
    const pending = deferred<{ ok: true; outcome: { kind: "clue"; clue: string } }>();
    ai.onHint = () => pending.promise;
    const { p1, p2, roundId } = await twoPlayerRound(ai);

    const hint = emitAck<HintAck>(p1, CLIENT_EVENTS.hint, { roundId, category: "river", language: "sr" });
    await settle();
    await emitAck(p1, CLIENT_EVENTS.finish, { roundId });
    await emitAck(p2, CLIENT_EVENTS.finish, { roundId });
    pending.resolve({ ok: true, outcome: { kind: "clue", clue: DEFAULT_CLUE } });

    expect(await hint).toMatchObject({ ok: false, error: { code: "ROUND_STALE" } });
  });
});

/** A human against the bot, round scheduled and started. */
async function aiRound(ai: FakeAi, random = () => 0) {
  ctx = await startTestServer({ letter: "S", ai, random });
  const human = await client();
  const created = await emitAck<{ roomCode: string; you: number }>(human, CLIENT_EVENTS.playAi, {
    displayName: "Ana",
  });
  if (!created.ok) throw new Error("AI room not created");
  const scheduled = waitFor<RoundScheduled>(human, SERVER_EVENTS.roundScheduled);
  await emitAck(human, CLIENT_EVENTS.clientReady, { roomCode: created.data.roomCode });
  const { roundId, endsAt, startsAt } = await scheduled;
  ctx.advance(ctx.config.countdownMs);
  return { human, roomCode: created.data.roomCode, you: created.data.you, roundId, startsAt, endsAt };
}

describe("leaving an AI room before the round", () => {
  it("releases the room when the human leaves the waiting screen", async () => {
    ctx = await startTestServer({ letter: "S", ai: fakeAi() });
    const human = await client();
    const created = await emitAck<{ roomCode: string }>(human, CLIENT_EVENTS.playAi, { displayName: "Ana" });
    if (!created.ok) throw new Error("AI room not created");

    human.disconnect();
    await settle();

    // The bot alone does not keep a room alive.
    expect(ctx.server.store.getRoomByCode(created.data.roomCode)).toBeUndefined();
  });
});

describe("A5 — playing against the AI", () => {
  it("schedules from the human's ready alone and keeps the bot's answers absent until reveal", async () => {
    const ai = fakeAi({ country: "Slovenija" });
    const payloads: unknown[] = [];

    ctx = await startTestServer({ letter: "S", ai, random: () => 0 });
    const human = await client();
    human.onAny((_event, payload) => payloads.push(payload));
    const created = await emitAck<{ roomCode: string; you: number }>(human, CLIENT_EVENTS.playAi, {
      displayName: "Ana",
    });
    if (!created.ok) throw new Error("not created");
    expect(created.data.you).toBe(1);

    const state = ctx.server.store.getRoomByCode(created.data.roomCode)!;
    expect(ctx.server.store.projectRoomState(state, 1).players).toEqual([
      expect.objectContaining({ slot: 1, bot: false }),
      expect.objectContaining({ slot: 2, bot: true, clientReady: true, connected: true }),
    ]);

    const scheduled = waitFor<RoundScheduled>(human, SERVER_EVENTS.roundScheduled);
    await emitAck(human, CLIENT_EVENTS.clientReady, { roomCode: created.data.roomCode });
    const { roundId } = await scheduled;
    await settle();
    expect(ai.botCalls).toEqual(["S"]);

    // The bot finishes at 55% of the round with random() = 0.
    ctx.advance(ctx.config.countdownMs + Math.floor(ctx.config.roundDurationMs * 0.55));
    const finished = await waitFor<{ slot: number }>(human, SERVER_EVENTS.playerFinished);
    expect(finished).toEqual({ slot: 2 });
    expect(JSON.stringify(payloads)).not.toContain("Slovenija");

    const revealed = waitFor<RoundRevealed>(human, SERVER_EVENTS.roundRevealed);
    const results = waitFor<RoundResults>(human, SERVER_EVENTS.roundResults);
    await emitAck(human, CLIENT_EVENTS.finish, { roundId });
    const reveal = await revealed;
    expect(reveal.player2.filter((answer) => answer.raw !== "")).toHaveLength(5);
    expect((await results).botFailed).toBe(false);
    // The bot's answers were judged in the same single request as the human's.
    expect(ai.checkCalls).toHaveLength(1);
    expect(ai.checkCalls[0]!.sheets[2]).toEqual(reveal.player2.reduce(
      (sheet, answer) => ({ ...sheet, [answer.category]: answer.raw }),
      {},
    ));
  });

  it("finishes the bot on arrival when its answers come after its finish time", async () => {
    const ai = fakeAi();
    const pending = deferred<Record<string, string> | null>();
    ai.onBot = () => pending.promise as never;
    const { human, startsAt } = await aiRound(ai);

    ctx!.setNow(startsAt);
    ctx!.advance(Math.floor(ctx!.config.roundDurationMs * 0.55));
    await expectNoEvent(human, SERVER_EVENTS.playerFinished, 50);

    const finished = waitFor(human, SERVER_EVENTS.playerFinished);
    pending.resolve(Object.fromEntries(CATEGORIES.map((category) => [category, "Sto"])));
    expect(await finished).toEqual({ slot: 2 });
  });

  it("refuses a bot room when no AI is configured", async () => {
    ctx = await startTestServer({ letter: "S" });
    const human = await client();
    const created = await emitAck(human, CLIENT_EVENTS.playAi, { displayName: "Ana" });
    expect(created).toMatchObject({ ok: false, error: { code: "AI_UNAVAILABLE" } });
    await expectNoEvent(human, SERVER_EVENTS.roomState, 50);
  });

  it("refuses the bot's reserved name for a human", async () => {
    ctx = await startTestServer({ letter: "S", ai: fakeAi() });
    const human = await client();
    const created = await emitAck(human, CLIENT_EVENTS.createRoom, { displayName: "AI" });
    expect(created).toMatchObject({ ok: false, error: { code: "INVALID_PAYLOAD" } });
  });
});

describe("A6 — the bot's AI call fails", () => {
  it("plays a blank sheet, and the human's round completes and scores normally", async () => {
    const ai = fakeAi();
    ai.onBot = async () => null;
    const { human, roundId } = await aiRound(ai);
    await draft(human, roundId, "country", "Srbija");

    const results = waitFor<RoundResults>(human, SERVER_EVENTS.roundResults);
    const revealed = waitFor<RoundRevealed>(human, SERVER_EVENTS.roundRevealed);
    await emitAck(human, CLIENT_EVENTS.finish, { roundId });
    ctx!.advance(ctx!.config.roundDurationMs);

    const scored = await results;
    expect(scored.botFailed).toBe(true);
    expect(scored.outcome).toBe("player_1");
    expect((await revealed).player2.every((answer) => answer.raw === "")).toBe(true);
  });
});
