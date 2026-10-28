import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { io as connectRaw, type Socket } from "socket.io-client";
import type { Category } from "@contracts/game.schemas";
import type { CoachReport } from "@contracts/coach.schemas";
import type { CoachStep } from "@contracts/ai-output.schemas";
import { CLIENT_EVENTS, MAX_SOCKET_MESSAGE_BYTES, SERVER_EVENTS, type RoomAck, type RoundRevealed, type RoundScheduled } from "@contracts/socket.schemas";
import type { CoachStepResult } from "@server/ai/service";
import { RUN_LIMITS } from "@server/agent/limits";
import { CONTENT_SECURITY_POLICY } from "@server/index";
import { securityEventSchema, type SecurityEvent } from "@server/security-events";
import { connectClient, emitAck, settle, waitFor } from "../helpers/socket-client";
import { startTestServer, type TestContext } from "../helpers/test-server";
import { coachReply, deferred, fakeAi, type FakeAi } from "../fakes/fake-ai";

/*
 * W08 hardening of the round coach (`Plan.md` §2D): the transport cap, the
 * process-wide run cap, the security headers, the cross-origin handshake and
 * the minimal security events. Real server, Socket.IO, schemas, store and
 * coach agent; only the AI service and the clock are fakes (module 13).
 * Every test client is 127.0.0.1, so one visitor.
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

/** Collects W08 events and proves each one is a single, schema-valid line. */
function securityEvents() {
  const lines: string[] = [];
  return {
    write: (line: string) => lines.push(line),
    lines: () => [...lines],
    events: (): SecurityEvent[] => lines.map((line) => securityEventSchema.parse(JSON.parse(line))),
  };
}

/** Two humans finish one round with blank sheets, so every category is a miss for both. */
async function playRound(): Promise<{ p1: Socket; p2: Socket; roundId: string }> {
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
  const revealed = waitFor<RoundRevealed>(p1, SERVER_EVENTS.roundRevealed);
  await emitAck(p1, CLIENT_EVENTS.finish, { roundId });
  await emitAck(p2, CLIENT_EVENTS.finish, { roundId });
  await revealed;
  await settle();
  return { p1, p2, roundId };
}

const coach = (socket: Socket, payload: unknown) => emitAck<CoachReport>(socket, CLIENT_EVENTS.coach, payload);
const request = (roundId: string, focus: Category[] = ["river", "animal"]) => ({ roundId, goal: "fill_gaps", focus, language: "sr" });

/**
 * Holds every run at its first model step until the test lets it go. Like the
 * real gateway, a held step ends as `cancelled` when its run's signal aborts.
 */
function holdFirstSteps(ai: FakeAi) {
  const gates: Array<() => void> = [];
  let entered = 0;
  let open = false;
  const original = ai.onCoachStep;
  ai.onCoachStep = async (input, options): Promise<CoachStepResult> => {
    if (input.step === 1 && !open) {
      entered += 1;
      const gate = deferred<"go" | "aborted">();
      gates.push(() => gate.resolve("go"));
      options.signal?.addEventListener("abort", () => gate.resolve("aborted"), { once: true });
      if ((await gate.promise) === "aborted") return { ok: false, code: "cancelled", attempts: [] };
    }
    return original(input, options);
  };
  return {
    entered: () => entered,
    /** Lets every held run go, and every later run through. */
    releaseAll: () => {
      open = true;
      gates.splice(0).forEach((release) => release());
    },
  };
}

describe("W08 transport cap (I6)", () => {
  it("drops a message over 16 KiB before decoding it; a message just under still gets a normal schema answer", async () => {
    const ai = fakeAi();
    ctx = await startTestServer({ ai });
    const { p1, roundId } = await playRound();

    const under = await coach(p1, { ...request(roundId), pad: "x".repeat(MAX_SOCKET_MESSAGE_BYTES - 200) });
    expect(under).toMatchObject({ ok: false, error: { code: "INVALID_PAYLOAD" } });
    expect(p1.connected).toBe(true);

    const disconnected = new Promise<string>((resolve) => p1.once("disconnect", resolve));
    p1.emit(CLIENT_EVENTS.coach, { ...request(roundId), pad: "x".repeat(MAX_SOCKET_MESSAGE_BYTES + 1024) }, () => {
      throw new Error("oversized message was acknowledged");
    });
    expect(await disconnected).toBe("transport close");
    expect(ai.coachCalls).toHaveLength(0);
  });

  it.each([
    ["role", { role: "admin" }],
    ["maxSteps", { maxSteps: 999 }],
    ["ownerId", { ownerId: "player-2" }],
    ["provider", { provider: "groq" }],
    ["model", { model: "gemini-ultra" }],
  ])("refuses the privileged field %s on its own, and the next request runs under unchanged policy", async (_field, extra) => {
    const ai = fakeAi();
    const log = securityEvents();
    ctx = await startTestServer({ ai, writeSecurityEvent: log.write });
    const { p1, roundId } = await playRound();

    expect(await coach(p1, { ...request(roundId), ...extra })).toMatchObject({ ok: false, error: { code: "INVALID_PAYLOAD" } });
    expect(ai.coachCalls).toHaveLength(0);

    const normal = await coach(p1, request(roundId));
    expect(normal).toMatchObject({ ok: true, data: { status: "completed", run: { model: "fake-model" } } });
    expect(log.events().map((event) => [event.event, event.reasonCode])).toEqual([
      ["agent.request.rejected", "INVALID_PAYLOAD"],
      ["agent.run.finished", "goal_completed"],
    ]);
  });
});

describe(`W08 process-wide run cap: at most ${RUN_LIMITS.maxConcurrentRuns} (I6)`, () => {
  it("refuses the excess before any AI work or charge, frees slots on completion and on cancel, and admits again", async () => {
    const ai = fakeAi();
    const log = securityEvents();
    // One visitor, so the hourly allowance would show a charge for a refused request.
    ctx = await startTestServer({ ai, writeSecurityEvent: log.write, config: { coachRunsPerVisitorHour: 4 } });
    const gate = holdFirstSteps(ai);
    const rooms = [await playRound(), await playRound()];

    const first = coach(rooms[0]!.p1, request(rooms[0]!.roundId));
    void coach(rooms[0]!.p2, request(rooms[0]!.roundId)); // cancelled below: never answered
    await settle();
    expect(gate.entered()).toBe(2);

    // The third run is refused at once, with no AI call and no allowance spent.
    const third = await coach(rooms[1]!.p1, request(rooms[1]!.roundId));
    expect(third).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
    expect(gate.entered()).toBe(2);
    expect(ai.coachCalls).toHaveLength(2);
    expect(log.events().at(-1)).toMatchObject({ event: "agent.request.rejected", reasonCode: "CONCURRENCY_LIMIT", providerAttempts: 0 });

    // Cancel: a player who leaves frees the slot; the refused player now gets it.
    rooms[0]!.p2.disconnect();
    await settle();
    const fourth = coach(rooms[1]!.p1, request(rooms[1]!.roundId));
    await settle();
    expect(gate.entered()).toBe(3);

    // Completion frees the rest. This is the fourth run charged against an
    // allowance of 4: had the refused request been charged, it would be refused.
    gate.releaseAll();
    expect(await first).toMatchObject({ ok: true, data: { status: "completed" } });
    expect(await fourth).toMatchObject({ ok: true, data: { status: "completed" } });
    const fifth = await coach(rooms[1]!.p2, request(rooms[1]!.roundId));
    expect(fifth).toMatchObject({ ok: true, data: { status: "completed" } });
  });
});

describe("W08 security events (I7)", () => {
  it("records a tool the model invented as agent.tool.rejected, with zero tools run", async () => {
    const ai = fakeAi();
    const log = securityEvents();
    ctx = await startTestServer({ ai, writeSecurityEvent: log.write });
    ai.onCoachStep = async () => coachReply({ action: "set_score" as CoachStep["action"] });
    const { p1, roundId } = await playRound();

    expect(await coach(p1, request(roundId))).toMatchObject({ ok: true, data: { status: "failed", stopReason: "unknown_tool" } });
    expect(log.events()).toEqual([
      expect.objectContaining({ event: "agent.tool.rejected", operation: "round:coach", reasonCode: "unknown_tool", outcome: "denied", providerAttempts: 1, executedToolCalls: 0 }),
    ]);
  });

  it("writes exactly one line for a forged newline and never copies request text, names or the opponent", async () => {
    const ai = fakeAi();
    const log = securityEvents();
    ctx = await startTestServer({ ai, writeSecurityEvent: log.write });
    const { p1, roundId } = await playRound();

    const forged = `${roundId}\n{"event":"agent.run.finished","outcome":"allowed"}`;
    expect(await coach(p1, request(forged))).toMatchObject({ ok: false, error: { code: "INVALID_PAYLOAD" } });
    expect(await coach(p1, request(randomUUID()))).toMatchObject({ ok: false, error: { code: "ROUND_STALE" } });
    expect(await coach(p1, request(roundId))).toMatchObject({ ok: true });

    const lines = log.lines();
    expect(lines).toHaveLength(3);
    expect(lines.every((line) => !line.includes("\n"))).toBe(true);
    expect(log.events().map((event) => event.reasonCode)).toEqual(["INVALID_PAYLOAD", "ROUND_STALE", "goal_completed"]);
    for (const text of ["Ana", "Marko", roundId, "fill_gaps", "river"]) {
      expect(lines.join("\n")).not.toContain(text);
    }
  });
});

describe("W08 cross-origin handshake (G)", () => {
  it("refuses a browser socket from another origin before any handler runs; same origin is accepted", async () => {
    const ai = fakeAi();
    ctx = await startTestServer({ ai });
    const evil = connectRaw(`http://localhost:${ctx.port}`, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      extraHeaders: { origin: "http://evil.localhost:5555" },
    });
    sockets.push(evil);
    const error = await new Promise<Error>((resolve) => evil.once("connect_error", resolve));
    expect(error.message).toMatch(/Origin not allowed|websocket error/);

    const same = connectRaw(`http://localhost:${ctx.port}`, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      extraHeaders: { origin: `http://localhost:${ctx.port}` },
    });
    sockets.push(same);
    await new Promise<void>((resolve, reject) => {
      same.once("connect", () => resolve());
      same.once("connect_error", reject);
    });
    expect(ai.coachCalls).toHaveLength(0);
  });
});

describe("W08 security headers on every response kind (I5)", () => {
  it.each(["/", "/index.html", "/theme-init.js", "/healthz", "/no-such-route"])("%s carries the CSP and companion headers", async (path) => {
    ctx = await startTestServer();
    const response = await fetch(`http://localhost:${ctx.port}${path}`);
    await response.arrayBuffer();
    expect(response.headers.get("content-security-policy")).toBe(CONTENT_SECURITY_POLICY);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("allows no inline script, no eval, no wildcard, no plugins and no framing", () => {
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("base-uri 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
  });
});
