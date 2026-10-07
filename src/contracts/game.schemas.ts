import { z } from "zod";

/* ---------------------------------------------------------------- constants */

export const CATEGORIES = [
  "country",
  "city",
  "river",
  "mountain",
  "sea",
  "animal",
  "plant",
  "thing",
] as const;

/** Derived, never written as a literal: an array bound cannot drift from the set. */
export const CATEGORY_COUNT = CATEGORIES.length;
/**
 * Every round letter of either alphabet (`Plan.md` §2B.13). A digraph is one
 * letter, written with its second character lower case: `Lj`, not `LJ`.
 */
export const ALL_LETTERS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
  "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
  "Č", "Ć", "Dž", "Đ", "Lj", "Nj", "Š", "Ž",
] as const;
type AnyLetter = (typeof ALL_LETTERS)[number];

/** The 30 letters of the Serbian Latin alphabet, in alphabet order. */
export const SERBIAN_LETTERS = [
  "A", "B", "C", "Č", "Ć", "D", "Dž", "Đ", "E", "F", "G", "H", "I", "J", "K",
  "L", "Lj", "M", "N", "Nj", "O", "P", "R", "S", "Š", "T", "U", "V", "Z", "Ž",
] as const satisfies readonly AnyLetter[];

/** The 26 letters of the English alphabet. */
export const ENGLISH_LETTERS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
  "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
] as const satisfies readonly AnyLetter[];
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

/**
 * Hints per player per round (`Plan.md` §2B.8). A credit is spent only when a
 * valid clue is shown, and a category can be hinted at most once.
 */
export const HINTS_PER_ROUND = 2;
export const MIN_CLUE_LENGTH = 10;
export const MAX_CLUE_LENGTH = 200;

/** The AI opponent's display name; a human cannot pick it (see `displayNameSchema`). */
export const BOT_DISPLAY_NAME = "AI";

/**
 * Interface and hint languages. Answers are accepted in either language in
 * every game, whatever the player's interface language is.
 */
export const LANGUAGES = ["sr", "en"] as const;

/**
 * A room draws its letter from the alphabet of the player who opened it
 * (`Plan.md` §2B.13). Fixed for the room; answers are still accepted in
 * either language.
 */
export const ALPHABETS: Record<(typeof LANGUAGES)[number], readonly AnyLetter[]> = {
  sr: SERBIAN_LETTERS,
  en: ENGLISH_LETTERS,
};

/* -------------------------------------------------------------- primitives */

export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;

export const letterSchema = z.enum(ALL_LETTERS);
export type Letter = z.infer<typeof letterSchema>;

export const languageSchema = z.enum(LANGUAGES);
export type Language = z.infer<typeof languageSchema>;

/** Serbian Latin labels. The UI never hard-codes these strings. */
export const CATEGORY_LABELS_SR: Record<Category, string> = {
  country: "Država",
  city: "Grad",
  river: "Reka",
  mountain: "Planina",
  sea: "More",
  animal: "Životinja",
  plant: "Biljka",
  thing: "Predmet",
};

export const CATEGORY_LABELS_EN: Record<Category, string> = {
  country: "Country",
  city: "City",
  river: "River",
  mountain: "Mountain",
  sea: "Sea",
  animal: "Animal",
  plant: "Plant",
  thing: "Thing",
};

export const CATEGORY_LABELS: Record<Language, Record<Category, string>> = {
  sr: CATEGORY_LABELS_SR,
  en: CATEGORY_LABELS_EN,
};

export const roomCodeSchema = z
  .string()
  .length(ROOM_CODE_LENGTH)
  .regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/, "invalid room code");

export const displayNameSchema = z.string().trim().min(1).max(MAX_DISPLAY_NAME_LENGTH);

/**
 * A name a *player asks for*. Only the server's bot is called `BOT_DISPLAY_NAME`,
 * so a human may not pick it; projections use `displayNameSchema`, which the
 * bot's own name must still pass.
 */
export const requestedNameSchema = displayNameSchema.refine(
  (name) => name.toLocaleLowerCase("sr-Latn") !== BOT_DISPLAY_NAME.toLocaleLowerCase("sr-Latn"),
  { message: "reserved name" },
);

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
  // Week 4: the round is closed and locked; the AI check is running (§2B.2).
  "judging",
  "results",
  "closed",
]);
export type RoomPhase = z.infer<typeof roomPhaseSchema>;

/**
 * Why an answer did not count. The first two are the local rule (§7); the rest
 * are the AI checker's verdict (§2B.2). Blank answers have no reason.
 */
export const REJECT_REASONS = [
  "too_short",
  "wrong_letter",
  "not_real",
  "wrong_category",
  "historical",
  "unrecognized",
] as const;
export const rejectReasonSchema = z.enum(REJECT_REASONS);
export type RejectReason = z.infer<typeof rejectReasonSchema>;

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
  // AI usage limits, Plan §2B.11. Tunable on the host without a code change.
  aiRoomsPerVisitorHour: z.coerce.number().int().min(1).max(10_000).default(10),
  hintsPerVisitorHour: z.coerce.number().int().min(1).max(10_000).default(20),
  aiDailyCallBudget: z.coerce.number().int().min(1).max(1_000_000).default(1_500),
  coachRunsPerVisitorHour: z.coerce.number().int().min(1).max(5).default(5),
  /** Proxies in front of the server whose x-forwarded-for entry is trusted; 0 = none. */
  trustProxyHops: z.coerce.number().int().min(0).max(5).default(0),
});
export type ServerConfig = z.infer<typeof serverConfigSchema>;
