import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ROOM_CODE_ALPHABET,
  ENGLISH_LETTERS,
  SERBIAN_LETTERS,
  resumeTokenSchema,
  roomCodeSchema,
  roundIdSchema,
} from "@contracts/game.schemas";
import { systemClock, systemScheduler } from "@server/clock";
import { generateResumeToken, generateRoomCode, generateRoundId } from "@server/ids";
import { randomLetterSelector } from "@server/letters";
import type { LetterSelector } from "@server/letters";
import { createTestClock } from "../helpers/test-clock";

/* ----------------------------------------------------------------- clock */

describe("systemClock", () => {
  it("reports wall-clock epoch milliseconds", () => {
    const before = Date.now();
    const now = systemClock.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
    expect(Number.isInteger(now)).toBe(true);
  });
});

describe("systemScheduler", () => {
  // Fake timers are safe here: this suite has no Socket.IO client (module 13).
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs the callback when the deadline is reached", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    systemScheduler.schedule(Date.now() + 1_000, fn);

    vi.advanceTimersByTime(999);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("runs a deadline that is already in the past instead of never firing", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    systemScheduler.schedule(Date.now() - 60_000, fn);

    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not run the callback after the returned cancel is called", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const cancel = systemScheduler.schedule(Date.now() + 1_000, fn);

    cancel();
    vi.advanceTimersByTime(5_000);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("createTestClock", () => {
  it("only moves when advanced, and fires what became due", () => {
    const { clock, scheduler, advance } = createTestClock(1_000);
    const fn = vi.fn();
    scheduler.schedule(1_500, fn);

    expect(clock.now()).toBe(1_000);
    advance(499);
    expect(fn).not.toHaveBeenCalled();

    advance(1);
    expect(clock.now()).toBe(1_500);
    expect(fn).toHaveBeenCalledTimes(1);

    // A fired entry never fires twice.
    advance(10_000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("honours cancellation", () => {
    const { scheduler, advance } = createTestClock(1_000);
    const fn = vi.fn();
    scheduler.schedule(1_500, fn)();

    advance(5_000);
    expect(fn).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------- ids */

describe("generateRoomCode", () => {
  it("produces codes the room-code schema accepts", () => {
    for (let index = 0; index < 200; index += 1) {
      expect(roomCodeSchema.safeParse(generateRoomCode()).success).toBe(true);
    }
  });

  it("uses only the ambiguity-free alphabet", () => {
    const seen = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      for (const char of generateRoomCode()) seen.add(char);
    }
    for (const char of seen) {
      expect(ROOM_CODE_ALPHABET).toContain(char);
    }
    for (const excluded of ["0", "O", "1", "I"]) {
      expect(seen.has(excluded)).toBe(false);
    }
  });

  it("does not repeat itself across many draws", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateRoomCode()));
    expect(codes.size).toBeGreaterThan(190);
  });
});

describe("generateRoundId", () => {
  it("produces distinct ids the round-id schema accepts", () => {
    const ids = Array.from({ length: 50 }, () => generateRoundId());
    for (const id of ids) {
      expect(roundIdSchema.safeParse(id).success).toBe(true);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("generateResumeToken", () => {
  it("produces distinct tokens the resume-token schema accepts", () => {
    const tokens = Array.from({ length: 50 }, () => generateResumeToken());
    for (const token of tokens) {
      expect(resumeTokenSchema.safeParse(token).success).toBe(true);
    }
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it("is URL-safe and long enough to be unguessable", () => {
    const token = generateResumeToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

/* --------------------------------------------------------------- letters */

describe("randomLetterSelector", () => {
  // 2,000 draws over 30 letters: the chance of missing one is below 1e-27.
  const draws = (alphabet: "sr" | "en") => new Set(Array.from({ length: 2_000 }, () => randomLetterSelector(alphabet)));

  it("draws every Serbian letter, and only Serbian letters, for a Serbian room", () => {
    const seen = draws("sr");
    expect([...seen].sort()).toEqual([...SERBIAN_LETTERS].sort());
    for (const letter of ["Q", "W", "X", "Y"]) expect(seen.has(letter as never)).toBe(false);
  });

  it("draws every English letter, and only English letters, for an English room", () => {
    const seen = draws("en");
    expect([...seen].sort()).toEqual([...ENGLISH_LETTERS].sort());
    for (const letter of ["Č", "Ć", "Dž", "Đ", "Lj", "Nj", "Š", "Ž"]) expect(seen.has(letter as never)).toBe(false);
  });

  it("is an injectable seam a test can pin", () => {
    const fixedLetter: LetterSelector = () => "S";
    expect(fixedLetter("en")).toBe("S");
  });
});
