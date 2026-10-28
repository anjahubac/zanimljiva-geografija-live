import { describe, expect, it } from "vitest";
import { STRINGS } from "@client/strings";

describe("closed coach copy", () => {
  it("provides Serbian and English presentation strings without embedding model prose", () => {
    expect(STRINGS.sr.review.action).toBe("Analiziraj moju rundu");
    expect(STRINGS.sr.review.recommendations).toContain("ve\u017ebu");
    expect(STRINGS.en.review.action).toBe("Analyze my round");
    expect(STRINGS.en.review.limitationChecker).toContain("wrong");
  });
});
