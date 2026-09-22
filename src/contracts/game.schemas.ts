import { z } from "zod";

/* ---------------------------------------------------------------- constants */

export const CATEGORIES = [
  "country",
  "city",
  "river",
  "mountain",
  "lake",
  "sea",
  "animal",
  "plant",
  "thing",
] as const;

/** Derived, never written as a literal: an array bound cannot drift from the set. */
export const CATEGORY_COUNT = CATEGORIES.length;
export const SUPPORTED_LETTERS = ["A", "B", "D", "K", "M", "S", "V"] as const;
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const MAX_ANSWER_LENGTH = 40;
/**
 * Shortest answer that can score. A single letter is the round letter typed
 * back, not a geography answer.
 *
 * This is a *validity* rule, not an input bound: `answerValueSchema` keeps no
 * minimum so a one-character draft still saves while someone is typing
 * "Srbija" one key at a time. Validity is decided at scoring, as always.
 */
export const MIN_ANSWER_LENGTH = 2;
export const MAX_DISPLAY_NAME_LENGTH = 24;
export const ROOM_CODE_LENGTH = 6;

/* -------------------------------------------------------------- primitives */

export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;

export const letterSchema = z.enum(SUPPORTED_LETTERS);
export type Letter = z.infer<typeof letterSchema>;

/** Serbian Latin labels. The UI never hard-codes these strings. */
export const CATEGORY_LABELS_SR: Record<Category, string> = {
  country: "Država",
  city: "Grad",
  river: "Reka",
  mountain: "Planina",
  lake: "Jezero",
  sea: "More",
  animal: "Životinja",
  plant: "Biljka",
  thing: "Predmet",
};

export const roomCodeSchema = z
  .string()
  .length(ROOM_CODE_LENGTH)
  .regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/, "invalid room code");

export const displayNameSchema = z.string().trim().min(1).max(MAX_DISPLAY_NAME_LENGTH);

export const answerValueSchema = z.string().max(MAX_ANSWER_LENGTH);

export const roundIdSchema = z.string().uuid();

export const revisionSchema = z.number().int().nonnegative().max(100_000);

export const epochMsSchema = z.number().int().positive();

export const playerSlotSchema = z.union([z.literal(1), z.literal(2)]);
export type PlayerSlot = z.infer<typeof playerSlotSchema>;

/** Caller-private credential. Never appears in a broadcast or a projection. */
export const resumeTokenSchema = z.string().min(32).max(64);

/* ------------------------------------------------------------ round shapes */

export const roomPhaseSchema = z.enum([
  "waiting_for_player",
  "synchronizing",
  "countdown",
  "answering",
  "results",
  "closed",
]);
export type RoomPhase = z.infer<typeof roomPhaseSchema>;

export const closedReasonSchema = z.enum(["both_finished", "deadline"]);
export type ClosedReason = z.infer<typeof closedReasonSchema>;

export const scoreReasonSchema = z.enum([
  "both_different",
  "same_answer",
  "only_player_1",
  "only_player_2",
  "neither",
]);
export type ScoreReason = z.infer<typeof scoreReasonSchema>;

export const pointsSchema = z.union([z.literal(0), z.literal(5), z.literal(10)]);
export type Points = z.infer<typeof pointsSchema>;

export const categoryScoreSchema = z
  .object({
    category: categorySchema,
    player1Points: pointsSchema,
    player2Points: pointsSchema,
    reason: scoreReasonSchema,
  })
  .strict();
export type CategoryScore = z.infer<typeof categoryScoreSchema>;

export const outcomeSchema = z.enum(["player_1", "player_2", "draw"]);
export type Outcome = z.infer<typeof outcomeSchema>;

/* ------------------------------------------------------------------ config */

/**
 * Parsed once at startup. Bounded on every field so an invalid deployment
 * setting fails loudly instead of propagating NaN or an unbounded timer.
 */
export const serverConfigSchema = z.object({
  port: z.coerce.number().int().min(1).max(65_535).default(3000),
  nodeEnv: z.enum(["development", "test", "production"]).default("development"),
  roundDurationMs: z.coerce.number().int().min(5_000).max(600_000).default(150_000),
  countdownMs: z.coerce.number().int().min(1_000).max(30_000).default(3_000),
  completedRoomTtlMs: z.coerce.number().int().min(10_000).default(300_000),
  waitingRoomTtlMs: z.coerce.number().int().min(60_000).default(1_800_000),
});
export type ServerConfig = z.infer<typeof serverConfigSchema>;
