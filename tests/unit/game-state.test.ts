import { describe, expect, it } from "vitest";
import { CATEGORIES } from "@contracts/game.schemas";
import type { RoomState, RoundResults, RoundRevealed, RoundScheduled } from "@contracts/socket.schemas";
import {
  gameReducer,
  initialGameState,
  selectScreen,
  type GameAction,
  type GameState,
} from "@client/state/useGameState";

const ROUND_ID = "11111111-2222-4333-8444-555555555555";

const roomState = (overrides: Partial<RoomState> = {}): RoomState => ({
  roomCode: "ABC234",
  phase: "answering",
  you: 1,
  players: [
    { slot: 1, displayName: "Ana", connected: true, clientReady: true, finished: false },
    { slot: 2, displayName: "Marko", connected: true, clientReady: true, finished: false },
  ],
  ...overrides,
});

const scheduled: RoundScheduled = {
  roundId: ROUND_ID,
  letter: "S",
  categories: [...CATEGORIES],
  serverNow: 1_700_000_000_000,
  startsAt: 1_700_000_003_000,
  endsAt: 1_700_000_093_000,
};

const reduceAll = (actions: GameAction[], from: GameState = initialGameState): GameState =>
  actions.reduce(gameReducer, from);

describe("gameReducer", () => {
  it("adopts the server's slot and phase rather than inferring them", () => {
    const state = gameReducer(initialGameState, {
      type: "room-state",
      payload: roomState({ phase: "countdown", you: 2 }),
    });

    expect(state.you).toBe(2);
    expect(state.roomCode).toBe("ABC234");
    expect(state.room?.phase).toBe("countdown");
  });

  it("stores a clock offset from the round payload for presentation only", () => {
    const state = gameReducer(initialGameState, {
      type: "round-scheduled",
      payload: scheduled,
      receivedAt: scheduled.serverNow - 250,
    });

    expect(state.clockOffsetMs).toBe(250);
    expect(state.round?.letter).toBe("S");
  });

  it("moves a field from pending to saved only when its own ack arrives", () => {
    const state = reduceAll([
      { type: "answer-changed", category: "city", value: "Subotica" },
      { type: "draft-sent", category: "city", revision: 1 },
    ]);
    expect(state.draftStatus.city).toBe("pending");

    const saved = gameReducer(state, { type: "draft-accepted", category: "city", revision: 1 });
    expect(saved.draftStatus.city).toBe("saved");
    expect(saved.draftStatus.river).toBe("empty");
  });

  it("does not mark a newer edit as saved when an older ack arrives late", () => {
    const state = reduceAll([
      { type: "answer-changed", category: "city", value: "Subotica" },
      { type: "draft-sent", category: "city", revision: 1 },
      { type: "answer-changed", category: "city", value: "Smederevo" },
      { type: "draft-sent", category: "city", revision: 2 },
      { type: "draft-accepted", category: "city", revision: 1 },
    ]);

    expect(state.draftStatus.city).toBe("pending");
  });

  it("shows a rejection next to the field that caused it", () => {
    const state = reduceAll([
      { type: "answer-changed", category: "river", value: "Sava" },
      { type: "draft-rejected", category: "river", message: "Time is up." },
    ]);

    expect(state.draftStatus.river).toBe("rejected");
    expect(state.fieldError.river).toBe("Time is up.");
    expect(state.fieldError.city).toBeUndefined();

    // Typing again clears that field's error.
    const retyped = gameReducer(state, { type: "answer-changed", category: "river", value: "S" });
    expect(retyped.fieldError.river).toBeUndefined();
  });

  it("locks the form only on an accepted finish, never on the click", () => {
    const clicked = gameReducer(initialGameState, { type: "busy", busy: true });
    expect(clicked.finished).toBe(false);

    const accepted = gameReducer(clicked, { type: "finish-accepted" });
    expect(accepted.finished).toBe(true);
    expect(accepted.busy).toBe(false);
  });

  it("separates my finish from the opponent's", () => {
    const base = gameReducer(initialGameState, { type: "room-state", payload: roomState() });

    const opponent = gameReducer(base, { type: "player-finished", payload: { slot: 2 } });
    expect(opponent.opponentFinished).toBe(true);
    expect(opponent.finished).toBe(false);

    const mine = gameReducer(opponent, { type: "player-finished", payload: { slot: 1 } });
    expect(mine.finished).toBe(true);
  });

  it("holds no opponent answer anywhere in state before the reveal", () => {
    const state = reduceAll([
      { type: "room-state", payload: roomState() },
      { type: "round-scheduled", payload: scheduled, receivedAt: scheduled.serverNow },
      { type: "answer-changed", category: "city", value: "Subotica" },
      { type: "draft-sent", category: "city", revision: 1 },
      { type: "draft-accepted", category: "city", revision: 1 },
      { type: "player-finished", payload: { slot: 2 } },
    ]);

    // My own answer is present; there is no field in which an opponent answer
    // could be hiding, revealed or not.
    expect(state.answers.city).toBe("Subotica");
    expect(state.revealed).toBeNull();
    expect(state.results).toBeNull();
    expect(JSON.stringify(state)).not.toContain("Smederevo");
  });

  it("keeps the reveal and the results exactly as the server sent them", () => {
    const revealed: RoundRevealed = {
      roundId: ROUND_ID,
      letter: "S",
      closedReason: "both_finished",
      player1: CATEGORIES.map((category) => ({
        category,
        raw: category === "city" ? "Subotica" : "",
        normalized: category === "city" ? "subotica" : "",
        valid: category === "city",
      })),
      player2: CATEGORIES.map((category) => ({
        category,
        raw: category === "city" ? "Smederevo" : "",
        normalized: category === "city" ? "smederevo" : "",
        valid: category === "city",
      })),
    };
    const results: RoundResults = {
      roundId: ROUND_ID,
      scores: CATEGORIES.map((category) => ({
        category,
        player1Points: category === "city" ? 10 : 0,
        player2Points: category === "city" ? 10 : 0,
        reason: category === "city" ? "both_different" : "neither",
      })),
      player1Total: 10,
      player2Total: 10,
      outcome: "draw",
    };

    const state = reduceAll([
      { type: "revealed", payload: revealed },
      { type: "results", payload: results },
    ]);

    expect(state.revealed).toEqual(revealed);
    expect(state.results).toEqual(results);
  });

  it("reports a lost connection without discarding what was typed", () => {
    const state = reduceAll([
      { type: "answer-changed", category: "city", value: "Subotica" },
      { type: "connection", connected: false },
    ]);

    expect(state.connected).toBe(false);
    expect(state.errorMessage).toMatch(/prekinuta/);
    expect(state.answers.city).toBe("Subotica");
  });
});

describe("selectScreen", () => {
  const withRoom = (room: RoomState, extra: Partial<GameState> = {}): GameState => ({
    ...initialGameState,
    roomCode: room.roomCode,
    room,
    ...extra,
  });

  it("shows the entry forms until a room exists", () => {
    expect(selectScreen(initialGameState)).toBe("lobby");
    expect(selectScreen({ ...initialGameState, entry: "join" })).toBe("join");
  });

  it("derives every in-room screen from the server phase", () => {
    expect(selectScreen(withRoom(roomState({ phase: "waiting_for_player" })))).toBe("waiting");
    expect(selectScreen(withRoom(roomState({ phase: "synchronizing" })))).toBe("waiting");
    expect(selectScreen(withRoom(roomState({ phase: "countdown" })))).toBe("countdown");
    expect(selectScreen(withRoom(roomState({ phase: "answering" })))).toBe("answering");
    expect(selectScreen(withRoom(roomState({ phase: "results" })))).toBe("results");
    expect(selectScreen(withRoom(roomState({ phase: "closed" })))).toBe("results");
  });

  it("shows the locked waiting screen to a player who finished first", () => {
    expect(selectScreen(withRoom(roomState({ phase: "answering" }), { finished: true }))).toBe(
      "waiting_for_opponent",
    );
  });
});

/**
 * E4. The reducer is where the defect lived: it derived `opponentFinished`
 * from the room-state payload and dropped `connected` on the floor, so a
 * correct server fact never reached a screen.
 */
describe("the reducer keeps the opponent's connection, not only their finish", () => {
  const withOpponent = (connected: boolean, finished = false): RoomState =>
    roomState({
      players: [
        { slot: 1, displayName: "Ana", connected: true, clientReady: true, finished: false },
        { slot: 2, displayName: "Marko", connected, clientReady: true, finished },
      ],
    });

  it("assumes an opponent is present until the server says otherwise", () => {
    // An empty room must not read as an opponent who walked out.
    expect(initialGameState.opponentConnected).toBe(true);
  });

  it("marks the opponent gone when their slot arrives disconnected", () => {
    const state = gameReducer(initialGameState, {
      type: "room-state",
      payload: withOpponent(false),
    });

    expect(state.opponentConnected).toBe(false);
    // Mine is unaffected: this is the opponent's socket, not my connection to
    // the server, which `state.connected` tracks separately.
    expect(state.connected).toBe(initialGameState.connected);
  });

  it("reads the opponent's slot and never the player's own", () => {
    // Reading the wrong slot would report the player themselves as gone.
    const asPlayer1 = gameReducer(initialGameState, {
      type: "room-state",
      payload: withOpponent(false),
    });
    expect(asPlayer1.opponentConnected).toBe(false);

    const asPlayer2 = gameReducer(initialGameState, {
      type: "room-state",
      payload: roomState({
        you: 2,
        players: [
          { slot: 1, displayName: "Ana", connected: false, clientReady: true, finished: false },
          { slot: 2, displayName: "Marko", connected: true, clientReady: true, finished: false },
        ],
      }),
    });
    expect(asPlayer2.opponentConnected).toBe(false);
  });

  it("keeps the last known value when a payload carries no opponent yet", () => {
    const alone = roomState({
      players: [
        { slot: 1, displayName: "Ana", connected: true, clientReady: true, finished: false },
      ],
    });
    const state = gameReducer(initialGameState, { type: "room-state", payload: alone });

    expect(state.opponentConnected).toBe(true);
  });

  it("does not disturb the finish flags it already tracked", () => {
    const state = gameReducer(initialGameState, {
      type: "room-state",
      payload: withOpponent(false, true),
    });

    expect(state.opponentFinished).toBe(true);
    expect(state.opponentConnected).toBe(false);
    expect(state.finished).toBe(false);
  });
});
