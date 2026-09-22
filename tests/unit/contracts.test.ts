import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import {
  CATEGORIES,
  CATEGORY_LABELS_SR,
  SUPPORTED_LETTERS,
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
  clientReadyRequestSchema,
  createRoomRequestSchema,
  draftAckSchema,
  draftRequestSchema,
  finishRequestSchema,
  joinRoomRequestSchema,
  roomAckSchema,
  roomStateSchema,
  roundResultsSchema,
  roundRevealedSchema,
  roundScheduledSchema,
} from "@contracts/socket.schemas";

const ROUND_ID = randomUUID();
const ROOM_CODE = "ABC234";
const RESUME_TOKEN = "t".repeat(43);

const validAnswers = CATEGORIES.map((category) => ({
  category,
  raw: "Srbija",
  normalized: "srbija",
  valid: true,
}));

const validScores = CATEGORIES.map((category) => ({
  category,
  player1Points: 10 as const,
  player2Points: 10 as const,
  reason: "both_different" as const,
}));

/* -------------------------------------------------------- primitive bounds */

describe("primitive schemas", () => {
  it("accepts the six locked categories and rejects anything else", () => {
    expect(CATEGORIES).toHaveLength(6);
    for (const category of CATEGORIES) expect(categorySchema.parse(category)).toBe(category);
    expect(categorySchema.safeParse("capital").success).toBe(false);
  });

  it("accepts the seven supported letters and rejects others", () => {
    expect(SUPPORTED_LETTERS).toHaveLength(7);
    for (const letter of SUPPORTED_LETTERS) expect(letterSchema.parse(letter)).toBe(letter);
    expect(letterSchema.safeParse("C").success).toBe(false);
    expect(letterSchema.safeParse("s").success).toBe(false);
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
    valid: { displayName: "Ana" },
    malformed: { displayName: "" },
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
        { slot: 1, displayName: "Ana", connected: true, clientReady: true, finished: false },
        { slot: 2, displayName: "Marko", connected: true, clientReady: true, finished: false },
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
    },
    malformed: {
      roundId: ROUND_ID,
      scores: validScores.map((s) => ({ ...s, player1Points: 7 })),
      player1Total: 42,
      player2Total: 60,
      outcome: "draw",
    },
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
