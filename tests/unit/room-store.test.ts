import { describe, expect, it } from "vitest";
import { CATEGORIES, serverConfigSchema } from "@contracts/game.schemas";
import type { Letter, ServerConfig } from "@contracts/game.schemas";
import { SERVER_EVENTS } from "@contracts/socket.schemas";
import { createRoomStore } from "@server/rooms/room-store";
import type { Delivery, RoomStore } from "@server/rooms/room-store";
import { createTestClock } from "../helpers/test-clock";

const P1 = "socket-1";
const P2 = "socket-2";
const P3 = "socket-3";
const LETTER: Letter = "S";

type Harness = {
  store: RoomStore;
  config: ServerConfig;
  advance: (ms: number) => void;
  setNow: (atMs: number) => void;
  now: () => number;
  deliveries: Delivery[];
  to: (socketId: string) => Delivery[];
  eventsTo: (socketId: string, event: string) => Delivery[];
};

function createHarness(overrides: Partial<Record<string, unknown>> = {}): Harness {
  const { clock, scheduler, advance, setNow } = createTestClock();
  const config = serverConfigSchema.parse(overrides);
  const deliveries: Delivery[] = [];

  const store = createRoomStore({
    clock,
    scheduler,
    selectLetter: () => LETTER,
    config,
    deliver: (delivery) => deliveries.push(delivery),
  });

  return {
    store,
    config,
    advance,
    setNow,
    now: () => clock.now(),
    deliveries,
    to: (socketId) => deliveries.filter((delivery) => delivery.socketId === socketId),
    eventsTo: (socketId, event) =>
      deliveries.filter((delivery) => delivery.socketId === socketId && delivery.event === event),
  };
}

/** Create, join, both ready: the room is in `countdown` with a scheduled round. */
function scheduledRound(harness: Harness) {
  const created = harness.store.createRoom("Ana", P1);
  const roomCode = created.room.roomCode;
  expect(harness.store.joinRoom(roomCode, "Bojan", P2).ok).toBe(true);
  expect(harness.store.markClientReady(roomCode, P1).ok).toBe(true);
  expect(harness.store.markClientReady(roomCode, P2).ok).toBe(true);

  const room = harness.store.getRoomByCode(roomCode);
  const roundId = room?.round?.roundId ?? "";
  return { roomCode, room, roundId };
}

/** As above, then advance past the countdown so the round is `answering`. */
function openRound(harness: Harness) {
  const context = scheduledRound(harness);
  harness.advance(harness.config.countdownMs);
  return context;
}

/* ------------------------------------------------------- phase machine */

describe("room phase machine", () => {
  it("walks waiting_for_player -> synchronizing -> countdown -> answering -> results", () => {
    const harness = createHarness();

    const created = harness.store.createRoom("Ana", P1);
    expect(created.room.phase).toBe("waiting_for_player");
    expect(created.slot).toBe(1);

    const joined = harness.store.joinRoom(created.room.roomCode, "Bojan", P2);
    expect(joined.ok).toBe(true);
    expect(created.room.phase).toBe("synchronizing");

    harness.store.markClientReady(created.room.roomCode, P1);
    expect(created.room.phase).toBe("synchronizing");

    harness.store.markClientReady(created.room.roomCode, P2);
    expect(created.room.phase).toBe("countdown");

    harness.advance(harness.config.countdownMs);
    expect(created.room.phase).toBe("answering");

    harness.advance(harness.config.roundDurationMs);
    expect(created.room.phase).toBe("results");
  });

  it("does not choose a letter or a round while player 1 is alone", () => {
    const harness = createHarness();
    const created = harness.store.createRoom("Ana", P1);

    expect(created.room.round).toBeNull();
    expect(harness.eventsTo(P1, SERVER_EVENTS.roundScheduled)).toHaveLength(0);
    // The lobby projection carries no letter field at all before scheduling.
    for (const delivery of harness.deliveries) {
      expect(delivery.payload).not.toHaveProperty("letter");
    }
  });

  it("schedules only after both players acknowledge, and only once", () => {
    const harness = createHarness();
    const created = harness.store.createRoom("Ana", P1);
    harness.store.joinRoom(created.room.roomCode, "Bojan", P2);

    harness.store.markClientReady(created.room.roomCode, P1);
    expect(created.room.round).toBeNull();

    harness.store.markClientReady(created.room.roomCode, P2);
    const firstRoundId = created.room.round?.roundId;
    expect(firstRoundId).toBeTruthy();

    // A repeated acknowledgement is idempotent, never a second round.
    harness.store.markClientReady(created.room.roomCode, P1);
    expect(created.room.round?.roundId).toBe(firstRoundId);
    expect(harness.eventsTo(P1, SERVER_EVENTS.roundScheduled)).toHaveLength(1);
  });

  it("sends both players one identical round:scheduled payload", () => {
    const harness = createHarness();
    scheduledRound(harness);

    const [toP1] = harness.eventsTo(P1, SERVER_EVENTS.roundScheduled);
    const [toP2] = harness.eventsTo(P2, SERVER_EVENTS.roundScheduled);
    expect(toP1?.payload).toEqual(toP2?.payload);

    const payload = toP1?.payload as {
      roundId: string;
      letter: string;
      startsAt: number;
      endsAt: number;
      serverNow: number;
      categories: string[];
    };
    expect(payload.letter).toBe(LETTER);
    expect(payload.categories).toEqual([...CATEGORIES]);
    expect(payload.startsAt).toBe(payload.serverNow + harness.config.countdownMs);
    expect(payload.endsAt).toBe(payload.startsAt + harness.config.roundDurationMs);
  });
});

/* -------------------------------------------------------- membership */

describe("joinRoom", () => {
  it("rejects an unknown room code", () => {
    const harness = createHarness();
    const result = harness.store.joinRoom("ZZZZZZ", "Bojan", P2);
    expect(result).toEqual({
      ok: false,
      error: { code: "ROOM_NOT_FOUND", message: "Partija nije pronađena. Proveri kod." },
    });
  });

  it("rejects a third player without disturbing either existing player", () => {
    const harness = createHarness();
    const created = harness.store.createRoom("Ana", P1);
    harness.store.joinRoom(created.room.roomCode, "Bojan", P2);
    const before = JSON.stringify(created.room);

    const result = harness.store.joinRoom(created.room.roomCode, "Cveta", P3);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ROOM_FULL");
    expect(JSON.stringify(created.room)).toBe(before);
    expect(harness.store.getRoomBySocket(P3)).toBeUndefined();
  });

  it("gives each player a different private resume token", () => {
    const harness = createHarness();
    const created = harness.store.createRoom("Ana", P1);
    const joined = harness.store.joinRoom(created.room.roomCode, "Bojan", P2);

    expect(joined.ok).toBe(true);
    if (joined.ok) expect(joined.data.resumeToken).not.toBe(created.resumeToken);
  });
});

describe("markClientReady", () => {
  it("rejects an unknown room", () => {
    const harness = createHarness();
    const result = harness.store.markClientReady("ZZZZZZ", P1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ROOM_NOT_FOUND");
  });

  it("rejects a socket that is not a player in that room", () => {
    const harness = createHarness();
    const created = harness.store.createRoom("Ana", P1);
    harness.store.joinRoom(created.room.roomCode, "Bojan", P2);

    const result = harness.store.markClientReady(created.room.roomCode, P3);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_IN_ROOM");
  });

  it("rejects an acknowledgement that arrives after the round is scheduled", () => {
    const harness = createHarness();
    const { roomCode, room } = scheduledRound(harness);
    const roundId = room?.round?.roundId;

    const result = harness.store.markClientReady(roomCode, P1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("WRONG_PHASE");
    expect(room?.round?.roundId).toBe(roundId);
  });

  it("rejects an acknowledgement while player 1 is still alone", () => {
    const harness = createHarness();
    const created = harness.store.createRoom("Ana", P1);

    const result = harness.store.markClientReady(created.room.roomCode, P1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("WRONG_PHASE");
  });
});

/* ------------------------------------------------------------- drafts */

describe("applyDraft", () => {
  it("accepts an increasing revision during the answering phase", () => {
    const harness = createHarness();
    const { roundId } = openRound(harness);

    const first = harness.store.applyDraft(
      { roundId, category: "city", value: "Subotica", revision: 1 },
      P1,
    );
    expect(first).toEqual({ ok: true, data: { category: "city", acceptedRevision: 1 } });

    const second = harness.store.applyDraft(
      { roundId, category: "city", value: "Smederevo", revision: 2 },
      P1,
    );
    expect(second.ok).toBe(true);
  });

  it("rejects a draft before startsAt", () => {
    const harness = createHarness();
    const { roundId } = scheduledRound(harness);

    const result = harness.store.applyDraft(
      { roundId, category: "city", value: "Subotica", revision: 1 },
      P1,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TOO_EARLY");
  });

  it("rejects a draft at endsAt even though the browser may still show time", () => {
    const harness = createHarness();
    const { roomCode, roundId } = openRound(harness);
    const room = harness.store.getRoomByCode(roomCode);
    const endsAt = room?.round?.endsAt ?? 0;

    // Stop one millisecond short: still accepted.
    harness.advance(endsAt - harness.now() - 1);
    expect(
      harness.store.applyDraft({ roundId, category: "river", value: "Sava", revision: 1 }, P1).ok,
    ).toBe(true);

    // The deadline timer closes the round exactly at endsAt.
    harness.advance(1);
    const result = harness.store.applyDraft(
      { roundId, category: "river", value: "Studenica", revision: 2 },
      P1,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ROUND_STALE");
  });

  it("rejects a stale or replayed revision and keeps the accepted value", () => {
    const harness = createHarness();
    const { roomCode, roundId } = openRound(harness);

    harness.store.applyDraft({ roundId, category: "city", value: "Subotica", revision: 4 }, P1);

    for (const revision of [4, 3, 0]) {
      const result = harness.store.applyDraft(
        { roundId, category: "city", value: "Beograd", revision },
        P1,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("STALE_REVISION");
    }

    const room = harness.store.getRoomByCode(roomCode);
    expect(room?.players[1]?.drafts.city).toEqual({ value: "Subotica", revision: 4 });
  });

  it("rejects a draft carrying another round's id", () => {
    const harness = createHarness();
    openRound(harness);

    const result = harness.store.applyDraft(
      {
        roundId: "11111111-2222-4333-8444-555555555555",
        category: "city",
        value: "Subotica",
        revision: 1,
      },
      P1,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ROUND_STALE");
  });

  it("rejects a draft from a socket that belongs to no room", () => {
    const harness = createHarness();
    const { roundId } = openRound(harness);

    const result = harness.store.applyDraft(
      { roundId, category: "city", value: "Subotica", revision: 1 },
      P3,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_IN_ROOM");
  });

  it("rejects a draft after that player finished, preserving the locked version", () => {
    const harness = createHarness();
    const { roomCode, roundId } = openRound(harness);

    harness.store.applyDraft({ roundId, category: "city", value: "Subotica", revision: 1 }, P1);
    harness.store.finish(roundId, P1);

    const result = harness.store.applyDraft(
      { roundId, category: "city", value: "Smederevo", revision: 2 },
      P1,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ALREADY_FINISHED");

    const room = harness.store.getRoomByCode(roomCode);
    expect(room?.players[1]?.lockedAnswers?.city).toBe("Subotica");
  });
});

/* ------------------------------------------------------------ privacy */

describe("pre-reveal privacy", () => {
  it("never puts an opponent draft or any resume token in a payload before reveal", () => {
    const harness = createHarness();
    const created = harness.store.createRoom("Ana", P1);
    const joined = harness.store.joinRoom(created.room.roomCode, "Bojan", P2);
    harness.store.markClientReady(created.room.roomCode, P1);
    harness.store.markClientReady(created.room.roomCode, P2);
    harness.advance(harness.config.countdownMs);

    const roundId = created.room.round?.roundId ?? "";
    harness.store.applyDraft({ roundId, category: "city", value: "Subotica", revision: 1 }, P1);
    harness.store.finish(roundId, P1);

    // Everything player 2 has received so far, inspected as a whole.
    const seenByP2 = JSON.stringify(harness.to(P2));
    expect(seenByP2).not.toContain("Subotica");
    expect(seenByP2).not.toContain("subotica");
    expect(seenByP2).not.toContain(created.resumeToken);
    if (joined.ok) expect(seenByP2).not.toContain(joined.data.resumeToken);

    // And player 1 is not handed player 2's token either.
    const seenByP1 = JSON.stringify(harness.to(P1));
    if (joined.ok) expect(seenByP1).not.toContain(joined.data.resumeToken);
    expect(seenByP1).not.toContain(created.resumeToken);
  });

  it("projects room state per recipient with no drafts and no tokens", () => {
    const harness = createHarness();
    const { roomCode, roundId } = openRound(harness);
    harness.store.applyDraft({ roundId, category: "city", value: "Subotica", revision: 1 }, P1);

    const room = harness.store.getRoomByCode(roomCode);
    if (!room) throw new Error("room missing");

    const forP1 = harness.store.projectRoomState(room, 1);
    const forP2 = harness.store.projectRoomState(room, 2);

    expect(forP1.you).toBe(1);
    expect(forP2.you).toBe(2);
    expect(forP1.players.map((player) => player.displayName)).toEqual(["Ana", "Bojan"]);
    expect(JSON.stringify(forP2)).not.toContain("Subotica");
    expect(JSON.stringify(forP1)).not.toContain("resumeToken");
    for (const projected of [forP1, forP2]) {
      for (const player of projected.players) {
        expect(Object.keys(player).sort()).toEqual([
          "clientReady",
          "connected",
          "displayName",
          "finished",
          "slot",
        ]);
      }
    }
  });
});

/* --------------------------------------------------- finish and close */

describe("finish and closeRound", () => {
  it("locks the finishing player and tells both players who finished", () => {
    const harness = createHarness();
    const { roomCode, roundId } = openRound(harness);

    expect(harness.store.finish(roundId, P1)).toEqual({ ok: true, data: { finished: true } });

    const room = harness.store.getRoomByCode(roomCode);
    expect(room?.players[1]?.finished).toBe(true);
    expect(room?.phase).toBe("answering");
    expect(harness.eventsTo(P2, SERVER_EVENTS.playerFinished)[0]?.payload).toEqual({ slot: 1 });
    expect(harness.eventsTo(P2, SERVER_EVENTS.roundRevealed)).toHaveLength(0);
  });

  it("closes once with reason both_finished and reveals to both players", () => {
    const harness = createHarness();
    const { roomCode, roundId } = openRound(harness);

    harness.store.applyDraft({ roundId, category: "country", value: "Srbija", revision: 1 }, P1);
    harness.store.applyDraft({ roundId, category: "country", value: "Slovenija", revision: 1 }, P2);
    harness.store.finish(roundId, P1);
    harness.store.finish(roundId, P2);

    for (const socketId of [P1, P2]) {
      expect(harness.eventsTo(socketId, SERVER_EVENTS.roundRevealed)).toHaveLength(1);
      expect(harness.eventsTo(socketId, SERVER_EVENTS.roundResults)).toHaveLength(1);
    }

    const revealed = harness.eventsTo(P1, SERVER_EVENTS.roundRevealed)[0]?.payload as {
      closedReason: string;
      player1: { category: string; raw: string; normalized: string; valid: boolean }[];
    };
    expect(revealed.closedReason).toBe("both_finished");
    expect(revealed.player1).toHaveLength(CATEGORIES.length);
    expect(revealed.player1[0]).toEqual({
      category: "country",
      raw: "Srbija",
      normalized: "srbija",
      valid: true,
    });

    const results = harness.eventsTo(P1, SERVER_EVENTS.roundResults)[0]?.payload as {
      player1Total: number;
      player2Total: number;
      outcome: string;
    };
    expect(results.player1Total).toBe(10);
    expect(results.player2Total).toBe(10);
    expect(results.outcome).toBe("draw");
    expect(harness.store.getRoomByCode(roomCode)?.phase).toBe("results");
  });

  it("closes once on the deadline when nobody finished", () => {
    const harness = createHarness();
    const { roomCode, roundId } = openRound(harness);
    harness.store.applyDraft({ roundId, category: "country", value: "Srbija", revision: 1 }, P1);

    harness.advance(harness.config.roundDurationMs);

    const revealed = harness.eventsTo(P2, SERVER_EVENTS.roundRevealed);
    expect(revealed).toHaveLength(1);
    expect((revealed[0]?.payload as { closedReason: string }).closedReason).toBe("deadline");

    const results = harness.eventsTo(P2, SERVER_EVENTS.roundResults)[0]?.payload as {
      player1Total: number;
      player2Total: number;
      outcome: string;
    };
    expect(results.player1Total).toBe(10);
    expect(results.player2Total).toBe(0);
    expect(results.outcome).toBe("player_1");
    expect(harness.store.getRoomByCode(roomCode)?.phase).toBe("results");
  });

  it("scores the latest accepted draft of a player who never pressed Finished", () => {
    const harness = createHarness();
    const { roundId } = openRound(harness);

    harness.store.applyDraft({ roundId, category: "river", value: "Sava", revision: 1 }, P1);
    harness.store.applyDraft({ roundId, category: "river", value: "Studenica", revision: 2 }, P1);
    harness.advance(harness.config.roundDurationMs);

    const revealed = harness.eventsTo(P1, SERVER_EVENTS.roundRevealed)[0]?.payload as {
      player1: { category: string; raw: string }[];
    };
    expect(revealed.player1.find((answer) => answer.category === "river")?.raw).toBe("Studenica");
  });

  it("treats a duplicate finish as the current lock state and never scores twice", () => {
    const harness = createHarness();
    const { roundId } = openRound(harness);

    harness.store.finish(roundId, P1);
    expect(harness.store.finish(roundId, P1)).toEqual({ ok: true, data: { finished: true } });
    harness.store.finish(roundId, P2);
    expect(harness.store.finish(roundId, P2)).toEqual({ ok: true, data: { finished: true } });

    expect(harness.eventsTo(P1, SERVER_EVENTS.roundRevealed)).toHaveLength(1);
    expect(harness.eventsTo(P1, SERVER_EVENTS.roundResults)).toHaveLength(1);
  });

  it("is idempotent when closeRound is called again, for either reason", () => {
    const harness = createHarness();
    const { roundId } = openRound(harness);

    harness.store.closeRound(roundId, "deadline");
    harness.store.closeRound(roundId, "deadline");
    harness.store.closeRound(roundId, "both_finished");
    harness.advance(harness.config.roundDurationMs);

    expect(harness.eventsTo(P1, SERVER_EVENTS.roundRevealed)).toHaveLength(1);
    expect(harness.eventsTo(P1, SERVER_EVENTS.roundResults)).toHaveLength(1);
  });

  it("ignores closeRound for an unknown round", () => {
    const harness = createHarness();
    openRound(harness);
    const before = harness.deliveries.length;

    harness.store.closeRound("11111111-2222-4333-8444-555555555555", "deadline");
    expect(harness.deliveries).toHaveLength(before);
  });

  it("resolves a finish that races the deadline into exactly one close", () => {
    const harness = createHarness();
    const { roomCode, roundId } = openRound(harness);
    const room = harness.store.getRoomByCode(roomCode);

    // setNow, not advance: the wall clock passes endsAt while the deadline
    // callback has not run yet. That is exactly how a finish can arrive after
    // the deadline on a real connection, and it is the race being tested.
    harness.setNow(room?.round?.endsAt ?? 0);

    const result = harness.store.finish(roundId, P1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TOO_LATE");

    expect(harness.eventsTo(P1, SERVER_EVENTS.roundRevealed)).toHaveLength(1);
    expect(harness.eventsTo(P1, SERVER_EVENTS.roundResults)).toHaveLength(1);
    expect(
      (harness.eventsTo(P1, SERVER_EVENTS.roundRevealed)[0]?.payload as { closedReason: string })
        .closedReason,
    ).toBe("deadline");

    // The timer firing afterwards must not produce a second reveal.
    harness.advance(1);
    expect(harness.eventsTo(P1, SERVER_EVENTS.roundRevealed)).toHaveLength(1);
  });

  it("rejects a finish before startsAt", () => {
    const harness = createHarness();
    const { roundId } = scheduledRound(harness);

    const result = harness.store.finish(roundId, P1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TOO_EARLY");
  });

  it("rejects a finish for a round that is not the active one", () => {
    const harness = createHarness();
    openRound(harness);

    const result = harness.store.finish("11111111-2222-4333-8444-555555555555", P1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ROUND_STALE");
  });

  it("rejects a finish from a socket that belongs to no room", () => {
    const harness = createHarness();
    const { roundId } = openRound(harness);

    const result = harness.store.finish(roundId, P3);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_IN_ROOM");
  });
});

/* ------------------------------------------------- disconnect and TTL */

describe("disconnection", () => {
  it("keeps the timer and the accepted drafts, and only flips connection status", () => {
    const harness = createHarness();
    const { roomCode, roundId } = openRound(harness);
    harness.store.applyDraft({ roundId, category: "country", value: "Srbija", revision: 1 }, P1);

    harness.store.markDisconnected(P1);

    const room = harness.store.getRoomByCode(roomCode);
    expect(room?.players[1]?.connected).toBe(false);
    expect(room?.players[1]?.drafts.country.value).toBe("Srbija");
    expect(harness.store.projectRoomState(room!, 2).players[0]?.connected).toBe(false);

    // The round still closes on its own deadline, and the player still present
    // receives the reveal.
    harness.advance(harness.config.roundDurationMs);
    expect(harness.eventsTo(P2, SERVER_EVENTS.roundRevealed)).toHaveLength(1);
    expect(room?.phase).toBe("results");
  });

  it("ignores a disconnect from a socket it never bound", () => {
    const harness = createHarness();
    openRound(harness);
    const before = harness.deliveries.length;

    harness.store.markDisconnected(P3);
    expect(harness.deliveries).toHaveLength(before);
  });
});

describe("cleanup", () => {
  it("keeps an active room and drops a finished one once its TTL passes", () => {
    const harness = createHarness();
    const { roomCode, roundId } = openRound(harness);
    harness.store.finish(roundId, P1);
    harness.store.finish(roundId, P2);

    harness.store.cleanup();
    expect(harness.store.getRoomByCode(roomCode)).toBeDefined();

    harness.advance(harness.config.completedRoomTtlMs);
    harness.store.cleanup();
    expect(harness.store.getRoomByCode(roomCode)).toBeUndefined();
    expect(harness.store.getRoomBySocket(P1)).toBeUndefined();
  });

  it("drops an abandoned lobby that nobody ever joined", () => {
    const harness = createHarness();
    const created = harness.store.createRoom("Ana", P1);

    harness.advance(harness.config.waitingRoomTtlMs - 1);
    harness.store.cleanup();
    expect(harness.store.getRoomByCode(created.room.roomCode)).toBeDefined();

    harness.advance(1);
    harness.store.cleanup();
    expect(harness.store.getRoomByCode(created.room.roomCode)).toBeUndefined();
    expect(created.room.phase).toBe("closed");
  });

  it("keeps a room that is mid-round however long the round lasts", () => {
    const harness = createHarness();
    const { roomCode } = openRound(harness);

    harness.advance(harness.config.waitingRoomTtlMs);
    harness.store.cleanup();
    expect(harness.store.getRoomByCode(roomCode)).toBeDefined();
  });
});

describe("the random-opponent queue", () => {
  it("never pairs one account with itself on a second device", () => {
    const { store } = createHarness();

    expect(store.quickPlay("Ana", P1, "account-ana")).toEqual({
      ok: true,
      data: { status: "queued" },
    });

    // The same account from another browser must keep waiting, not play itself.
    const second = store.quickPlay("Ana", P2, "account-ana");
    expect(second.ok && second.data.status).toBe("queued");
    expect(store.queueLength()).toBe(2);

    // A different account matches the one who waited longest.
    const third = store.quickPlay("Marko", P3, "account-marko");
    if (!third.ok || third.data.status !== "matched") throw new Error("not matched");
    expect(third.data.room.players[1]?.socketId).toBe(P1);
    expect(store.queueLength()).toBe(1);
  });

  it("pairs two guests, who have no account to collide", () => {
    const { store } = createHarness();

    store.quickPlay("Ana", P1);
    const matched = store.quickPlay("Marko", P2);
    if (!matched.ok || matched.data.status !== "matched") throw new Error("not matched");

    expect(matched.data.slot).toBe(2);
    expect(matched.data.room.phase).toBe("synchronizing");
    expect(store.queueLength()).toBe(0);
  });

  it("leaves the queue empty once a waiting player disconnects", () => {
    const { store } = createHarness();

    store.quickPlay("Ana", P1);
    expect(store.queueLength()).toBe(1);

    store.markDisconnected(P1);
    expect(store.queueLength()).toBe(0);
  });
});
