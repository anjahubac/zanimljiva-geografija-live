import { describe, expect, it } from "vitest";
import { applyThemeChoice, parseThemeChoice, THEME_CHOICES } from "@client/theme";

/** Enough of an element for the two attribute calls the module makes. */
function fakeRoot() {
  const attributes = new Map<string, string>();
  return {
    attributes,
    setAttribute: (name: string, value: string) => void attributes.set(name, value),
    removeAttribute: (name: string) => void attributes.delete(name),
  } as unknown as HTMLElement & { attributes: Map<string, string> };
}

describe("the theme choice", () => {
  it("accepts the three known choices", () => {
    for (const choice of THEME_CHOICES) expect(parseThemeChoice(choice)).toBe(choice);
  });

  it("falls back to the system setting for anything else", () => {
    // Absent, from an older build, or corrupted storage — all mean "system".
    for (const raw of [null, undefined, "", "Dark", "sepia", 2, {}, []]) {
      expect(parseThemeChoice(raw)).toBe("system");
    }
  });

  it("leaves the attribute off for the system setting, so the media query decides", () => {
    const root = fakeRoot();
    root.setAttribute("data-theme", "dark");

    applyThemeChoice("system", root);
    expect(root.attributes.has("data-theme")).toBe(false);
  });

  it("writes an explicit choice, and replaces the opposite one", () => {
    const root = fakeRoot();

    applyThemeChoice("dark", root);
    expect(root.attributes.get("data-theme")).toBe("dark");

    // Light must be written, not merely removed: on a system set to dark it is
    // the attribute itself that overrides the media query.
    applyThemeChoice("light", root);
    expect(root.attributes.get("data-theme")).toBe("light");
  });
});
