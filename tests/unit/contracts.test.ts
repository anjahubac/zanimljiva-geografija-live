import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import {
  CATEGORIES,
  CATEGORY_LABELS_SR,
  ALL_LETTERS,
  ALPHABETS,
  ENGLISH_LETTERS,
  SERBIAN_LETTERS,
  REJECT_REASONS,
  answerValueSchema,
  categorySchema,
  displayNameSchema,
  letterSchema,
  revisionSchema,
  roomCodeSchema,
  roundIdSchema,
} from "@contracts/game.schemas";
import {
  ERROR_MESSAGES,
  GAME_ERROR_CODES,
  ackSchema,
  fail,
  gameErrorSchema,
  ok,
} from "@contracts/errors";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  clientReadyRequestSchema,
  createRoomRequestSchema,
  draftAckSchema,
  draftRequestSchema,
  finishRequestSchema,
  hintAckSchema,
  hintRequestSchema,
  joinRoomRequestSchema,
  playAiRequestSchema,
  quickPlayRequestSchema,
  roomAckSchema,
  roomStateSchema,
  roundResultsSchema,
  roundRevealedSchema,
  roundScheduledSchema,
} from "@contracts/socket.schemas";
import { COACH_STEP_JSON_SCHEMA, coachStepSchema } from "@contracts/ai-output.schemas";
import {
  COACH_GOALS,
  coachReportSchema,
  coachRequestSchema,
  coachStopReasonSchema,
  missReasonSchema,
  runDetailsSchema,
} from "@contracts/coach.schemas";

const ROUND_ID = randomUUID();
const ROOM_CODE = "ABC234";
const RESUME_TOKEN = "t".repeat(43);

const validAnswers = CATEGORIES.map((category) => ({
  category,
  raw: "Srbija",
  normalized: "srbija",
  valid: true,
  reason: null,
  hinted: false,
}));

const validScores = CATEGORIES.map((category) => ({
  category,
  player1Points: 10 as const,
  player2Points: 10 as const,
  reason: "both_different" as const,
}));

/* -------------------------------------------------------- primitive bounds */

describe("primitive schemas", () => {
  it("accepts the eight locked categories and rejects anything else", () => {
    expect(CATEGORIES).toHaveLength(8);
    for (const category of CATEGORIES) expect(categorySchema.parse(category)).toBe(category);
    expect(categorySchema.safeParse("capital").success).toBe(false);
    // Removed from the set on 2026-09-23; it must not parse from an old payload.
    expect(categorySchema.safeParse("lake").success).toBe(false);
  });

  it("has a 30-letter Serbian and a 26-letter English alphabet (Plan.md §2B.13)", () => {
    expect(SERBIAN_LETTERS).toHaveLength(30);
    expect(ENGLISH_LETTERS).toHaveLength(26);
    expect(new Set(SERBIAN_LETTERS).size).toBe(30);
    expect(new Set(ENGLISH_LETTERS).size).toBe(26);
    expect(ALPHABETS.sr).toBe(SERBIAN_LETTERS);
    expect(ALPHABETS.en).toBe(ENGLISH_LETTERS);
    // The schema's set is exactly the union of the two.
    expect([...ALL_LETTERS].sort()).toEqual([...new Set([...SERBIAN_LETTERS, ...ENGLISH_LETTERS])].sort());
  });

  it("accepts every letter of either alphabet and rejects others", () => {
    for (const letter of ALL_LETTERS) expect(letterSchema.parse(letter)).toBe(letter);
    for (const letter of ["Lj", "Dž", "Q", "Š"]) expect(letterSchema.safeParse(letter).success).toBe(true);
    for (const letter of ["LJ", "lj", "s", "1", "", "Ö"]) expect(letterSchema.safeParse(letter).success).toBe(false);
  });

  it("has a Serbian label for every category", () => {
    for (const category of CATEGORIES) {
      expect(CATEGORY_LABELS_SR[category].length).toBeGreaterThan(0);
    }
  });

  it("bounds the room code to six characters from the unambiguous alphabet", () => {
    expect(roomCodeSchema.parse(ROOM_CODE)).toBe(ROOM_CODE);
    expect(roomCodeSchema.safeParse("ABC23").success).toBe(false); // too short
    expect(roomCodeSchema.safeParse("ABC2345").success).toBe(false); // too long
    expect(roomCodeSchema.safeParse("ABC23I").success).toBe(false); // I is excluded
    expect(roomCodeSchema.safeParse("abc234").success).toBe(false); // lowercase
  });

  it("trims a display name and bounds it to 1-24 characters", () => {
    expect(displayNameSchema.parse("  Ana  ")).toBe("Ana");
    expect(displayNameSchema.safeParse("   ").success).toBe(false);
    expect(displayNameSchema.safeParse("x".repeat(25)).success).toBe(false);
  });

  it("bounds an answer to 40 characters but allows an empty one", () => {
    expect(answerValueSchema.parse("")).toBe("");
    expect(answerValueSchema.parse("x".repeat(40))).toHaveLength(40);
    expect(answerValueSchema.safeParse("x".repeat(41)).success).toBe(false);
  });

  it("requires a uuid round id and a non-negative integer revision", () => {
    expect(roundIdSchema.parse(ROUND_ID)).toBe(ROUND_ID);
    expect(roundIdSchema.safeParse("round-1").success).toBe(false);
    expect(revisionSchema.safeParse(-1).success).toBe(false);
    expect(revisionSchema.safeParse(1.5).success).toBe(false);
  });
});

/* --------------------------------------------- valid / malformed / extra key */

type Case = { name: string; schema: z.ZodTypeAny; valid: unknown; malformed: unknown };

const cases: Case[] = [
  {
    name: "createRoomRequest",
    schema: createRoomRequestSchema,
    valid: { displayName: "Ana", language: "sr" },
    malformed: { displayName: "", language: "sr" },
  },
  {
    name: "joinRoomRequest",
    schema: joinRoomRequestSchema,
    valid: { roomCode: ROOM_CODE, displayName: "Marko" },
    malformed: { roomCode: "nope", displayName: "Marko" },
  },
  {
    name: "clientReadyRequest",
    schema: clientReadyRequestSchema,
    valid: { roomCode: ROOM_CODE },
    malformed: {},
  },
  {
    name: "draftRequest",
    schema: draftRequestSchema,
    valid: { roundId: ROUND_ID, category: "city", value: "Subotica", revision: 3 },
    malformed: { roundId: ROUND_ID, category: "capital", value: "Subotica", revision: 3 },
  },
  {
    name: "finishRequest",
    schema: finishRequestSchema,
    valid: { roundId: ROUND_ID },
    malformed: { roundId: 42 },
  },
  {
    name: "roomAck",
    schema: roomAckSchema,
    valid: { roomCode: ROOM_CODE, you: 1, resumeToken: RESUME_TOKEN },
    malformed: { roomCode: ROOM_CODE, you: 3, resumeToken: RESUME_TOKEN },
  },
  {
    name: "draftAck",
    schema: draftAckSchema,
    valid: { category: "river", acceptedRevision: 7 },
    malformed: { category: "river", acceptedRevision: "7" },
  },
  {
    name: "roomState",
    schema: roomStateSchema,
    valid: {
      roomCode: ROOM_CODE,
      phase: "answering",
      you: 2,
      players: [
        { slot: 1, displayName: "Ana", connected: true, clientReady: true, finished: false, bot: false },
        { slot: 2, displayName: "AI", connected: true, clientReady: true, finished: false, bot: true },
      ],
    },
    malformed: { roomCode: ROOM_CODE, phase: "revealed", you: 1, players: [] },
  },
  {
    name: "roundScheduled",
    schema: roundScheduledSchema,
    valid: {
      roundId: ROUND_ID,
      letter: "S",
      categories: [...CATEGORIES],
      serverNow: 1_700_000_000_000,
      startsAt: 1_700_000_003_000,
      endsAt: 1_700_000_093_000,
    },
    malformed: {
      roundId: ROUND_ID,
      letter: "S",
      categories: ["city"],
      serverNow: 1_700_000_000_000,
      startsAt: 1_700_000_003_000,
      endsAt: 1_700_000_093_000,
    },
  },
  {
    name: "roundRevealed",
    schema: roundRevealedSchema,
    valid: {
      roundId: ROUND_ID,
      letter: "S",
      closedReason: "deadline",
      player1: validAnswers,
      player2: validAnswers,
    },
    malformed: {
      roundId: ROUND_ID,
      letter: "S",
      closedReason: "gave_up",
      player1: validAnswers,
      player2: validAnswers,
    },
  },
  {
    name: "roundResults",
    schema: roundResultsSchema,
    valid: {
      roundId: ROUND_ID,
      scores: validScores,
      player1Total: 60,
      player2Total: 60,
      outcome: "draw",
      verified: true,
      botFailed: false,
    },
    malformed: {
      roundId: ROUND_ID,
      scores: validScores.map((s) => ({ ...s, player1Points: 7 })),
      player1Total: 42,
      player2Total: 60,
      outcome: "draw",
      verified: true,
      botFailed: false,
    },
  },
  {
    name: "playAiRequest",
    schema: playAiRequestSchema,
    valid: { displayName: "Ana", language: "en" },
    // The bot's name is reserved: a human cannot pose as the AI opponent.
    malformed: { displayName: " ai ", language: "en" },
  },
  {
    name: "hintRequest",
    schema: hintRequestSchema,
    valid: { roundId: ROUND_ID, category: "river", language: "en" },
    malformed: { roundId: ROUND_ID, category: "river", language: "de" },
  },
  {
    name: "hintAck",
    schema: hintAckSchema,
    valid: { kind: "clue", category: "river", clue: "Druga najduža reka Evrope.", hintsLeft: 1 },
    malformed: { kind: "clue", category: "river", clue: "Druga najduža reka Evrope.", hintsLeft: 3 },
  },
];

describe.each(cases)("$name", ({ schema, valid, malformed }) => {
  it("accepts a valid payload", () => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  it("rejects a malformed payload", () => {
    expect(schema.safeParse(malformed).success).toBe(false);
  });

  it("rejects an unexpected extra key", () => {
    const smuggled = { ...(valid as object), score: 999 };
    expect(schema.safeParse(smuggled).success).toBe(false);
  });
});

/* ------------------------------------------------- authority-field smuggling */

describe("the opener's language picks the room's alphabet (Plan.md §2B.13)", () => {
  const opening = [
    ["createRoomRequest", createRoomRequestSchema],
    ["quickPlayRequest", quickPlayRequestSchema],
    ["playAiRequest", playAiRequestSchema],
  ] as const;

  it.each(opening)("%s requires sr or en", (_name, schema) => {
    expect(schema.safeParse({ displayName: "Ana", language: "sr" }).success).toBe(true);
    expect(schema.safeParse({ displayName: "Ana", language: "en" }).success).toBe(true);
    expect(schema.safeParse({ displayName: "Ana" }).success).toBe(false);
    for (const language of ["de", "SR", "", null, 1]) {
      expect(schema.safeParse({ displayName: "Ana", language }).success).toBe(false);
    }
  });

  it.each(opening)("%s still refuses a letter chosen by the client", (_name, schema) => {
    expect(schema.safeParse({ displayName: "Ana", language: "sr", letter: "Lj" }).success).toBe(false);
  });

  it("does not let a joiner choose: joinRoomRequest takes no language", () => {
    expect(joinRoomRequestSchema.safeParse({ roomCode: ROOM_CODE, displayName: "Marko", language: "en" }).success).toBe(
      false,
    );
  });
});

describe("authority fields cannot be smuggled through a client mutation", () => {
  const forbidden = [
    { letter: "S" },
    { playerId: "p1" },
    { score: 10 },
    { endsAt: 1_700_000_093_000 },
    { phase: "results" },
    { valid: true },
  ];

  it.each(forbidden)("rejects a draft carrying %o", (extra) => {
    const payload = {
      roundId: ROUND_ID,
      category: "city",
      value: "Subotica",
      revision: 1,
      ...extra,
    };
    expect(draftRequestSchema.safeParse(payload).success).toBe(false);
  });
});

/* -------------------------------------------------------- error envelope */

describe("error registry and ack envelope", () => {
  it("has a client-safe message for every code", () => {
    for (const code of GAME_ERROR_CODES) {
      const message = ERROR_MESSAGES[code];
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toMatch(/[/\\]|Error:|\bat \w+|token|undefined|null/i);
    }
  });

  it("rejects a code outside the closed set", () => {
    expect(gameErrorSchema.safeParse({ code: "OOPS", message: "x" }).success).toBe(false);
  });

  it("builds a success ack that parses", () => {
    const parsed = ackSchema(draftAckSchema).safeParse(
      ok({ category: "city", acceptedRevision: 2 }),
    );
    expect(parsed.success).toBe(true);
  });

  it("builds a failure ack that carries the registry message", () => {
    const result = fail("ROOM_FULL");
    expect(result).toEqual({
      ok: false,
      error: { code: "ROOM_FULL", message: ERROR_MESSAGES.ROOM_FULL },
    });
    expect(ackSchema(draftAckSchema).safeParse(result).success).toBe(true);
  });
});

/* ------------------------------------------- round coach (Plan.md §2C, W5-4) */

describe("round coach — request (contracts/coach-socket.md)", () => {
  const example = { roundId: ROUND_ID, goal: "fill_gaps", focus: ["river", "animal", "country"], language: "sr" };

  it("accepts the documented example", () => {
    expect(coachRequestSchema.safeParse(example).success).toBe(true);
    expect(COACH_GOALS).toEqual(["fill_gaps"]);
  });

  const rejected: Array<[string, unknown]> = [
    ["an extra key", { ...example, letter: "Lj" }],
    ["a smuggled player id", { ...example, playerId: "p2" }],
    ["an unknown goal", { ...example, goal: "x" }],
    ["the unplanned goal stand_out", { ...example, goal: "stand_out" }],
    ["an empty focus", { ...example, focus: [] }],
    ["nine categories", { ...example, focus: [...CATEGORIES, "city"] }],
    ["a repeated category", { ...example, focus: ["river", "river"] }],
    ["an unknown category", { ...example, focus: ["lake"] }],
    ["a language outside sr/en", { ...example, language: "de" }],
    ["a round id that is not a uuid", { ...example, roundId: "round-1" }],
  ];

  it.each(rejected)("rejects %s", (_name, payload) => {
    expect(coachRequestSchema.safeParse(payload).success).toBe(false);
  });
});

describe("round coach — report, the caller's ack (contracts/coach-socket.md)", () => {
  const completed = {
    status: "completed",
    tips: [
      { category: "river", yourAnswer: "", whyMissed: "empty", suggestion: "Ljubljanica", checkedBy: "letter_rule" },
      { category: "animal", yourAnswer: "Lav", whyMissed: "wrong_letter", suggestion: null, checkedBy: null },
    ],
    confidence: "medium",
    stopReason: "goal_completed",
  };
  const incomplete = {
    status: "incomplete",
    confidence: null,
    tips: [
      { category: "river", yourAnswer: "", whyMissed: "empty", suggestion: "Ljubljanica", checkedBy: "letter_rule" },
      { category: "animal", yourAnswer: "Lav", whyMissed: "wrong_letter", suggestion: null, checkedBy: null },
    ],
    stopReason: "repeated_call",
  };

  it("accepts the completed and incomplete examples", () => {
    expect(coachReportSchema.safeParse(completed).success).toBe(true);
    expect(coachReportSchema.safeParse(incomplete).success).toBe(true);
  });

  it("accepts a failed report with no suggestion", () => {
    const failed = {
      ...incomplete,
      status: "failed",
      tips: incomplete.tips.map((tip) => ({ ...tip, suggestion: null, checkedBy: null })),
      stopReason: "unknown_tool",
    };
    expect(coachReportSchema.safeParse(failed).success).toBe(true);
  });

  it("gives a confidence to a completed report only", () => {
    expect(coachReportSchema.safeParse({ ...completed, confidence: null }).success).toBe(false);
    expect(coachReportSchema.safeParse({ ...incomplete, confidence: "high" }).success).toBe(false);
  });

  it("carries no model text: a summary field is refused (owner, 2026-10-07)", () => {
    expect(coachReportSchema.safeParse({ ...completed, summary: "Rosno more." }).success).toBe(false);
    expect(coachReportSchema.safeParse({ ...incomplete, summary: null }).success).toBe(false);
  });

  it("never carries the log-only stop reason cancelled", () => {
    expect(coachStopReasonSchema.safeParse("cancelled").success).toBe(false);
    expect(coachReportSchema.safeParse({ ...incomplete, stopReason: "cancelled" }).success).toBe(false);
  });

  it("rejects extra keys on a tip and on the report", () => {
    const smuggled = { ...completed, tips: [{ ...completed.tips[0], points: 10 }] };
    expect(coachReportSchema.safeParse(smuggled).success).toBe(false);
    expect(coachReportSchema.safeParse({ ...completed, score: 999 }).success).toBe(false);
  });

  it("knows every miss reason: blank plus the existing reject reasons", () => {
    expect(missReasonSchema.options).toEqual(["empty", ...REJECT_REASONS]);
  });

  it("accepts the O6 run details with exactly their fields", () => {
    const run = {
      modelSteps: 3,
      toolCalls: 2,
      providerAttempts: 4,
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
      elapsedMs: 5_400,
      stopReason: "goal_completed",
    };
    expect(coachReportSchema.safeParse({ ...completed, run }).success).toBe(true);
    expect(runDetailsSchema.safeParse({ ...run, provider: null, model: null }).success).toBe(true);
    expect(runDetailsSchema.safeParse({ ...run, prompt: "system" }).success).toBe(false);
    expect(runDetailsSchema.safeParse({ ...run, toolCalls: 3 }).success).toBe(false);
  });
});

describe("round coach — the model-step envelope (contracts/model-step.md)", () => {
  const step = {
    action: "check_candidates",
    candidates: [{ category: "river", term: "Ljubljanica" }],
    evidenceIds: [],
    summary: "",
    tips: [],
    confidence: "",
  };

  it("accepts the documented step", () => {
    expect(coachStepSchema.safeParse(step).success).toBe(true);
  });

  it("accepts an unknown action name: the allowlist judges it, not the envelope (research R3)", () => {
    expect(coachStepSchema.safeParse({ ...step, action: "delete_room" }).success).toBe(true);
  });

  it("passes malformed arguments through, so the tool's own validation records them", () => {
    const nine = Array.from({ length: 9 }, (_, n) => ({ category: "river", term: `Lj${n}` }));
    expect(coachStepSchema.safeParse({ ...step, candidates: nine }).success).toBe(true);
    expect(coachStepSchema.safeParse({ ...step, candidates: [{ category: "lake", term: "x".repeat(41) }] }).success).toBe(true);
  });

  it("rejects a missing or an extra field", () => {
    const withoutTips: Partial<typeof step> = { ...step };
    delete withoutTips.tips;
    expect(coachStepSchema.safeParse(withoutTips).success).toBe(false);
    expect(coachStepSchema.safeParse({ ...step, reasoning: "because" }).success).toBe(false);
    expect(coachStepSchema.safeParse({ ...step, action: "" }).success).toBe(false);
  });

  it("sends the provider a flat JSON schema with enums, as a hint only", () => {
    const schema = COACH_STEP_JSON_SCHEMA;
    expect(JSON.stringify(schema)).not.toContain("anyOf");
    expect(schema.required).toEqual(["action", "candidates", "evidenceIds", "summary", "tips", "confidence"]);
    expect(schema.properties.action.enum).toContain("check_candidates");
    expect(schema.properties.action.enum).toContain("final");
    expect(schema.properties.candidates.maxItems).toBe(8);
    expect(schema.properties.candidates.items.properties.category.enum).toEqual([...CATEGORIES]);
  });
});

describe("round coach — event name", () => {
  it("adds one client event and no server event", () => {
    expect(CLIENT_EVENTS.coach).toBe("round:coach");
    expect(Object.values(SERVER_EVENTS)).not.toContain("round:coach");
  });
});
