import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { Socket } from "socket.io-client";
import { CATEGORIES, type Category } from "@contracts/game.schemas";
import type { CoachReport } from "@contracts/coach.schemas";
import { CLIENT_EVENTS, SERVER_EVENTS, type RoomAck, type RoundRevealed, type RoundScheduled } from "@contracts/socket.schemas";
import { answerKey } from "@server/features/check-round";
import type { CoachStepResult } from "@server/ai/service";
import { connectClient, emitAck, settle, waitFor } from "../helpers/socket-client";
import { startTestServer, type TestContext } from "../helpers/test-server";
import { deferred, fakeAi, type FakeAi } from "../fakes/fake-ai";

/*
 * The round coach over real sockets (W5-8): evals C3, C14, C15, single-flight
 * and cancellation. Fake AI service, injected clock and scheduler, real
 * Socket.IO clients (module 13). Every test client is 127.0.0.1, so one visitor.
 *
 * The fixed round: letter Lj, Serbian alphabet. Player 1 left river blank,
 * wrote "Lav" for animal (wrong letter) and "Ljubljana" for country, which
 * the referee rejects as the wrong category.
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

const P1_SHEET: Partial<Record<Category, string>> = {
  country: "Ljubljana",
  city: "Ljubljana",
  river: "",
  mountain: "Ljubišnja",
  sea: "Ljubljansko more",
  animal: "Lav",
  plant: "Ljiljan",
  thing: "Ljuljaška",
};
/** The opponent's sheet: none of these words may reach the coach's model. */
const P2_SHEET: Partial<Record<Category, string>> = {
  country: "Ljuboviјa-P2",
  river: "Ljutica-P2",
  animal: "Ljiljak-P2",
};

const startServer = async (ai: FakeAi, config: Record<string, unknown> = {}) => {
  ctx = await startTestServer({ letter: "Lj", ai, config });
};

/** Two humans finish one Lj round; resolves on results. */
async function playRound(ai: FakeAi, options: { holdCheck?: boolean } = {}) {
  const p1 = await client();
  const p2 = await client();
  const created = await emitAck<RoomAck>(p1, CLIENT_EVENTS.createRoom, { displayName: "Ana", language: "sr" });
  if (!created.ok) throw new Error("not created");
  const joined = await emitAck<RoomAck>(p2, CLIENT_EVENTS.joinRoom, { roomCode: created.data.roomCode, displayName: "Marko" });
  if (!joined.ok) throw new Error("not joined");
  const scheduled = waitFor<RoundScheduled>(p1, SERVER_EVENTS.roundScheduled);
  await emitAck(p1, CLIENT_EVENTS.clientReady, { roomCode: created.data.roomCode });
  await emitAck(p2, CLIENT_EVENTS.clientReady, { roomCode: created.data.roomCode });
  const { roundId } = await scheduled;
  ctx!.advance(ctx!.config.countdownMs);

  for (const [socket, sheet] of [
    [p1, P1_SHEET],
    [p2, P2_SHEET],
  ] as const) {
    for (const category of CATEGORIES) {
      const value = sheet[category] ?? "";
      if (value) await emitAck(socket, CLIENT_EVENTS.draft, { roundId, category, value, revision: 1 });
    }
  }

  const held = deferred<Map<string, { valid: false; reason: "wrong_category" }>>();
  const verdicts = new Map([[answerKey(1, "country"), { valid: false as const, reason: "wrong_category" as const }]]);
  ai.onCheck = options.holdCheck ? () => held.promise : async () => verdicts;

  const revealed = waitFor<RoundRevealed>(p1, SERVER_EVENTS.roundRevealed);
  await emitAck(p1, CLIENT_EVENTS.finish, { roundId });
  await emitAck(p2, CLIENT_EVENTS.finish, { roundId });
  if (options.holdCheck) {
    await settle();
    return { p1, p2, roundId, created: created.data, joined: joined.data, release: () => held.resolve(verdicts), revealed };
  }
  const reveal = await revealed;
  await settle();
  return { p1, p2, roundId, created: created.data, joined: joined.data, reveal, release: () => undefined, revealed };
}

const coach = (socket: Socket, payload: unknown) => emitAck<CoachReport>(socket, CLIENT_EVENTS.coach, payload);
const request = (roundId: string, focus: Category[] = ["country", "river", "animal"]) => ({
  roundId,
  goal: "fill_gaps",
  focus,
  language: "sr",
});

describe("C3 — invalid requests are refused before any AI use", () => {
  it("answers each with its existing code, makes no coach call, and charges nothing", async () => {
    const ai = fakeAi();
    await startServer(ai, { coachRunsPerVisitorHour: 1 });

    // During judging: the referee is held.
    const judging = await playRound(ai, { holdCheck: true });
    expect(ctx!.server.store.getRoomBySocket(judging.p1.id!)?.phase).toBe("judging");
    expect(await coach(judging.p1, request(judging.roundId))).toMatchObject({ ok: false, error: { code: "WRONG_PHASE" } });
    judging.release();
    await judging.revealed;
    await settle();

    const { p1, roundId } = judging;
    const outsider = await client();
    const refusals: Array<[unknown, Socket, string]> = [
      [{ ...request(roundId), letter: "Lj" }, p1, "INVALID_PAYLOAD"],
      [{ ...request(roundId), goal: "x" }, p1, "INVALID_PAYLOAD"],
      [request(roundId, ["river", "city"]), p1, "INVALID_PAYLOAD"], // the caller scored in city
      [request(randomUUID()), p1, "ROUND_STALE"],
      [request(roundId), outsider, "NOT_IN_ROOM"],
    ];
    for (const [payload, socket, code] of refusals) {
      expect(await coach(socket, payload)).toMatchObject({ ok: false, error: { code } });
    }
    expect(ai.coachCalls).toHaveLength(0);

    // Nothing was charged: the visitor's one run this hour is still there.
    const allowed = await coach(p1, request(roundId));
    expect(allowed).toMatchObject({ ok: true, data: { status: "completed" } });
  });
});

describe("C14 — privacy and authority over the wire", () => {
  it("answers only the caller, changes nothing, and never shows the model the opponent's sheet", async () => {
    const ai = fakeAi();
    await startServer(ai);
    const { p1, p2, roundId, created, joined, reveal } = await playRound(ai);

    const store = ctx!.server.store;
    const room = store.getRoomBySocket(p1.id!)!;
    const before = JSON.stringify([store.projectRoomState(room, 1), store.projectRoomState(room, 2), room.round, room.phase]);

    const seen: Array<[Socket, string]> = [];
    p1.onAny((event: string) => seen.push([p1, event]));
    p2.onAny((event: string) => seen.push([p2, event]));

    const answered = await coach(p1, request(roundId));
    await settle();
    if (!answered.ok) throw new Error(`coach refused: ${answered.error.code}`);
    const report = answered.data;

    // The report travels in the caller's ack only; no event reaches anyone.
    expect(seen).toEqual([]);
    expect(report.status).toBe("completed");

    // Read-only: projections, the round and its reveal are exactly as before.
    expect(JSON.stringify([store.projectRoomState(room, 1), store.projectRoomState(room, 2), room.round, room.phase])).toBe(before);

    // FR-020: the player's answer and reason come from the reveal.
    for (const tip of report.tips) {
      const revealed = reveal!.player1.find((answer) => answer.category === tip.category)!;
      expect(tip.yourAnswer).toBe(revealed.raw);
      expect(tip.whyMissed).toBe(revealed.reason ?? "empty");
    }
    expect(report.tips.map((tip) => tip.category)).toEqual(["country", "river", "animal"]);

    // FR-006/FR-007: exactly the documented fields, and no opponent answer, room code or token.
    expect(ai.coachCalls.length).toBeGreaterThan(0);
    for (const { input } of ai.coachCalls) {
      expect(Object.keys(input).sort()).toEqual(
        ["goal", "language", "letter", "alphabet", "step", "stepsLeft", "toolCallsLeft", "allowedActions", "focus", "toolResults"].sort(),
      );
      const sent = JSON.stringify(input);
      for (const word of Object.values(P2_SHEET)) expect(sent).not.toContain(word);
      expect(sent).not.toContain(created.roomCode);
      expect(sent).not.toContain(created.resumeToken);
      expect(sent).not.toContain(joined.resumeToken);
      expect(sent).not.toContain(roundId);
      expect(sent).not.toContain("Marko");
    }

    // A repeat returns the same report with no AI.
    const calls = ai.coachCalls.length;
    const again = await coach(p1, request(roundId));
    expect(again).toEqual(answered);
    expect(ai.coachCalls).toHaveLength(calls);
  });

  it("two concurrent requests make one run and get the same report", async () => {
    const ai = fakeAi();
    await startServer(ai);
    const { p2, roundId, reveal } = await playRound(ai);
    const zero = reveal!.player2.filter((answer) => !answer.valid).map((answer) => answer.category);

    const held = deferred<void>();
    let runs = 0;
    const original = ai.onCoachStep;
    ai.onCoachStep = async (input, options): Promise<CoachStepResult> => {
      if (input.step === 1) {
        runs += 1;
        await held.promise;
      }
      return original(input, options);
    };

    const first = coach(p2, request(roundId, zero));
    const second = coach(p2, request(roundId, zero));
    await settle();
    held.resolve();
    const [a, b] = await Promise.all([first, second]);
    expect(runs).toBe(1);
    expect(a).toMatchObject({ ok: true });
    expect(b).toEqual(a);
  });
});

describe("C15 — limits", () => {
  it("refuses a visitor's 7th coaching run in an hour as RATE_LIMITED, with no AI", async () => {
    const ai = fakeAi();
    await startServer(ai);
    let runs = 0;
    for (let room = 0; room < 3; room += 1) {
      const { p1, p2, roundId, reveal } = await playRound(ai);
      for (const [socket, sheet] of [
        [p1, reveal!.player1],
        [p2, reveal!.player2],
      ] as const) {
        const zero = sheet.filter((answer) => !answer.valid).map((answer) => answer.category);
        expect(await coach(socket, request(roundId, zero))).toMatchObject({ ok: true });
        runs += 1;
      }
    }
    expect(runs).toBe(6);

    const { p1, roundId } = await playRound(ai);
    const calls = ai.coachCalls.length;
    expect(await coach(p1, request(roundId))).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
    expect(ai.coachCalls).toHaveLength(calls);
  });

  it("refuses coaching as AI_LIMIT once the daily budget is spent, while the next round is still checked", async () => {
    const ai = fakeAi();
    await startServer(ai, { aiDailyCallBudget: 1 });
    const { p1, roundId } = await playRound(ai); // the referee's call spends the budget
    expect(ai.checkCalls).toHaveLength(1);

    expect(await coach(p1, request(roundId))).toMatchObject({ ok: false, error: { code: "AI_LIMIT" } });
    expect(ai.coachCalls).toHaveLength(0);

    await playRound(ai);
    expect(ai.checkCalls).toHaveLength(2);
  });
});

describe("cancellation — the caller leaves or the room is reaped", () => {
  async function heldRun(config: Record<string, unknown> = {}) {
    const ai = fakeAi();
    await startServer(ai, config);
    const round = await playRound(ai);
    const held = deferred<CoachStepResult>();
    ai.onCoachStep = () => held.promise;
    let acked = false;
    round.p1.emit(CLIENT_EVENTS.coach, request(round.roundId), () => {
      acked = true;
    });
    for (let i = 0; i < 20 && ai.coachCalls.length === 0; i += 1) await settle();
    expect(ai.coachCalls).toHaveLength(1);
    const signal = ai.coachCalls[0]!.options.signal!;
    return { ...round, ai, held, signal, acked: () => acked };
  }

  it("aborts the run's signal when the caller disconnects, and nothing throws", async () => {
    const run = await heldRun();
    expect(run.signal.aborted).toBe(false);
    run.p1.disconnect();
    await settle(10);
    expect(run.signal.aborted).toBe(true);
    run.held.resolve({ ok: false, code: "cancelled", attempts: [] });
    await settle(10);
    // The server still answers: the other player can be coached.
    run.ai.onCoachStep = fakeAi().onCoachStep;
    const zero = ["country", "mountain", "sea", "plant", "thing", "city"] as Category[];
    const other = await coach(run.p2, request(run.roundId, zero.filter((category) => !P2_SHEET[category])));
    expect(other).toMatchObject({ ok: true });
  });

  it("aborts the run's signal when the finished room is reaped, and sends no ack", async () => {
    const run = await heldRun({ completedRoomTtlMs: 10_000 });
    ctx!.advance(10_000);
    ctx!.server.store.cleanup();
    await settle(10);
    expect(run.signal.aborted).toBe(true);
    run.held.resolve({ ok: false, code: "cancelled", attempts: [] });
    await settle(10);
    expect(run.acked()).toBe(false);
  });
});
