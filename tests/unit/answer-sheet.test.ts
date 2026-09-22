import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CATEGORIES, CATEGORY_LABELS_SR } from "@contracts/game.schemas";
import type { Category } from "@contracts/game.schemas";
import { AnswerScreen } from "@client/screens/AnswerScreen";
import type { DraftStatus } from "@client/state/useGameState";

const blank = <T,>(value: T): Record<Category, T> =>
  Object.fromEntries(CATEGORIES.map((category) => [category, value])) as Record<Category, T>;

function render(overrides: { answers?: Record<Category, string>; opponentFinished?: boolean } = {}) {
  return renderToStaticMarkup(
    createElement(AnswerScreen, {
      letter: "S",
      remainingMs: 90_000,
      answers: overrides.answers ?? blank(""),
      draftStatus: blank<DraftStatus>("empty"),
      fieldError: {},
      locked: false,
      busy: false,
      opponentFinished: overrides.opponentFinished ?? false,
      announcement: "",
      onChange: () => {},
      onBlur: () => {},
      onFinish: () => {},
    }),
  );
}

const bodyRows = (markup: string): string[] => {
  const body = markup.slice(markup.indexOf("<tbody>"), markup.indexOf("</tbody>"));
  return body.split("<tr").slice(1);
};

describe("the answer sheet is a ruled paper page", () => {
  it("rules one header line and five body lines, only the first of them writable", () => {
    const markup = render();
    const rows = bodyRows(markup);

    expect(rows).toHaveLength(5);
    expect(rows[0]).toContain("<input");
    for (const blankRow of rows.slice(1)) {
      expect(blankRow).not.toContain("<input");
      expect(blankRow).toContain('aria-hidden="true"');
    }
  });

  it("starts at the first category and states the letter above the sheet", () => {
    const markup = render();
    const head = markup.slice(markup.indexOf("<thead>"), markup.indexOf("</thead>"));

    // No letter column and no total column while the round is running: the
    // letter belongs in the header, and points do not exist before the reveal.
    expect(head).toContain(CATEGORY_LABELS_SR[CATEGORIES[0]!]);
    expect(head.indexOf(CATEGORY_LABELS_SR[CATEGORIES[0]!])).toBeLessThan(
      head.indexOf(CATEGORY_LABELS_SR[CATEGORIES[1]!]),
    );
    expect(head).not.toContain("col-total");
    expect(head).not.toContain("col-row-head");

    expect(markup.slice(0, markup.indexOf("<table"))).toContain("<strong>S</strong>");
  });

  it("shows no points anywhere while the round is running", () => {
    const markup = render({ answers: { ...blank(""), country: "Srbija" } as Record<Category, string> });
    expect(markup).not.toContain("cell-total");
    expect(markup).not.toContain("cell-points");
  });

  it("gives every category one labelled field, in sheet order", () => {
    const markup = render();
    for (const category of CATEGORIES) {
      expect(markup).toContain(`id="answer-${category}"`);
      expect(markup).toContain(CATEGORY_LABELS_SR[category]);
    }
    const positions = CATEGORIES.map((category) => markup.indexOf(`id="answer-${category}"`));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("reports the opponent beside the sheet and never as a line on it", () => {
    const waiting = render();
    expect(waiting).toContain("opponent-note");
    expect(bodyRows(waiting)).toHaveLength(5);

    const finished = render({ opponentFinished: true });
    expect(finished).toContain("Protivnik je završio.");
    expect(bodyRows(finished)).toHaveLength(5);
  });

  it("keeps the player's own text out of the blank lines", () => {
    const answers = { ...blank(""), country: "Srbija" } as Record<Category, string>;
    const rows = bodyRows(render({ answers }));

    expect(rows[0]).toContain("Srbija");
    for (const blankRow of rows.slice(1)) {
      expect(blankRow).not.toContain("Srbija");
    }
  });
});
