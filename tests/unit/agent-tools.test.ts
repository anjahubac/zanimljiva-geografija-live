import { describe, expect, it } from "vitest";
import { RUN_LIMITS } from "@server/agent/limits";
import {
  TOOLS,
  checkCandidates,
  isToolName,
  type CandidateResult,
  type EvidenceItem,
  type RoundSnapshot,
  type ToolScope,
} from "@server/agent/tools";

/*
 * `check_candidates` (contracts/tools.md), evals C5 and C6 at tool level.
 * The fixed round of docs/AGENT_EVALS.md: letter Lj, Serbian alphabet; the
 * player left river blank, wrote "Lav" for animal (wrong letter) and
 * "Ljubljana" for country (rejected by the referee as the wrong category).
 */

function snapshot(overrides: Partial<RoundSnapshot> = {}): RoundSnapshot {
  return deepFreeze({
    letter: "Lj",
    alphabet: "sr",
    focus: [
      { category: "river", yourAnswer: "", whyMissed: "empty" },
      { category: "animal", yourAnswer: "Lav", whyMissed: "wrong_letter" },
      { category: "country", yourAnswer: "Ljubljana", whyMissed: "wrong_category" },
    ],
    ...overrides,
  } as RoundSnapshot);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

const scope = (evidence: EvidenceItem[] = [], toolCallsUsed = 0, round = snapshot()): ToolScope => ({
  snapshot: round,
  evidence,
  toolCallsUsed,
});

const clock = () => ({ now: () => 1_000 });
const propose = (...candidates: Array<[string, string]>) => ({
  candidates: candidates.map(([category, term]) => ({ category, term })),
});

function passed(result: ReturnType<typeof checkCandidates>): CandidateResult {
  if (!result.ok) throw new Error(`expected the tool to run, got ${result.reason}`);
  return result.result;
}

describe("the allowlist", () => {
  it("holds check_candidates and nothing that writes", () => {
    expect(Object.keys(TOOLS)).toEqual(["check_candidates"]);
    expect(isToolName("check_candidates")).toBe(true);
    for (const name of ["delete_room", "final", "set_score", "toString", "__proto__", "constructor"]) {
      expect(isToolName(name)).toBe(false);
    }
  });

  it("freezes the run limits of Plan.md §2C.8", () => {
    expect(Object.isFrozen(RUN_LIMITS)).toBe(true);
    expect(RUN_LIMITS).toMatchObject({
      maxModelSteps: 3,
      maxToolCalls: 2,
      maxAttemptsPerStep: 2,
      maxAttemptsPerRun: 5,
      perAttemptMs: 6_000,
      perStepMs: 10_000,
      runDeadlineMs: 25_000,
      minStepMs: 2_000,
      maxCandidatesPerCall: 8,
      maxCandidatesPerCategory: 2,
      toolTimeMs: 100,
      maxToolResultBytes: 2_048,
    });
  });
});

describe("check_candidates — the game's own letter rule", () => {
  it("passes Ljubljanica and fails Lisica for Lj, with ids and the call id", () => {
    const result = passed(checkCandidates(propose(["river", "Ljubljanica"], ["animal", "Lisica"]), scope(), clock()));
    expect(result).toEqual({
      callId: "t1",
      items: [
        { id: "c1", category: "river", term: "Ljubljanica", passes: true, failure: null },
        { id: "c2", category: "animal", term: "Lisica", passes: false, failure: "wrong_letter" },
      ],
    });
  });

  it("reports a one-letter word as too_short", () => {
    const result = passed(checkCandidates(propose(["river", "Lj"]), scope(), clock()));
    // "Lj" is two characters, the minimum; a single "L" is too short before it is the wrong letter.
    expect(result.items[0]).toMatchObject({ passes: true });
    const short = passed(checkCandidates(propose(["river", "L"]), scope(), clock()));
    expect(short.items[0]).toMatchObject({ passes: false, failure: "too_short" });
  });

  it("reports the player's own non-counting answer, folded, as same_as_yours", () => {
    const result = passed(checkCandidates(propose(["country", " ljubljana "]), scope(), clock()));
    expect(result.items[0]).toMatchObject({ term: "ljubljana", passes: false, failure: "same_as_yours" });
  });

  it("orders failures too_short, then wrong_letter, then same_as_yours", () => {
    // "lav" is the player's own animal answer, but the letter failure is reported first.
    const result = passed(checkCandidates(propose(["animal", "lav"], ["animal", "x"]), scope(), clock()));
    expect(result.items.map((item) => item.failure)).toEqual(["wrong_letter", "too_short"]);
  });

  it("follows the room's alphabet: in an English room Ljubljana passes for L", () => {
    const round = snapshot({ letter: "L", alphabet: "en" });
    const result = passed(checkCandidates(propose(["river", "Ljubljanica"]), scope([], 0, round), clock()));
    expect(result.items[0]).toMatchObject({ passes: true, failure: null });
    const serbian = snapshot({ letter: "L", alphabet: "sr" });
    const refused = passed(checkCandidates(propose(["river", "Ljubljanica"]), scope([], 0, serbian), clock()));
    expect(refused.items[0]).toMatchObject({ passes: false, failure: "wrong_letter" });
  });

  it("numbers ids c1, c2, … across two calls, and the second call is t2", () => {
    const first = passed(checkCandidates(propose(["river", "Ljubljanica"], ["animal", "Lisica"]), scope(), clock()));
    const evidence = first.items.map((item) => ({ ...item, callId: first.callId }));
    const second = passed(checkCandidates(propose(["animal", "Ljuskavac"]), scope(evidence, 1), clock()));
    expect(second.callId).toBe("t2");
    expect(second.items[0]).toMatchObject({ id: "c3", term: "Ljuskavac", passes: true });
  });

  it("changes nothing: the snapshot and the evidence are the same after every call", () => {
    const round = snapshot();
    const before = JSON.stringify(round);
    const evidence: EvidenceItem[] = [];
    checkCandidates(propose(["river", "Ljubljanica"]), scope(evidence, 0, round), clock());
    checkCandidates(propose(["river", "x".repeat(41)]), scope(evidence, 0, round), clock());
    expect(JSON.stringify(round)).toBe(before);
    expect(evidence).toEqual([]);
  });
});

describe("check_candidates — arguments (C5): refused before the tool runs", () => {
  const nine = Array.from({ length: 9 }, (_, n): [string, string] => [
    ["river", "animal", "country"][n % 3]!,
    `Lj${"a".repeat(n + 1)}`,
  ]);

  const invalid: Array<[string, unknown]> = [
    ["no candidates", propose()],
    ["nine candidates", propose(...nine)],
    ["three for one category", propose(["river", "Ljuta"], ["river", "Ljubljanica"], ["river", "Ljig"])],
    ["a 41-character term", propose(["river", `Lj${"a".repeat(39)}`])],
    ["a blank term", propose(["river", "   "])],
    ["a control character", propose(["river", "Lju\u0007ta"])],
    ["a category outside focus", propose(["city", "Ljubljana"])],
    ["an unknown category", propose(["lake", "Ljubljansko"])],
    ["a smuggled extra field", { candidates: [{ category: "river", term: "Ljuta", passes: true }] }],
    ["the same candidate twice in one call", propose(["river", "Ljuta"], ["river", "ljuta"])],
    ["not an object", "check everything"],
  ];

  it.each(invalid)("%s → invalid_tool_args", (_name, proposal) => {
    let ran = false;
    const result = checkCandidates(proposal, scope(), {
      ...clock(),
      impl: () => {
        ran = true;
        return { callId: "t1", items: [] };
      },
    });
    expect(result).toEqual({ ok: false, reason: "invalid_tool_args" });
    expect(ran).toBe(false);
  });

  it("refuses a category that already has a passing candidate", () => {
    const evidence: EvidenceItem[] = [
      { id: "c1", callId: "t1", category: "river", term: "Ljubljanica", passes: true, failure: null },
    ];
    expect(checkCandidates(propose(["river", "Ljuta"]), scope(evidence, 1), clock())).toEqual({
      ok: false,
      reason: "invalid_tool_args",
    });
  });

  it("refuses a call when no tool call is left", () => {
    expect(checkCandidates(propose(["river", "Ljuta"]), scope([], 2), clock())).toEqual({
      ok: false,
      reason: "invalid_tool_args",
    });
  });

  it("refuses a (category, folded term) already checked in this run as repeated_call", () => {
    const evidence: EvidenceItem[] = [
      { id: "c1", callId: "t1", category: "animal", term: "Lisica", passes: false, failure: "wrong_letter" },
    ];
    let ran = false;
    const impl = () => {
      ran = true;
      return { callId: "t2", items: [] };
    };
    expect(checkCandidates(propose(["animal", " LISICA "]), scope(evidence, 1), { ...clock(), impl })).toEqual({
      ok: false,
      reason: "repeated_call",
    });
    expect(ran).toBe(false);
    // The same word in another category is a different candidate.
    expect(checkCandidates(propose(["river", "Lisica"]), scope(evidence, 1), clock()).ok).toBe(true);
  });
});

describe("check_candidates — results (C6): a bad tool result stops the run", () => {
  const ok = propose(["river", "Ljubljanica"]);

  it("a throwing tool → tool_failed", () => {
    const impl = () => {
      throw new Error("boom");
    };
    expect(checkCandidates(ok, scope(), { ...clock(), impl })).toEqual({ ok: false, reason: "tool_failed" });
  });

  it("a result of the wrong shape → tool_failed", () => {
    const shapes: unknown[] = [
      null,
      { callId: "t1" },
      { callId: "t1", items: [{ id: "c1", category: "river", term: "Ljubljanica", passes: "yes", failure: null }] },
      // failure must be null exactly when the item passes
      { callId: "t1", items: [{ id: "c1", category: "river", term: "Ljubljanica", passes: true, failure: "too_short" }] },
      // one item per candidate, in order
      { callId: "t1", items: [] },
      { callId: "t1", items: [{ id: "c1", category: "animal", term: "Ljubljanica", passes: true, failure: null }] },
      { callId: "t9", items: [{ id: "c1", category: "river", term: "Ljubljanica", passes: true, failure: null }] },
      { callId: "t1", items: [{ id: "c1", category: "river", term: "Ljubljanica", passes: true, failure: null, extra: 1 }] },
    ];
    for (const shape of shapes) {
      expect(checkCandidates(ok, scope(), { ...clock(), impl: () => shape as CandidateResult })).toEqual({
        ok: false,
        reason: "tool_failed",
      });
    }
  });

  it("a result over 2 KB → tool_failed", () => {
    const six = propose(
      ["river", "Ljubljanica"],
      ["river", "Ljuta"],
      ["animal", "Ljuskavac"],
      ["animal", "Ljiljan"],
      ["country", "Ljubovija"],
      ["country", "Ljig"],
    );
    const impl = (): CandidateResult => ({
      callId: "t1",
      items: six.candidates.map((candidate, n) => ({
        id: `c${n + 1}`,
        category: candidate.category as "river",
        term: candidate.term,
        passes: false,
        failure: "wrong_letter" as const,
        padding: "x".repeat(400),
      })),
    });
    expect(checkCandidates(six, scope(), { ...clock(), impl })).toEqual({ ok: false, reason: "tool_failed" });
  });

  it("a tool that takes over 100 ms → tool_failed, even with a good result", () => {
    let now = 1_000;
    const result = checkCandidates(ok, scope(), {
      now: () => now,
      impl: () => {
        now += 101;
        return { callId: "t1", items: [{ id: "c1", category: "river", term: "Ljubljanica", passes: true, failure: null }] };
      },
    });
    expect(result).toEqual({ ok: false, reason: "tool_failed" });
  });
});
