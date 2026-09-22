import { z } from "zod";
import {
  answerValueSchema,
  categorySchema,
  CATEGORY_COUNT,
  displayNameSchema,
  epochMsSchema,
  letterSchema,
  pointsSchema,
  roundIdSchema,
} from "./game.schemas";

/**
 * Identity is the email address. It is lowercased before it is stored or
 * compared, so `Ana@Primer.rs` and `ana@primer.rs` are one account and the
 * UNIQUE constraint in the accounts table means what it says. 254 is the
 * longest address RFC 5321 permits.
 */
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(15).max(128);

export const loginSchema = z.object({ email: emailSchema, password: passwordSchema }).strict();
export const registerSchema = loginSchema.extend({ displayName: displayNameSchema }).strict();

export const accountSchema = z
  .object({ id: z.string().uuid(), email: emailSchema, displayName: displayNameSchema })
  .strict();
export type Account = z.infer<typeof accountSchema>;

export const sessionSchema = z.object({ account: accountSchema.nullable() }).strict();

export const historyEntrySchema = z
  .object({
    roundId: roundIdSchema,
    completedAt: epochMsSchema,
    letter: letterSchema,
    opponent: displayNameSchema,
    answers: z
      .array(
        z
          .object({
            category: categorySchema,
            raw: answerValueSchema,
            valid: z.boolean(),
            points: pointsSchema,
          })
          .strict(),
      )
      .length(CATEGORY_COUNT),
    total: z.number().int().min(0).max(CATEGORY_COUNT * 10),
    opponentTotal: z.number().int().min(0).max(CATEGORY_COUNT * 10),
    outcome: z.enum(["win", "loss", "draw"]),
  })
  .strict();
export type HistoryEntry = z.infer<typeof historyEntrySchema>;

export const historyQuerySchema = z
  .object({ page: z.coerce.number().int().min(1).max(1_000_000).default(1) })
  .strict();

export const profileSchema = z
  .object({
    account: accountSchema,
    games: z.number().int().nonnegative(),
    points: z.number().int().nonnegative(),
    wins: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.literal(20),
    history: z.array(historyEntrySchema).max(20),
  })
  .strict();
export type Profile = z.infer<typeof profileSchema>;

export const accountErrorSchema = z
  .object({
    error: z.enum([
      "INVALID_INPUT",
      "AUTH_FAILED",
      "EMAIL_UNAVAILABLE",
      "UNAUTHORIZED",
      "FORBIDDEN",
      "RATE_LIMITED",
      "INTERNAL",
      "NOT_FOUND",
    ]),
  })
  .strict();
export type AccountError = z.infer<typeof accountErrorSchema>["error"];
