import { describe, expect, it } from "vitest";
import { STRINGS } from "@client/strings";

describe("closed coach copy", () => {
  it("provides Serbian and English presentation strings without embedding model prose", () => {
    expect(STRINGS.sr.coach.action).toBe("Analiziraj moju rundu");
    expect(STRINGS.sr.coach.recommendations).toContain("ve\u017ebu");
    expect(STRINGS.en.coach.action).toBe("Analyze my round");
    expect(STRINGS.en.coach.limitationChecker).toContain("wrong");
  });
});
