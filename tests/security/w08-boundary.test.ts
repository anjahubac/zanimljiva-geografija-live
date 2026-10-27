/*
 * W08 Secure the Arcade — transport/API boundary (specs/011-secure-the-arcade).
 * Real server, real Socket.IO transport, real schemas and room store; only the
 * provider adapter is a scripted fake.
 */
import { afterEach, describe, expect, it } from "vitest";
import { io as connectRaw, type Socket } from "socket.io-client";
import { CLIENT_EVENTS, MAX_SOCKET_MESSAGE_BYTES, SERVER_EVENTS, type CoachAck, type RoundResults } from "@contracts/socket.schemas";
import { COACH_MAX_CONCURRENT_RUNS } from "@contracts/coach.schemas";
import type { Ack } from "@contracts/errors";
import { CONTENT_SECURITY_POLICY } from "@server/index";
import { VISITOR_WINDOW_MS } from "@server/usage-limits";
import type { ModelCall, ProviderAdapter } from "@server/ai/types";
import { createPostRoundCoach } from "@server/features/post-round-coach";
import { connectClient, emitAck, waitFor } from "../helpers/socket-client";
import { startTestServer, type TestContext } from "../helpers/test-server";
import { coachRequestFor, playRoundToResults } from "../helpers/coach-round";
import { coachJson } from "../fakes/fake-coach";
import { canonicalState, finalCityBlank, flush, scriptedCoach, securityEvents, toolRequest } from "./w08-fixtures";

const happyScript = (runs = 1) => Array.from({ length: runs * 2 }, (_, index) => coachJson(index % 2 === 0 ? toolRequest() : finalCityBlank));

describe("W08 transport and API boundary", () => {
  let ctx: TestContext | null = null;
  const sockets: Socket[] = [];
  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.disconnect();
    await ctx?.close();
    ctx = null;
  });
  const track = <T extends { p1: Socket; p2: Socket }>(played: T): T => { sockets.push(played.p1, played.p2); return played; };

  it("T00/I4/I8: the normal flow runs 2 model steps and 1 real tool, and leaves canonical game state unchanged", async () => {
    const { coach, fake } = scriptedCoach(happyScript());
    const log = securityEvents();
    ctx = await startTestServer({ coach, writeSecurityEvent: log.write });
    const played = track(await playRoundToResults(ctx, { answers: [{ country: "Srbija" }, {}] }));
    const room = ctx.server.store.getRoomByCode(played.roomCode);
    const before = canonicalState(room);
    let lateResults = 0;
    played.p1.on(SERVER_EVENTS.roundResults, () => { lateResults += 1; });

    const ack = await emitAck<CoachAck>(played.p1, CLIENT_EVENTS.coach, coachRequestFor(played.roundId));

    expect(ack).toMatchObject({ ok: true, data: { status: "completed", stepCount: 2, toolCallCount: 1, providerAttemptCount: 2 } });
    expect(fake.calls).toHaveLength(2);
    expect(canonicalState(ctx.server.store.getRoomByCode(played.roomCode))).toEqual(before);
    expect(lateResults).toBe(0);
    expect(log.events()).toEqual([expect.objectContaining({ event: "agent.run.finished", outcome: "allowed", reasonCode: "completed", providerAttempts: 2, executedToolCalls: 1 })]);
  });

  describe("T01: direct requests bypassing the UI", () => {
    it.each<[string, (roundId: string) => unknown]>([
      ["wrong type", () => ({ roundId: 123, goalId: "review_round", language: "sr" })],
      ["missing field", () => ({ goalId: "review_round", language: "sr" })],
      ["null field", () => ({ roundId: null, goalId: "review_round", language: "sr" })],
      ["unknown goal", (roundId) => ({ roundId, goalId: "win_the_game", language: "sr" })],
      ["unsupported language", (roundId) => ({ roundId, goalId: "review_round", language: "de" })],
      ["not an object", () => "review_round"],
    ])("rejects %s before any provider or tool work", async (_name, build) => {
      const { coach, fake, telemetry } = scriptedCoach(happyScript());
      const log = securityEvents();
      ctx = await startTestServer({ coach, writeSecurityEvent: log.write });
      const played = track(await playRoundToResults(ctx));
      const ack = await emitAck(played.p1, CLIENT_EVENTS.coach, build(played.roundId));
      expect(ack).toMatchObject({ ok: false, error: { code: "INVALID_PAYLOAD" } });
      expect(fake.calls).toHaveLength(0);
      expect(telemetry).toHaveLength(0);
      expect(log.events()).toEqual([expect.objectContaining({ event: "agent.request.rejected", reasonCode: "INVALID_PAYLOAD", providerAttempts: 0, executedToolCalls: 0 })]);
    });

    it("rejects a well-formed request for a round that is not the caller's current one (domain rule)", async () => {
      const { coach, fake } = scriptedCoach(happyScript());
      ctx = await startTestServer({ coach });
      const played = track(await playRoundToResults(ctx));
      const ack = await emitAck(played.p1, CLIENT_EVENTS.coach, coachRequestFor("11111111-2222-4333-8444-555555555555"));
      expect(ack).toMatchObject({ ok: false, error: { code: "ROUND_STALE" } });
      expect(fake.calls).toHaveLength(0);
    });

    it("closes the connection on malformed JSON at the wire level, without touching the provider", async () => {
      const { coach, fake } = scriptedCoach(happyScript());
      ctx = await startTestServer({ coach });
      const raw = new WebSocket(`ws://localhost:${ctx.port}/socket.io/?EIO=4&transport=websocket`);
      const closed = new Promise<number>((resolve) => raw.addEventListener("close", (event) => resolve(event.code)));
      await new Promise<void>((resolve) => raw.addEventListener("open", () => resolve()));
      raw.send("40");
      await new Promise((resolve) => setTimeout(resolve, 50));
      raw.send('42["round:coach",{"roundId":');
      await closed;
      expect(raw.readyState).toBe(WebSocket.CLOSED);
      expect(fake.calls).toHaveLength(0);
      // The server keeps serving everyone else.
      const played = track(await playRoundToResults(ctx));
      expect(await emitAck(played.p1, CLIENT_EVENTS.coach, coachRequestFor(played.roundId))).toMatchObject({ ok: true, data: { status: "completed" } });
    });

    it("accepts the legitimate boundary values: a 40-character answer and both UI languages", async () => {
      const { coach } = scriptedCoach(happyScript(2));
      ctx = await startTestServer({ coach });
      const p1 = await connectClient(ctx.port);
      sockets.push(p1);
      const created = await emitAck<{ roomCode: string }>(p1, CLIENT_EVENTS.createRoom, { displayName: "x".repeat(24), language: "sr" });
      expect(created.ok).toBe(true);
      const played = track(await playRoundToResults(ctx, { answers: [{ thing: "S".repeat(40) }, {}] }));
      const tooLong = await emitAck(played.p1, CLIENT_EVENTS.draft, { roundId: played.roundId, category: "thing", value: "S".repeat(41), revision: 2 });
      expect(tooLong).toMatchObject({ ok: false, error: { code: "INVALID_PAYLOAD" } });
      expect(await emitAck(played.p1, CLIENT_EVENTS.coach, coachRequestFor(played.roundId, "en"))).toMatchObject({ ok: true, data: { status: "completed" } });
    });
  });

  describe("T02: oversized bodies and privilege fields, each checked on its own", () => {
    it("drops a message over the transport cap before decoding it; a message under the cap still gets a normal answer", async () => {
      const { coach, fake } = scriptedCoach(happyScript());
      ctx = await startTestServer({ coach });
      const played = track(await playRoundToResults(ctx));
      // Just under the cap: decoded, then refused by the strict schema; the connection survives.
      const under = await emitAck(played.p1, CLIENT_EVENTS.coach, { ...coachRequestFor(played.roundId), pad: "x".repeat(MAX_SOCKET_MESSAGE_BYTES - 200) });
      expect(under).toMatchObject({ ok: false, error: { code: "INVALID_PAYLOAD" } });
      expect(played.p1.connected).toBe(true);
      // Over the cap: the transport closes the connection; no ack, no decode, no provider.
      const disconnected = new Promise<string>((resolve) => played.p1.once("disconnect", resolve));
      played.p1.emit(CLIENT_EVENTS.coach, { ...coachRequestFor(played.roundId), pad: "x".repeat(MAX_SOCKET_MESSAGE_BYTES + 1024) }, () => { throw new Error("oversized message was acknowledged"); });
      expect(await disconnected).toBe("transport close");
      expect(fake.calls).toHaveLength(0);
    });

    it.each([
      ["role", { role: "admin" }],
      ["maxSteps", { maxSteps: 999 }],
      ["ownerId", { ownerId: "player-2" }],
      ["seat", { seat: 2 }],
      ["provider", { provider: "groq" }],
      ["model", { model: "gemini-ultra" }],
      ["deadline", { deadlineMs: 600_000 }],
    ])("refuses the privileged field %s and the server policy stays the same", async (_field, extra) => {
      const { coach, fake } = scriptedCoach(happyScript());
      const log = securityEvents();
      ctx = await startTestServer({ coach, writeSecurityEvent: log.write });
      const played = track(await playRoundToResults(ctx));
      const refused = await emitAck(played.p1, CLIENT_EVENTS.coach, { ...coachRequestFor(played.roundId), ...extra });
      expect(refused).toMatchObject({ ok: false, error: { code: "INVALID_PAYLOAD" } });
      expect(fake.calls).toHaveLength(0);
      // The same caller's legitimate request runs under the unchanged server limits and model.
      const normal = await emitAck<CoachAck>(played.p1, CLIENT_EVENTS.coach, coachRequestFor(played.roundId));
      expect(normal).toMatchObject({ ok: true, data: { status: "completed", stepCount: 2, providerAttemptCount: 2 } });
      expect(fake.calls.map((call) => call.model)).toEqual(["fake-model", "fake-model"]);
      expect(fake.calls.every((call) => call.maxOutputTokens === 1_024)).toBe(true);
      expect(log.events().map((event) => event.reasonCode)).toEqual(["INVALID_PAYLOAD", "completed"]);
    });
  });

  describe("T03/T08: resource scope without accounts (room-bound private results)", () => {
    it("A reviews only A's own round; B's round id is refused exactly like a nonexistent one, before provider work", async () => {
      const { coach, fake } = scriptedCoach(happyScript(2));
      ctx = await startTestServer({ coach });
      const roomA = track(await playRoundToResults(ctx, { names: ["Ana", "Aca"], answers: [{ country: "Srbija" }, {}] }));
      const roomB = track(await playRoundToResults(ctx, { names: ["Bora", "Bane"], answers: [{}, { city: "Subotica" }] }));

      const foreign = await emitAck(roomA.p1, CLIENT_EVENTS.coach, coachRequestFor(roomB.roundId));
      const missing = await emitAck(roomA.p1, CLIENT_EVENTS.coach, coachRequestFor("99999999-8888-4777-8666-555555555555"));
      expect(foreign).toEqual(missing);
      expect(foreign).toMatchObject({ ok: false, error: { code: "ROUND_STALE" } });
      expect(JSON.stringify(foreign)).not.toMatch(/Bora|Bane|Subotica/);
      expect(fake.calls).toHaveLength(0);

      const own = await emitAck<CoachAck>(roomA.p1, CLIENT_EVENTS.coach, coachRequestFor(roomA.roundId));
      expect(own).toMatchObject({ ok: true, data: { roundId: roomA.roundId, status: "completed" } });
    });

    it("with valid tool arguments, the tool reads only the caller's seat: each player's evidence matches their own sheet", async () => {
      const finalCountryBlank = finalCityBlank.replaceAll("city", "country");
      const { coach, fake } = scriptedCoach([coachJson(toolRequest()), coachJson(finalCityBlank), coachJson(toolRequest()), coachJson(finalCountryBlank)]);
      ctx = await startTestServer({ coach });
      const played = track(await playRoundToResults(ctx, { answers: [{ country: "Srbija" }, { city: "Subotica" }] }));
      const cell = (ack: Ack<CoachAck>, id: string) => ack.ok ? ack.data.result?.evidence.find((item) => item.id === id) : null;

      const a = await emitAck<CoachAck>(played.p1, CLIENT_EVENTS.coach, coachRequestFor(played.roundId));
      const b = await emitAck<CoachAck>(played.p2, CLIENT_EVENTS.coach, coachRequestFor(played.roundId));

      // analyze_round was called with the same, valid {focus:"overview"} both times.
      expect(fake.calls).toHaveLength(4);
      expect(cell(a, "cell:country")).toMatchObject({ blank: false, accepted: true });
      expect(cell(a, "cell:city")).toMatchObject({ blank: true });
      expect(cell(b, "cell:country")).toMatchObject({ blank: true });
      expect(cell(b, "cell:city")).toMatchObject({ blank: false, accepted: true });
      // The opponent's raw answers never enter either model context.
      expect(fake.calls.map((call) => call.userContent).join(" ")).not.toMatch(/Srbija|Subotica/);
    });
  });

  describe("T13: concurrency and admission rate", () => {
    /** Holds every provider call open until released; counts calls in flight. */
    function gatedCoach() {
      const calls: ModelCall[] = [];
      let active = 0;
      let maxActive = 0;
      const waiters: Array<() => void> = [];
      let open = false;
      const adapter: ProviderAdapter = {
        provider: "gemini",
        async generate(call) {
          calls.push(call);
          active += 1;
          maxActive = Math.max(maxActive, active);
          try {
            if (!open) await new Promise<void>((resolve) => { waiters.push(resolve); call.signal.addEventListener("abort", () => resolve(), { once: true }); });
            if (call.signal.aborted) return { ok: false, error: { code: "cancelled" } };
            return { ok: true, text: call.userContent.includes("evidence") ? finalCityBlank : toolRequest() };
          } finally { active -= 1; }
        },
      };
      const coach = createPostRoundCoach({ adapter, modelChain: ["fake-model"], thinkingLevel: null, writeTelemetry: () => {} });
      return { coach, calls, active: () => active, maxActive: () => maxActive, release: () => { open = true; for (const wake of waiters.splice(0)) wake(); } };
    }

    it(`keeps at most ${COACH_MAX_CONCURRENT_RUNS} runs active, refuses the excess before provider work, and frees slots on completion and on cancel`, async () => {
      const gate = gatedCoach();
      const log = securityEvents();
      ctx = await startTestServer({ coach: gate.coach, writeSecurityEvent: log.write });
      const rounds = [];
      for (let index = 0; index < 5; index += 1) rounds.push(track(await playRoundToResults(ctx, { names: [`A${index}`, `B${index}`] })));

      const first = emitAck<CoachAck>(rounds[0]!.p1, CLIENT_EVENTS.coach, coachRequestFor(rounds[0]!.roundId));
      const second = emitAck<CoachAck>(rounds[1]!.p1, CLIENT_EVENTS.coach, coachRequestFor(rounds[1]!.roundId));
      await flush();
      const third = await emitAck(rounds[2]!.p1, CLIENT_EVENTS.coach, coachRequestFor(rounds[2]!.roundId));
      expect(third).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
      expect(gate.active()).toBe(2);
      expect(gate.calls).toHaveLength(2);
      expect(log.events().filter((event) => event.event === "agent.request.rejected")).toEqual([expect.objectContaining({ reasonCode: "CONCURRENCY_LIMIT", providerAttempts: 0 })]);

      // Cancel frees a slot: player 0 leaves while its run is held.
      // (Its ack cannot reach a closed socket; the terminal state is read from the security log.)
      rounds[0]!.p1.disconnect();
      void first;
      for (let tries = 0; tries < 50 && !log.events().some((event) => event.reasonCode === "cancelled"); tries += 1) await new Promise((resolve) => setTimeout(resolve, 10));
      expect(log.events()).toContainEqual(expect.objectContaining({ event: "agent.run.finished", reasonCode: "cancelled", outcome: "denied" }));
      const fourth = emitAck<CoachAck>(rounds[3]!.p1, CLIENT_EVENTS.coach, coachRequestFor(rounds[3]!.roundId));
      await flush();
      expect(gate.active()).toBe(2);

      // Completion frees slots; the refused player's next legitimate request succeeds.
      gate.release();
      expect(await second).toMatchObject({ ok: true, data: { status: "completed" } });
      expect(await fourth).toMatchObject({ ok: true, data: { status: "completed" } });
      const retried = await emitAck(rounds[2]!.p1, CLIENT_EVENTS.coach, coachRequestFor(rounds[2]!.roundId));
      expect(retried).toMatchObject({ ok: true, data: { status: "completed" } });
      expect(gate.maxActive()).toBe(2);
    });

    it("refuses the sixth admission in an hour from one visitor with zero provider calls, and admits again after the window", async () => {
      const { coach, fake } = scriptedCoach(happyScript(7));
      ctx = await startTestServer({ coach });
      for (let index = 0; index < 6; index += 1) {
        const played = track(await playRoundToResults(ctx, { names: [`A${index}`, `B${index}`] }));
        const ack = await emitAck(played.p1, CLIENT_EVENTS.coach, coachRequestFor(played.roundId));
        if (index < 5) expect(ack).toMatchObject({ ok: true });
        else expect(ack).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
      }
      expect(fake.calls).toHaveLength(10);
      ctx.advance(VISITOR_WINDOW_MS);
      const later = track(await playRoundToResults(ctx, { names: ["Later", "Other"] }));
      expect(await emitAck(later.p1, CLIENT_EVENTS.coach, coachRequestFor(later.roundId))).toMatchObject({ ok: true, data: { status: "completed" } });
      expect(fake.calls).toHaveLength(12);
    });
  });

  describe("T15: client-held score and state are not authority", () => {
    it("refuses a client-supplied score, points or total, and the coach reads the server's own scoring", async () => {
      const { coach, fake } = scriptedCoach(happyScript());
      ctx = await startTestServer({ coach });
      const p1 = await connectClient(ctx.port);
      const p2 = await connectClient(ctx.port);
      sockets.push(p1, p2);
      const created = await emitAck<{ roomCode: string }>(p1, CLIENT_EVENTS.createRoom, { displayName: "Ana", language: "sr" });
      if (!created.ok) throw new Error("no room");
      await emitAck(p2, CLIENT_EVENTS.joinRoom, { roomCode: created.data.roomCode, displayName: "Bojan" });
      const scheduled = waitFor<{ roundId: string }>(p1, SERVER_EVENTS.roundScheduled);
      await emitAck(p1, CLIENT_EVENTS.clientReady, { roomCode: created.data.roomCode });
      await emitAck(p2, CLIENT_EVENTS.clientReady, { roomCode: created.data.roomCode });
      const { roundId } = await scheduled;
      ctx.advance(ctx.config.countdownMs);

      const forged = [
        [CLIENT_EVENTS.draft, { roundId, category: "country", value: "Srbija", revision: 1, points: 10 }],
        [CLIENT_EVENTS.draft, { roundId, category: "country", value: "Srbija", revision: 1, valid: true }],
        [CLIENT_EVENTS.finish, { roundId, score: 999_999 }],
        [CLIENT_EVENTS.finish, { roundId, total: 80, verified: true }],
      ] as const;
      for (const [event, payload] of forged) {
        expect(await emitAck(p1, event, payload)).toMatchObject({ ok: false, error: { code: "INVALID_PAYLOAD" } });
      }
      const results = waitFor<RoundResults>(p1, SERVER_EVENTS.roundResults);
      await emitAck(p1, CLIENT_EVENTS.finish, { roundId });
      await emitAck(p2, CLIENT_EVENTS.finish, { roundId });
      const scored = await results;
      expect(scored.player1Total).toBe(0);

      const ack = await emitAck<CoachAck>(p1, CLIENT_EVENTS.coach, coachRequestFor(roundId));
      const totals = ack.ok ? ack.data.result?.evidence.find((item) => item.kind === "totals") : null;
      expect(totals).toMatchObject({ ownPoints: 0, accepted: 0, blank: 8 });
      expect(fake.calls).toHaveLength(2);
    });
  });

  describe("CSRF / cross-origin (G)", () => {
    it("refuses a browser socket from another origin before any handler runs; same-origin is accepted", async () => {
      const { coach, fake } = scriptedCoach(happyScript());
      ctx = await startTestServer({ coach });
      const port = ctx.port;
      const evil = connectRaw(`http://localhost:${port}`, { transports: ["websocket"], forceNew: true, reconnection: false, extraHeaders: { origin: "http://evil.localhost:5555" } });
      sockets.push(evil);
      const error = await new Promise<Error>((resolve) => evil.once("connect_error", resolve));
      expect(error.message).toMatch(/Origin not allowed|websocket error/);
      expect(fake.calls).toHaveLength(0);
      const same = await connectClient(port, { origin: `http://localhost:${port}` });
      sockets.push(same);
      expect(same.connected).toBe(true);
    });
  });

  describe("T16 (server part): security headers on every response kind", () => {
    it.each(["/", "/index.html", "/theme-init.js", "/healthz", "/no-such-route"])("%s carries the CSP and companion headers", async (path) => {
      ctx = await startTestServer();
      const response = await fetch(`http://localhost:${ctx.port}${path}`);
      await response.arrayBuffer();
      expect(response.headers.get("content-security-policy")).toBe(CONTENT_SECURITY_POLICY);
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      const csp = CONTENT_SECURITY_POLICY;
      expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("base-uri 'none'");
    });
  });
});
