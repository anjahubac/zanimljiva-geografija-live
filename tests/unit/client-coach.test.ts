import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CATEGORIES, CATEGORY_LABELS_EN, CATEGORY_LABELS_SR, REJECT_REASONS, type Category, type Language } from "@contracts/game.schemas";
import { COACH_STOP_REASONS, type CoachReport } from "@contracts/coach.schemas";
import type { RoundResults, RoundRevealed } from "@contracts/socket.schemas";
import { I18nContext } from "@client/i18n";
import { CoachPanelView, type CoachPanelState } from "@client/screens/CoachPanel";
import { ResultsScreen } from "@client/screens/ResultsScreen";
import { COACH_ACK_TIMEOUT_MS, parseCoachAck } from "@client/socket/game-socket";
import { RUN_LIMITS } from "@server/agent/limits";
import { UI_EN, UI_SR } from "@client/strings";

/*
 * The coach panel on the results sheet (W5-9, T045): statuses, the report,
 * both languages, and no internal code ever on screen.
 */

const ROUND_ID = "11111111-2222-4333-8444-555555555555";

const render = (element: ReactElement, language: Language = "sr") =>
  renderToStaticMarkup(
    createElement(
      I18nContext.Provider,
      {
        value: {
          language,
          setLanguage: () => {},
          t: language === "sr" ? UI_SR : UI_EN,
          labels: language === "sr" ? CATEGORY_LABELS_SR : CATEGORY_LABELS_EN,
        },
      },
      element,
    ),
  );

const FOCUS: Category[] = ["country", "river", "animal"];

const completed: CoachReport = {
  status: "completed",
  tips: [
    { category: "country", yourAnswer: "Ljubljana", whyMissed: "wrong_category", suggestion: null, checkedBy: null },
    { category: "river", yourAnswer: "", whyMissed: "empty", suggestion: "Ljubljanica", checkedBy: "letter_rule_and_referee" },
    { category: "animal", yourAnswer: "Lav", whyMissed: "wrong_letter", suggestion: "Ljuskavac", checkedBy: "letter_rule_and_referee" },
  ],
  confidence: "medium",
  stopReason: "goal_completed",
};
const incomplete: CoachReport = { ...completed, status: "incomplete", confidence: null, stopReason: "repeated_call" };
const failed: CoachReport = {
  ...incomplete,
  status: "failed",
  stopReason: "unknown_tool",
  tips: completed.tips.map((tip) => ({ ...tip, suggestion: null, checkedBy: null })),
};

const view = (state: CoachPanelState, selected: Category[] = FOCUS) =>
  createElement(CoachPanelView, { focus: FOCUS, selected, state, onToggle: () => {}, onSubmit: () => {} });

/** No internal code may reach the screen: stop reasons, miss reasons, statuses. */
function expectNoCodes(markup: string) {
  const text = markup.replace(/<[^>]*>/g, " ");
  for (const code of [...COACH_STOP_REASONS, ...REJECT_REASONS, "letter_rule", "fill_gaps", "incomplete"]) {
    expect(text).not.toContain(code);
  }
}

describe("the coach panel — choosing", () => {
  it("lists the focus categories as labelled checkboxes, all ticked, and an ask button", () => {
    const markup = render(view({ status: "idle" }));
    expect(markup).toContain(UI_SR.coach.title);
    for (const category of FOCUS) expect(markup).toContain(CATEGORY_LABELS_SR[category]);
    expect(markup.match(/type="checkbox"/g)).toHaveLength(3);
    expect(markup.match(/checked=""/g)).toHaveLength(3);
    expect(markup.match(/<label/g)!.length).toBeGreaterThanOrEqual(3);
    expect(markup).toContain(UI_SR.coach.ask);
  });

  it("disables asking when nothing is ticked", () => {
    const markup = render(view({ status: "idle" }, []));
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Analiziraj/);
  });
});

describe("the coach panel — statuses", () => {
  it("announces the running status in a polite live region", () => {
    const markup = render(view({ status: "pending" }));
    expect(markup).toMatch(new RegExp(`aria-live="polite"[^>]*>[^<]*${UI_SR.coach.running}`));
    expect(markup).toMatch(/<button[^>]*disabled=""/);
  });

  it("shows a completed report: the game's own summary, each answer, why it missed, the suggestion and how it was checked", () => {
    const markup = render(view({ status: "report", report: completed }));
    expect(markup).toContain(UI_SR.coach.completed);
    // Written by the game from the checked list, never by the model (owner, 2026-10-07).
    expect(markup).toContain(UI_SR.coach.summary.replace("{n}", "2").replace("{total}", "3"));
    expect(markup).toContain("Ljubljana");
    expect(markup).toContain(UI_SR.rejectReasons.wrong_category);
    expect(markup).toContain(UI_SR.rejectReasons.wrong_letter);
    expect(markup).toContain(UI_SR.coach.empty);
    expect(markup).toContain("Ljubljanica");
    expect(markup).toContain("Ljuskavac");
    expect(markup).toContain(UI_SR.coach.checkedBy.letter_rule_and_referee);
    expect(markup).toContain(UI_SR.coach.noSuggestion);
    expect(UI_SR.coach.noSuggestion).toBe("Nema proverenog predloga.");
    expectNoCodes(markup);
  });

  it("shows a partial report without a summary, with the stop sentence", () => {
    const markup = render(view({ status: "report", report: incomplete }));
    expect(markup).toContain(UI_SR.coach.incomplete);
    expect(markup).toContain(UI_SR.coach.stopReasons.repeated_call);
    expect(markup).toContain("Ljubljanica");
    expectNoCodes(markup);
  });

  it("shows only 'could not complete safely' for a failed report and for a timeout", () => {
    for (const state of [{ status: "report", report: failed }, { status: "timeout" }] as CoachPanelState[]) {
      const markup = render(view(state));
      expect(markup).toContain(UI_SR.coach.failed);
      expect(markup).not.toContain(UI_SR.coach.suggestion);
      expect(markup).not.toContain(UI_SR.coach.stopReasons.unknown_tool);
      expectNoCodes(markup);
    }
  });

  it("shows a refusal's message next to the button", () => {
    const markup = render(view({ status: "error", message: UI_SR.errors.RATE_LIMITED }));
    expect(markup).toContain(UI_SR.errors.RATE_LIMITED);
  });

  it("turns every stop reason into a sentence and never prints the code", () => {
    for (const stopReason of COACH_STOP_REASONS) {
      if (stopReason === "goal_completed") continue;
      for (const language of ["sr", "en"] as const) {
        const markup = render(view({ status: "report", report: { ...incomplete, stopReason } }), language);
        // React escapes an apostrophe ("Today's") in markup.
        const sentence = (language === "sr" ? UI_SR : UI_EN).coach.stopReasons[stopReason].replace(/'/g, "&#x27;");
        expect(markup).toContain(sentence);
        expectNoCodes(markup);
      }
    }
  });

  it("speaks English on the English interface", () => {
    const markup = render(view({ status: "report", report: completed }), "en");
    expect(markup).toContain(UI_EN.coach.title);
    expect(markup).toContain(UI_EN.coach.completed);
    expect(markup).toContain(UI_EN.coach.checkedBy.letter_rule_and_referee);
    expect(markup).toContain(UI_EN.coach.summary.replace("{n}", "2").replace("{total}", "3"));
    expect(markup).toContain(CATEGORY_LABELS_EN.river);
  });
});

describe("the coach panel on the results sheet", () => {
  const answers = (invalid: Category[]) =>
    CATEGORIES.map((category) => ({
      category,
      raw: invalid.includes(category) ? "" : "Ljubljana",
      normalized: "",
      valid: !invalid.includes(category),
      reason: null,
      hinted: false,
    }));
  const revealed = (invalid: Category[]): RoundRevealed => ({
    roundId: ROUND_ID,
    letter: "Lj",
    closedReason: "both_finished",
    player1: answers(invalid),
    player2: answers([]),
  });
  const results: RoundResults = {
    roundId: ROUND_ID,
    scores: CATEGORIES.map((category) => ({ category, player1Points: 10, player2Points: 10, reason: "both_different" })),
    player1Total: 80,
    player2Total: 80,
    outcome: "draw",
    verified: true,
    botFailed: false,
  };
  const onCoach = async () => ({ kind: "timeout" as const });

  it("offers only the caller's 0-point categories, all ticked", () => {
    const markup = render(createElement(ResultsScreen, { you: 1, revealed: revealed(["sea", "thing"]), results, onLeave: () => {}, onCoach }));
    expect(markup).toContain(UI_SR.coach.title);
    expect(markup.match(/type="checkbox"/g)).toHaveLength(2);
    expect(markup).toContain(`value="sea"`);
    expect(markup).toContain(`value="thing"`);
  });

  it("is absent when the caller scored in every category", () => {
    const markup = render(createElement(ResultsScreen, { you: 1, revealed: revealed([]), results, onLeave: () => {}, onCoach }));
    expect(markup).not.toContain(UI_SR.coach.title);
  });
});

describe("the coach request's ack", () => {
  // Amended 2026-10-07: the repair step can add 10 s to the run's 25 s.
  it("waits 45 s, 10 s beyond the run's 35 s with the repair step (FR-023)", () => {
    expect(COACH_ACK_TIMEOUT_MS).toBe(45_000);
    expect(COACH_ACK_TIMEOUT_MS).toBeGreaterThan(RUN_LIMITS.runDeadlineMs + RUN_LIMITS.repairExtraMs);
  });

  it("turns no answer in time into null, a malformed ack into INTERNAL, and parses a good one", () => {
    expect(parseCoachAck(new Error("operation has timed out"), undefined)).toBeNull();
    expect(parseCoachAck(null, { ok: true, data: { status: "done" } })).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    expect(parseCoachAck(null, { ok: true, data: completed })).toEqual({ ok: true, data: completed });
    expect(parseCoachAck(null, { ok: false, error: { code: "RATE_LIMITED", message: "x" } })).toMatchObject({ ok: false });
  });
});

describe("C18 — run details in the panel (O6)", () => {
  const run = {
    modelSteps: 3,
    toolCalls: 2,
    providerAttempts: 4,
    provider: "groq" as const,
    model: "openai/gpt-oss-120b",
    elapsedMs: 5_400,
    stopReason: "goal_completed" as const,
  };

  it("shows 'Details' collapsed, with the counts, provider and model, time and the stop sentence", () => {
    const markup = render(view({ status: "report", report: { ...completed, run } }));
    expect(markup).toMatch(/<details class="coach-details">/);
    expect(markup).not.toMatch(/<details[^>]*open/);
    expect(markup).toContain(`<summary>${UI_SR.coach.details.title}</summary>`);
    for (const value of ["3", "2", "4", "Groq", "openai/gpt-oss-120b", "5.4", UI_SR.coach.stopReasons.goal_completed]) {
      expect(markup).toContain(value);
    }
    expectNoCodes(markup);
    const english = render(view({ status: "report", report: { ...completed, run } }), "en");
    expect(english).toContain(`<summary>${UI_EN.coach.details.title}</summary>`);
  });

  it("is absent from a failed report", () => {
    const markup = render(view({ status: "report", report: { ...failed, run: { ...run, stopReason: "unknown_tool" } } }));
    expect(markup).not.toContain(UI_SR.coach.details.title);
  });
});
