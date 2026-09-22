---
description: "Concrete Vitest recipes: the injected clock/scheduler pattern, socket test helpers, worked example tests, and the required test inventory."
applyTo: "**/*"
---

# Test Recipes Instructions

Module 03 states *what* must be tested. This file states *how*, with code you
can copy. Follow it literally; the timing patterns here exist because the
obvious approach produces hanging or flaky tests.

## The one rule that prevents flaky tests

**Never call `vi.useFakeTimers()` in an integration test that uses real
Socket.IO clients.** Socket.IO's handshake, ping and transport all rely on real
timers; faking them globally deadlocks the test and the failure looks like a
network bug.

Instead, inject time and scheduling into the room orchestration:

```ts
// src/server/clock.ts
export type Clock = { now(): number };
export type Cancel = () => void;
export type Scheduler = { schedule(atMs: number, fn: () => void): Cancel };

export const systemClock: Clock = { now: () => Date.now() };

export const systemScheduler: Scheduler = {
  schedule(atMs, fn) {
    const timer = setTimeout(fn, Math.max(0, atMs - Date.now()));
    return () => clearTimeout(timer);
  },
};
```

Production wires `systemClock` / `systemScheduler`. Tests wire the fakes below
and advance time explicitly. The real event loop is never blocked.

```ts
// tests/helpers/test-clock.ts
import type { Clock, Scheduler, Cancel } from "@server/clock";

export function createTestClock(start = 1_700_000_000_000) {
  let now = start;
  const pending: { atMs: number; fn: () => void; cancelled: boolean }[] = [];

  const clock: Clock = { now: () => now };

  const scheduler: Scheduler = {
    schedule(atMs, fn): Cancel {
      const entry = { atMs, fn, cancelled: false };
      pending.push(entry);
      return () => { entry.cancelled = true; };
    },
  };

  /** Move server time forward and fire everything that became due. */
  function advance(ms: number) {
    now += ms;
    for (const entry of [...pending].sort((a, b) => a.atMs - b.atMs)) {
      if (!entry.cancelled && entry.atMs <= now) {
        entry.cancelled = true;
        entry.fn();
      }
    }
  }

  return { clock, scheduler, advance, setNow: (t: number) => { now = t; } };
}
```

Every function that reads the current time takes a `Clock`. `Date.now()` must
not appear in `src/domain`, `src/contracts`, or any room-orchestration module —
the ESLint rule in module 11 enforces this for the first two layers, and review
enforces it for the third.

## Deterministic letter selection

```ts
export type LetterSelector = () => Letter;
export const randomLetterSelector: LetterSelector = () =>
  SUPPORTED_LETTERS[randomInt(SUPPORTED_LETTERS.length)]!; // node:crypto

// tests
const fixedLetter = (letter: Letter): LetterSelector => () => letter;
```

The server factory signature is therefore:

```ts
createGameServer({ config, clock, scheduler, selectLetter }): { httpServer, io, close }
```

A test that cannot inject these dependencies is testing the wrong seam.

## Socket test helpers

```ts
// tests/helpers/socket-client.ts
import { io, type Socket } from "socket.io-client";

export async function connectClient(port: number): Promise<Socket> {
  const socket = io(`http://localhost:${port}`, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
  return socket;
}

/** Resolve with the first payload of `event`, or fail fast with a readable error. */
export function waitFor<T>(socket: Socket, event: string, timeoutMs = 2000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for "${event}"`)),
      timeoutMs,
    );
    socket.once(event, (payload: T) => { clearTimeout(timer); resolve(payload); });
  });
}

/** Promise wrapper around an emit-with-ack. */
export function emitAck<T>(socket: Socket, event: string, payload: unknown): Promise<Ack<T>> {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

/** Assert that `event` does NOT arrive within the window. Used for privacy tests. */
export async function expectNoEvent(socket: Socket, event: string, windowMs = 300) {
  let received: unknown;
  socket.once(event, (p: unknown) => { received = p; });
  await new Promise((r) => setTimeout(r, windowMs));
  if (received !== undefined) {
    throw new Error(`unexpected "${event}": ${JSON.stringify(received)}`);
  }
}
```

Bind the server to port `0` in tests and read the assigned port from
`httpServer.address()`. Never hard-code 3000 in a test. Close every socket and
the server in `afterEach`, or the suite will hang on exit.

## Worked example: the synchronized-start test (E1)

```ts
// tests/integration/synchronized-start.test.ts
describe("synchronized start", () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await startTestServer({ letter: "S" }); });
  afterEach(async () => { await ctx.close(); });

  it("sends both players one identical scheduled round only after both are ready", async () => {
    const p1 = await connectClient(ctx.port);
    const p2 = await connectClient(ctx.port);

    const created = await emitAck<{ roomCode: string }>(p1, "room:create", { displayName: "Ana" });
    expect(created.ok).toBe(true);
    const roomCode = created.data.roomCode;

    await emitAck(p2, "room:join", { roomCode, displayName: "Marko" });

    // Nothing may be scheduled before both clients acknowledge.
    await emitAck(p1, "room:client-ready", { roomCode });
    await expectNoEvent(p1, "round:scheduled");

    const scheduled1 = waitFor<RoundScheduled>(p1, "round:scheduled");
    const scheduled2 = waitFor<RoundScheduled>(p2, "round:scheduled");
    await emitAck(p2, "room:client-ready", { roomCode });

    const [a, b] = await Promise.all([scheduled1, scheduled2]);
    expect(a).toEqual(b);
    expect(a.letter).toBe("S");
    expect(a.startsAt).toBeGreaterThan(a.serverNow);
    expect(a.endsAt - a.startsAt).toBe(ctx.config.roundDurationMs);
  });
});
```

Note what this asserts: not "a round started", but that the **first** ready
client triggers nothing, and that both payloads are deeply equal. That is the
fairness guarantee from `Plan.md` §5, expressed as a test.

## Worked example: the close-race test (E2)

```ts
it("closes exactly once when a finish races the deadline", async () => {
  const revealed1: unknown[] = [];
  p1.on("round:revealed", (p) => revealed1.push(p));
  p2.on("round:revealed", (p) => revealed1.push(p));

  ctx.advance(ctx.config.countdownMs + ctx.config.roundDurationMs - 1);
  await emitAck(p1, "round:finish", { roundId });   // finish 1ms before deadline
  ctx.advance(10);                                   // deadline now fires
  await settle();

  expect(revealed1).toHaveLength(2);      // one per player, not two per player
  expect(new Set(revealed1.map((r) => r.roundId)).size).toBe(1);
});
```

`settle()` is `await new Promise((r) => setImmediate(r))` repeated a few times —
enough for queued socket emissions to flush without a wall-clock sleep.

## Privacy tests assert absence

A passing "answers are hidden" test must inspect **every** payload the opponent
received, not just the one the developer remembered:

```ts
const allPayloadsSeenByP2: unknown[] = [];
p2.onAny((_event, ...args) => allPayloadsSeenByP2.push(...args));

await emitAck(p1, "round:draft", { roundId, category: "city", value: "Subotica", revision: 1 });
await settle();

const serialized = JSON.stringify(allPayloadsSeenByP2);
expect(serialized).not.toContain("Subotica");
expect(serialized).not.toContain("subotica");
expect(serialized).not.toContain(ctx.player1ResumeToken);
```

`onAny` + substring assertion catches leaks through fields nobody thought to
check, which is exactly the failure mode being guarded against.

## Table-driven scoring tests

```ts
const cases = [
  { p1: "Srbija",  p2: "Slovenija", expect: [10, 10, "both_different"] },
  { p1: "Srbija",  p2: " srbija ",  expect: [5, 5, "same_answer"] },
  { p1: "Srbija",  p2: "",          expect: [10, 0, "only_player_1"] },
  { p1: "",        p2: "Srbija",    expect: [0, 10, "only_player_2"] },
  { p1: "Beograd", p2: "",          expect: [0, 0, "neither"] },   // wrong letter
  { p1: "   ",     p2: "x".repeat(41), expect: [0, 0, "neither"] },
] as const;

it.each(cases)("scores $p1 vs $p2", ({ p1, p2, expect: [a, b, reason] }) => { /* ... */ });
```

Every row of the `Plan.md` §6 table must appear here. Changing normalization
means re-running this file, because equality decides 5 versus 10 points.

## Required test inventory

The build is not done until each file exists and passes.

| File | Covers |
| --- | --- |
| `tests/unit/normalize-answer.test.ts` | NFKC, trim, whitespace collapse, casing, diacritics |
| `tests/unit/validate-answer.test.ts` | empty, wrong letter, over-length, letter case-insensitivity |
| `tests/unit/score-category.test.ts` | all five reasons, the table above, totals and winner/draw |
| `tests/unit/contracts.test.ts` | each schema accepts a valid example and rejects a malformed one **and** an extra-key one |
| `tests/unit/config.test.ts` | invalid env exits with a clear error, valid env parses with defaults |
| `tests/integration/room-lifecycle.test.ts` | create, join, third player rejected, TTL cleanup |
| `tests/integration/synchronized-start.test.ts` | E1 |
| `tests/integration/drafts-privacy.test.ts` | revision ordering, stale rejection, opponent-absence assertions |
| `tests/integration/close-and-score.test.ts` | E2, both-finish, deadline, duplicate finish, single reveal |
| `tests/integration/rejections.test.ts` | E3, every error code, no-mutation after rejection |

## Coverage and honesty gates

- `npm run test:coverage` must meet the thresholds in `vitest.config.ts`.
- Coverage is a floor, not a goal: a covered line with no assertion is not a test.
- Never weaken a threshold, delete a failing test, add `.skip`, or loosen an
  assertion to make a suite green. Fix the code or report the blocker.
- Never report a command as passing without having run it in this session and
  seen the output.
- A test that needs a `setTimeout` longer than 500 ms is testing time instead of
  behavior. Inject the clock instead.
