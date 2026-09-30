import { BOT_JSON_SCHEMA, botOutputSchema } from "@contracts/ai-output.schemas";
import { CATEGORIES, type Category, type Language, type Letter } from "@contracts/game.schemas";
import { isValidAnswer } from "@domain/validate-answer";
import { generate, type GatewayDeps } from "@server/ai/gateway";
import { BUDGETS } from "@server/ai/retry-policy";
import type { AiResult, Validation } from "@server/ai/types";
import { BOT_PROMPT_VERSION, BOT_SYSTEM_INSTRUCTIONS, buildBotContent } from "@server/prompts/bot-answers.v2";

/**
 * The AI opponent's sheet (`Plan.md` §2B.3). An answer that fails the local
 * rule is blanked rather than failing the whole reply: the bot simply left
 * that field empty. Whether its answers are *real* is decided later by the
 * same checker that judges the human.
 */
export function validateBotAnswers(
  text: string,
  letter: Letter,
  alphabet: Language,
): Validation<Record<Category, string>> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, code: "invalid_output:json" };
  }

  const parsed = botOutputSchema.safeParse(json);
  if (!parsed.success) return { ok: false, code: "invalid_output:schema" };

  const byCategory = new Map(parsed.data.answers.map(({ category, answer }) => [category, answer.trim()]));
  if (byCategory.size !== CATEGORIES.length) return { ok: false, code: "invalid_output:semantic" };

  let blanked = 0;
  const sheet = Object.fromEntries(
    CATEGORIES.map((category) => {
      const answer = byCategory.get(category) ?? "";
      if (answer !== "" && !isValidAnswer(answer, letter, alphabet)) {
        blanked += 1;
        return [category, ""];
      }
      return [category, answer];
    }),
  ) as Record<Category, string>;

  return { ok: true, value: sheet, notes: { blanked } };
}

export function runBotAnswers(
  letter: Letter,
  alphabet: Language,
  deps: GatewayDeps & { interactionId: string },
): Promise<AiResult<Record<Category, string>>> {
  return generate(
    {
      operation: "bot-answers",
      promptVersion: BOT_PROMPT_VERSION,
      interactionId: deps.interactionId,
      systemInstruction: BOT_SYSTEM_INSTRUCTIONS[alphabet],
      userContent: buildBotContent(letter, alphabet),
      responseJsonSchema: BOT_JSON_SCHEMA,
      // Some variety, so two games on the same letter do not play identically.
      temperature: 0.9,
      maxOutputTokens: 600,
      budget: BUDGETS["bot-answers"],
      validate: (text) => validateBotAnswers(text, letter, alphabet),
    },
    deps,
  );
}
