import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const socketState = vi.hoisted(() => ({
  connected: true,
  emitted: [] as { event: string; payload: unknown; ack: (raw: unknown) => void }[],
  listeners: new Map<string, (...args: unknown[]) => void>(),
}));

vi.mock("socket.io-client", () => ({
  io: () => ({
    get connected() { return socketState.connected; },
    emit: (event: string, payload: unknown, ack: (raw: unknown) => void) => socketState.emitted.push({ event, payload, ack }),
    on: (event: string, handler: (...args: unknown[]) => void) => socketState.listeners.set(event, handler),
    disconnect: () => { socketState.connected = false; },
  }),
}));

import { createGameSocket } from "@client/socket/game-socket";
import { CLIENT_EVENTS } from "@contracts/socket.schemas";

const roundId = "69ecddaa-95fb-4dc5-a6f6-4e567c814823";
const failedAck = {
  ok: true,
  data: { runId: roundId, roundId, status: "failed", stopReason: "provider_failed", stepCount: 1, toolCallCount: 0, providerAttemptCount: 1, elapsedMs: 50, result: null },
};

describe("coach socket acknowledgement boundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    socketState.connected = true;
    socketState.emitted = [];
    socketState.listeners.clear();
  });
  afterEach(() => vi.useRealTimers());

  it("rejects invalid requests without emitting", async () => {
    const socket = createGameSocket();
    const ack = await socket.reviewRound({ roundId, goalId: "review_round", language: "sr", seat: 2 } as never);
    expect(ack.ok).toBe(false);
    expect(socketState.emitted).toHaveLength(0);
  });

  it("uses a coach-only 32 second timeout and ignores a late callback", async () => {
    const socket = createGameSocket();
    const pending = socket.reviewRound({ roundId, goalId: "review_round", language: "sr" });
    expect(socketState.emitted[0]?.event).toBe(CLIENT_EVENTS.coach);
    await vi.advanceTimersByTimeAsync(31_999);
    expect(socketState.emitted).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    const timedOut = await pending;
    expect(timedOut.ok).toBe(false);
    socketState.emitted[0]!.ack(failedAck);
    expect(await pending).toEqual(timedOut);
  });

  it("aborts promptly and ignores late callbacks", async () => {
    const socket = createGameSocket();
    const controller = new AbortController();
    const pending = socket.reviewRound({ roundId, goalId: "review_round", language: "sr" }, controller.signal);
    controller.abort();
    const aborted = await pending;
    expect(aborted.ok).toBe(false);
    socketState.emitted[0]!.ack(failedAck);
    expect(await pending).toEqual(aborted);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("turns malformed or stale-round acknowledgements into safe errors", async () => {
    const socket = createGameSocket();
    const malformed = socket.reviewRound({ roundId, goalId: "review_round", language: "sr" });
    socketState.emitted[0]!.ack({ ok: true, data: { status: "completed" } });
    expect((await malformed).ok).toBe(false);

    const stale = socket.reviewRound({ roundId, goalId: "review_round", language: "sr" });
    socketState.emitted[1]!.ack({ ...failedAck, data: { ...failedAck.data, roundId: "11111111-2222-4333-8444-555555555555" } });
    expect((await stale).ok).toBe(false);
  });
});
