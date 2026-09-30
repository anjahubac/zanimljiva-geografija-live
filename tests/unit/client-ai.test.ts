import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CATEGORIES, CATEGORY_LABELS_EN, HINTS_PER_ROUND, type Category } from "@contracts/game.schemas";
import { GAME_ERROR_CODES } from "@contracts/errors";
import { roomStateSchema, type RoomState, type RoundResults, type RoundRevealed } from "@contracts/socket.schemas";
import { browserLanguage, parseLanguage } from "@client/i18n";
import { AnswerScreen } from "@client/screens/AnswerScreen";
import { ResultsScreen } from "@client/screens/ResultsScreen";
import { WaitingScreen } from "@client/screens/WaitingScreen";
import { gameReducer, initialGameState, selectScreen, type DraftStatus, type HintView } from "@client/state/useGameState";
import { UI_EN, UI_SR } from "@client/strings";

const ROUND_ID = "11111111-2222-4333-8444-555555555555";

const blank = <T,>(value: T): Record<Category, T> =>
  Object.fromEntries(CATEGORIES.map((category) => [category, value])) as Record<Category, T>;

/** Every leaf string of a nested strings object, with its path. */
function leaves(value: unknown, path = ""): [string, unknown][] {
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => leaves(child, path ? `${path}.${key}` : key));
  }
  return [[path, value]];
}

describe("two interface languages", () => {
  it("has a non-empty English string for every Serbian one, and a message for every error code", () => {
    const serbian = leaves(UI_SR).map(([path]) => path).sort();
    const english = leaves(UI_EN);
    expect(english.map(([path]) => path).sort()).toEqual(serbian);
    for (const [path, text] of english) expect(text, path).toMatch(/\S/);
    for (const code of GAME_ERROR_CODES) expect(UI_EN.errors[code]).toMatch(/\S/);
  });

  it("picks Serbian for a South Slavic browser and English otherwise", () => {
    expect(browserLanguage(["sr-Latn-RS", "en"])).toBe("sr");
    expect(browserLanguage(["hr"])).toBe("sr");
    expect(browserLanguage(["en-GB", "de"])).toBe("en");
    expect(browserLanguage([])).toBe("en");
  });

  it("falls back on a stored value it does not recognise", () => {
    expect(parseLanguage("en", "sr")).toBe("en");
    expect(parseLanguage("de", "sr")).toBe("sr");
    expect(parseLanguage(null, "en")).toBe("en");
  });
});

describe("the reducer's hint state", () => {
  const scheduled = {
    type: "round-scheduled" as const,
    receivedAt: 0,
    payload: {
      roundId: ROUND_ID,
      letter: "S" as const,
      categories: [...CATEGORIES],
      serverNow: 1_700_000_000_000,
      startsAt: 1_700_000_003_000,
      endsAt: 1_700_000_153_000,
    },
  };

  it("shows loading, then the clue, and takes the allowance from the server's ack", () => {
    let state = gameReducer(initialGameState, scheduled);
    expect(state.hintsLeft).toBe(HINTS_PER_ROUND);

    state = gameReducer(state, { type: "hint-requested", category: "river" });
    expect(state.hints.river).toEqual({ status: "loading" });

    state = gameReducer(state, {
      type: "hint-received",
      payload: { kind: "clue", category: "river", clue: "Protiče kroz Beograd.", hintsLeft: 1 },
    });
    expect(state.hints.river).toEqual({ status: "clue", clue: "Protiče kroz Beograd." });
    expect(state.hintsLeft).toBe(1);
  });

  it("keeps a failed hint askable again, and a new round starts with a full allowance", () => {
    let state = gameReducer(initialGameState, { type: "hint-requested", category: "sea" });
    state = gameReducer(state, { type: "hint-failed", category: "sea", message: "AI down" });
    expect(state.hints.sea).toEqual({ status: "error", message: "AI down" });

    state = gameReducer({ ...state, hintsLeft: 0 }, scheduled);
    expect(state.hints).toEqual({});
    expect(state.hintsLeft).toBe(HINTS_PER_ROUND);
  });

  it("shows the judging screen while the server checks answers", () => {
    const state = gameReducer(
      { ...initialGameState, roomCode: "ABC234" },
      {
        type: "room-state",
        payload: {
          roomCode: "ABC234",
          phase: "judging",
          you: 1,
          players: [
            { slot: 1, displayName: "Ana", connected: true, clientReady: true, finished: true, bot: false },
            { slot: 2, displayName: "AI", connected: true, clientReady: true, finished: true, bot: true },
          ],
        },
      },
    );
    expect(selectScreen(state)).toBe("judging");
    expect(state.opponentIsBot).toBe(true);
  });
});

describe("the answer sheet with hints", () => {
  function render(hints: Partial<Record<Category, HintView>>, hintsLeft = 2, onHint?: () => void) {
    return renderToStaticMarkup(
      createElement(AnswerScreen, {
        letter: "S",
        remainingMs: 90_000,
        answers: blank(""),
        draftStatus: blank<DraftStatus>("empty"),
        fieldError: {},
        locked: false,
        busy: false,
        opponentFinished: false,
        opponentConnected: true,
        announcement: "",
        hintsLeft,
        hints,
        onHint: onHint ?? (() => {}),
        onChange: () => {},
        onBlur: () => {},
        onFinish: () => {},
      }),
    );
  }

  it("offers a hint under every category and shows the allowance", () => {
    const markup = render({});
    expect(markup.match(/class="link hint-button"/g)).toHaveLength(CATEGORIES.length);
    expect(markup).toContain(`${UI_SR.hintsLeft}: <strong>2</strong>`);
  });

  it("puts the clue in place of the button, and disables the rest when none are left", () => {
    const markup = render({ river: { status: "clue", clue: "Protiče kroz Beograd." } }, 0);
    expect(markup).toContain("Protiče kroz Beograd.");
    expect(markup.match(/class="link hint-button"/g)).toHaveLength(CATEGORIES.length - 1);
    expect(markup.match(/disabled="" aria-label/g)).toHaveLength(CATEGORIES.length - 1);
  });

  it("shows no hint controls when the screen is given no hint handler", () => {
    const markup = renderToStaticMarkup(
      createElement(AnswerScreen, {
        letter: "S",
        remainingMs: 90_000,
        answers: blank(""),
        draftStatus: blank<DraftStatus>("empty"),
        fieldError: {},
        locked: false,
        busy: false,
        opponentFinished: false,
        opponentConnected: true,
        announcement: "",
        onChange: () => {},
        onBlur: () => {},
        onFinish: () => {},
      }),
    );
    expect(markup).not.toContain("hint-button");
  });
});

describe("the results sheet after an AI check", () => {
  const revealed: RoundRevealed = {
    roundId: ROUND_ID,
    letter: "S",
    closedReason: "both_finished",
    player1: CATEGORIES.map((category) => ({
      category,
      raw: category === "country" ? "Srbistan" : category === "river" ? "Sava" : "",
      normalized: "",
      valid: category === "river",
      reason: category === "country" ? ("not_real" as const) : null,
      hinted: category === "river",
    })),
    player2: CATEGORIES.map((category) => ({ category, raw: "", normalized: "", valid: false, reason: null, hinted: false })),
  };
  const results = (verified: boolean, botFailed = false): RoundResults => ({
    roundId: ROUND_ID,
    scores: CATEGORIES.map((category) => ({
      category,
      player1Points: category === "river" ? 10 : 0,
      player2Points: 0,
      reason: category === "river" ? "only_player_1" : "neither",
    })),
    player1Total: 10,
    player2Total: 0,
    outcome: "player_1",
    verified,
    botFailed,
  });

  const render = (element: ReactElement) => renderToStaticMarkup(element);

  it("says why an answer did not count, marks hinted cells, and names the AI opponent", () => {
    const markup = render(
      createElement(ResultsScreen, { you: 1, revealed, results: results(true), opponentIsBot: true, onLeave: () => {} }),
    );
    expect(markup).toContain(UI_SR.rejectReasons.not_real);
    expect(markup).toContain(UI_SR.hinted);
    expect(markup).toContain(UI_SR.aiOpponent);

    // A hint on a category left blank is still shown.
    const blankHinted = {
      ...revealed,
      player1: revealed.player1.map((answer) =>
        answer.category === "sea" ? { ...answer, hinted: true } : { ...answer, hinted: false },
      ),
    };
    const blankMarkup = render(
      createElement(ResultsScreen, { you: 1, revealed: blankHinted, results: results(true), onLeave: () => {} }),
    );
    expect(blankMarkup.match(new RegExp(UI_SR.hinted, "g"))).toHaveLength(1);
    expect(markup).toContain(UI_SR.verifiedNote);
    expect(markup).not.toContain(UI_SR.unverifiedNote);
  });

  it("says so when the round was scored on the letter only, or the bot could not answer", () => {
    const markup = render(
      createElement(ResultsScreen, { you: 1, revealed, results: results(false, true), onLeave: () => {} }),
    );
    expect(markup).toContain(UI_SR.unverifiedNote);
    expect(markup).toContain(UI_SR.botFailedNote);
  });

  it("has English labels for every category", () => {
    for (const category of CATEGORIES) expect(CATEGORY_LABELS_EN[category]).toMatch(/^[A-Z]/);
  });
});

describe("the waiting screen", () => {
  const room = (bot: boolean): RoomState =>
    roomStateSchema.parse({
      roomCode: "ABC234",
      phase: bot ? "synchronizing" : "waiting_for_player",
      you: 1,
      players: [
        { slot: 1, displayName: "Ana", connected: true, clientReady: false, finished: false, bot: false },
        ...(bot ? [{ slot: 2, displayName: "AI", connected: true, clientReady: true, finished: false, bot: true }] : []),
      ],
    });

  it("offers a way out, and warns that leaving ends the code a friend was sent", () => {
    const markup = renderToStaticMarkup(createElement(WaitingScreen, { room: room(false), onLeave: () => {} }));
    expect(markup).toContain(UI_SR.leaveGame);
    expect(markup).toContain(UI_SR.leaveGameNote);
  });

  it("offers the same way out of an AI room, without a code to warn about", () => {
    const markup = renderToStaticMarkup(createElement(WaitingScreen, { room: room(true), onLeave: () => {} }));
    expect(markup).toContain(UI_SR.leaveGame);
    expect(markup).not.toContain(UI_SR.leaveGameNote);
  });
});
