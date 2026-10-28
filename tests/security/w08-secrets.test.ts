/*
 * W08 Secure the Arcade — secrets, errors and security events
 * (specs/011-secure-the-arcade). Uses the production provider wiring
 * (`createAiServiceFromEnv`) with a synthetic key; only global fetch is fake.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Socket } from "socket.io-client";
import { CLIENT_EVENTS, type ReviewAck } from "@contracts/socket.schemas";
import { createAiServiceFromEnv } from "@server/ai/service";
import { securityEventSchema } from "@server/security-events";
import { emitAck } from "../helpers/socket-client";
import { startTestServer, type TestContext } from "../helpers/test-server";
import { coachRequestFor, playRoundToResults } from "../helpers/coach-round";
import { coachJson } from "../fakes/fake-coach";
import { SENTINEL, finalCityBlank, scriptedCoach, securityEvents, toolRequest } from "./w08-fixtures";

/** Every file under `dir` whose bytes contain `needle`. */
function filesContaining(dir: string, needle: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...filesContaining(path, needle));
    else if (readFileSync(path).includes(needle)) found.push(path);
  }
  return found;
}

describe("W08 secrets, errors and security events", () => {
  let ctx: TestContext | null = null;
  const sockets: Socket[] = [];
  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.disconnect();
    await ctx?.close();
    ctx = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ["an error body that echoes the key", "body"],
    ["a thrown transport error naming the key", "throw"],
  ])("T14: the server loads the synthetic key, and %s never reaches a response, the model context or a log", async (_name, mode) => {
    const requests: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
    vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
      requests.push({ url: String(url), headers: Object.fromEntries(new Headers(init?.headers).entries()), body: String(init?.body ?? "") });
      if (mode === "throw") throw new Error(`connect ECONNREFUSED while sending x-goog-api-key=${SENTINEL}`);
      return new Response(JSON.stringify({ error: { code: 500, message: `internal error for key ${SENTINEL}` } }), { status: 500, headers: { "content-type": "application/json" } });
    });
    const logs: string[] = [];
    for (const method of ["info", "warn", "error", "log", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => { logs.push(args.map((arg) => (arg instanceof Error ? `${arg.name}: ${arg.message}\n${arg.stack}` : String(arg))).join(" ")); });
    }
    const wired = createAiServiceFromEnv({ GEMINI_API_KEY: SENTINEL, AI_PROVIDER_ORDER: "gemini" });
    if (!wired) throw new Error("provider wiring did not load the key");
    const log = securityEvents();
    ctx = await startTestServer({ ai: wired.service, coach: wired.coach, writeSecurityEvent: log.write });
    const played = await playRoundToResults(ctx, { answers: [{ city: "Subotica" }, {}] });
    sockets.push(played.p1, played.p2);
    const received: unknown[] = [];
    played.p1.onAny((...payload: unknown[]) => received.push(payload));
    played.p2.onAny((...payload: unknown[]) => received.push(payload));

    const ack = await emitAck<ReviewAck>(played.p1, CLIENT_EVENTS.review, coachRequestFor(played.roundId));

    // The key really was loaded and used — in a header only.
    const coachRequests = requests.filter((request) => request.body.includes("review_round"));
    expect(coachRequests.length).toBeGreaterThan(0);
    expect(requests.every((request) => request.headers["x-goog-api-key"] === SENTINEL)).toBe(true);
    expect(requests.some((request) => request.url.includes(SENTINEL) || request.body.includes(SENTINEL))).toBe(false);
    // Controlled failure, no internal text.
    expect(ack).toMatchObject({ ok: true, data: { status: "failed", stopReason: "provider_failed", result: null } });
    expect(JSON.stringify(ack)).not.toContain(SENTINEL);
    expect(JSON.stringify(received)).not.toContain(SENTINEL);
    expect(logs.join("\n")).not.toContain(SENTINEL);
    expect(log.lines.join("\n")).not.toContain(SENTINEL);
    expect(logs.join("\n")).not.toMatch(/\n\s+at /); // no stack trace
  });

  it("T14: a forged log line in user input is refused and produces exactly one well-formed event", async () => {
    const { coach, fake } = scriptedCoach([]);
    const log = securityEvents();
    ctx = await startTestServer({ coach, writeSecurityEvent: log.write });
    const played = await playRoundToResults(ctx);
    sockets.push(played.p1, played.p2);
    const forged = `${played.roundId}\n{"event":"agent.run.finished","outcome":"allowed","reasonCode":"completed"}`;
    const ack = await emitAck(played.p1, CLIENT_EVENTS.review, { ...coachRequestFor(played.roundId), roundId: forged });
    expect(ack).toMatchObject({ ok: false, error: { code: "INVALID_PAYLOAD" } });
    expect(fake.calls).toHaveLength(0);
    expect(log.lines).toHaveLength(1);
    expect(log.lines[0]).not.toContain("\n");
    expect(securityEventSchema.parse(JSON.parse(log.lines[0]!))).toMatchObject({ event: "agent.request.rejected", outcome: "denied", reasonCode: "INVALID_PAYLOAD" });
    expect(log.lines[0]).not.toContain(played.roundId);
  });

  it("T14: a model-chosen tool name carrying a fake log line is recorded only as a closed code", async () => {
    const forgedName = 'x\n{"event":"agent.run.finished","outcome":"allowed"}';
    const { coach, telemetry } = scriptedCoach([coachJson(toolRequest(forgedName, { focus: "overview" }))]);
    const log = securityEvents();
    ctx = await startTestServer({ coach, writeSecurityEvent: log.write });
    const played = await playRoundToResults(ctx);
    sockets.push(played.p1, played.p2);
    await emitAck(played.p1, CLIENT_EVENTS.review, coachRequestFor(played.roundId));
    const lines = [...telemetry, ...log.lines];
    expect(lines.every((line) => !line.includes("\n"))).toBe(true);
    expect(lines.join("\n")).not.toContain("agent.run.finished\\\",\\\"outcome\\\":\\\"allowed");
    expect(lines.join("\n")).not.toContain(JSON.stringify(forgedName).slice(1, -1));
    expect(log.events()).toEqual([expect.objectContaining({ event: "agent.tool.rejected", reasonCode: "unknown_tool", outcome: "denied", executedToolCalls: 0 })]);
  });

  it("T14 positive: an allowed run is logged with the minimal field set only", async () => {
    const { coach } = scriptedCoach([coachJson(toolRequest()), coachJson(finalCityBlank)]);
    const log = securityEvents();
    ctx = await startTestServer({ coach, writeSecurityEvent: log.write });
    const played = await playRoundToResults(ctx, { names: ["Ana", "Bojan"], answers: [{ country: "Srbija" }, {}] });
    sockets.push(played.p1, played.p2);
    await emitAck(played.p1, CLIENT_EVENTS.review, coachRequestFor(played.roundId));
    expect(log.lines).toHaveLength(1);
    expect(Object.keys(JSON.parse(log.lines[0]!) as object).sort()).toEqual(["correlationId", "event", "executedToolCalls", "operation", "outcome", "providerAttempts", "reasonCode", "timestamp"]);
    expect(log.lines[0]).not.toMatch(/Ana|Bojan|Srbija|review_round|analyze_round|evidence/);
  });

  it("T16: a production client build made with the synthetic key in the environment contains no trace of it", { timeout: 120_000 }, async () => {
    const { build } = await import("vite");
    const outDir = mkdtempSync(join(tmpdir(), "w08-bundle-"));
    const saved = { GEMINI_API_KEY: process.env.GEMINI_API_KEY, GROQ_API_KEY: process.env.GROQ_API_KEY };
    try {
      process.env.GEMINI_API_KEY = SENTINEL;
      process.env.GROQ_API_KEY = SENTINEL;
      await build({ configFile: join(process.cwd(), "vite.config.ts"), logLevel: "silent", build: { outDir, emptyOutDir: true } });
      const files = readdirSync(join(outDir, "assets"));
      expect(files.some((file) => file.endsWith(".js"))).toBe(true);
      expect(filesContaining(outDir, "map").filter((path) => path.endsWith(".map"))).toEqual([]);
      expect(filesContaining(outDir, SENTINEL)).toEqual([]);
      expect(filesContaining(outDir, "GEMINI_API_KEY")).toEqual([]);
      // Positive control: the scanner does find the marker when it is present.
      writeFileSync(join(outDir, "control.txt"), `x${SENTINEL}x`);
      expect(filesContaining(outDir, SENTINEL)).toHaveLength(1);
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
