import type { Category, Language, Letter } from "@contracts/game.schemas";
import type { CoachStep } from "@contracts/ai-output.schemas";
import type { AiService, CoachStepOptions, CoachStepResult, HintResult, VerifyTermsResult } from "@server/ai/service";
import { answerKey, type CheckVerdicts, type Sheets } from "@server/features/check-round";
import type { CoachStepInput } from "@server/prompts/coach-step.v3";

/**
 * A scriptable stand-in for the whole AI service, for store and socket tests.
 * Each behaviour can be replaced per test; calls are recorded. The defaults
 * accept everything the local rule accepted, give every bot answer, and give
 * a harmless clue — so a test only scripts what it is about.
 */
export type FakeAi = AiService & {
  checkCalls: { letter: Letter; alphabet: Language; sheets: Sheets }[];
  botCalls: { letter: Letter; alphabet: Language }[];
  hintCalls: { letter: Letter; alphabet: Language; category: Category; language: Language }[];
  /** Every coach step input exactly as the model would receive it, with its options. */
  coachCalls: { input: CoachStepInput; options: CoachStepOptions }[];
  verifyCalls: { letter: Letter; alphabet: Language; sheets: Sheets }[];
  onCheck: (letter: Letter, alphabet: Language, sheets: Sheets) => Promise<CheckVerdicts | null>;
  onBot: (letter: Letter, alphabet: Language) => Promise<Record<Category, string> | null>;
  onHint: (letter: Letter, alphabet: Language, category: Category, language: Language) => Promise<HintResult>;
  onCoachStep: (input: CoachStepInput, options: CoachStepOptions) => Promise<CoachStepResult>;
  onVerifyTerms: (letter: Letter, alphabet: Language, sheets: Sheets) => Promise<VerifyTermsResult>;
};

export const DEFAULT_CLUE = "A clue that describes the term without naming it.";

/** A promise the test resolves by hand, to hold the AI "thinking". */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const FAKE_ATTEMPT = { n: 1, provider: "gemini", model: "fake-model", kind: "initial", status: "success", latencyMs: 0 } as const;

/** Wraps an envelope as a one-attempt success, as the real service returns it. */
export function coachReply(envelope: Partial<CoachStep>): CoachStepResult {
  const empty: CoachStep = { action: "final", candidates: [], evidenceIds: [], summary: "", tips: [], confidence: "" };
  return {
    ok: true,
    envelope: { ...empty, ...envelope },
    attempts: [{ ...FAKE_ATTEMPT }],
    model: FAKE_ATTEMPT.model,
    provider: FAKE_ATTEMPT.provider,
  };
}

/**
 * The default coach: step 1 proposes the round letter plus "ava" for every
 * focus category (it passes the letter rule); the next step cites the
 * passing items. A two-step success.
 */
async function defaultCoachStep(input: CoachStepInput): Promise<CoachStepResult> {
  if (input.allowedActions.includes("check_candidates") && input.toolResults.length === 0) {
    return coachReply({
      action: "check_candidates",
      candidates: input.focus.map((entry) => ({ category: entry.category, term: `${input.letter}ava` })),
    });
  }
  const items = input.toolResults.flatMap((result) => (result.tool === "check_candidates" ? result.items : []));
  return coachReply({
    action: "final",
    confidence: "medium",
    tips: input.focus.map((entry) => ({
      category: entry.category,
      evidenceId: items.find((item) => item.category === entry.category && item.passes)?.id ?? "",
    })),
  });
}

export function fakeAi(botSheet?: Partial<Record<Category, string>>): FakeAi {
  const fake: FakeAi = {
    checkCalls: [],
    botCalls: [],
    hintCalls: [],
    coachCalls: [],
    verifyCalls: [],
    onCheck: async () => new Map(),
    onBot: async () =>
      ({
        country: "Srbija",
        city: "Subotica",
        river: "Sava",
        mountain: "Stara planina",
        sea: "Sredozemno more",
        animal: "Slon",
        plant: "Suncokret",
        thing: "Stolica",
        ...botSheet,
      }) as Record<Category, string>,
    onHint: async () => ({ ok: true, outcome: { kind: "clue", clue: DEFAULT_CLUE } }),
    onCoachStep: defaultCoachStep,
    // The referee accepts every word it is sent.
    onVerifyTerms: async (_letter, _alphabet, sheets) => ({
      ok: true,
      verdicts: new Map(
        ([1, 2] as const).flatMap((slot) =>
          Object.entries(sheets[slot])
            .filter(([, word]) => word !== "")
            .map(([category, word]) => [
              answerKey(slot, category as Category),
              { valid: true as const, canonical: word.toLowerCase(), names: { sr: word, en: null, checked: word } },
            ]),
        ),
      ),
      attempts: [{ ...FAKE_ATTEMPT }],
    }),
    checkRound(letter, alphabet, sheets) {
      fake.checkCalls.push({ letter, alphabet, sheets });
      return fake.onCheck(letter, alphabet, sheets);
    },
    botAnswers(letter, alphabet) {
      fake.botCalls.push({ letter, alphabet });
      return fake.onBot(letter, alphabet);
    },
    hint(letter, alphabet, category, language) {
      fake.hintCalls.push({ letter, alphabet, category, language });
      return fake.onHint(letter, alphabet, category, language);
    },
    coachStep(input, options) {
      fake.coachCalls.push({ input, options });
      return fake.onCoachStep(input, options);
    },
    verifyTerms(letter, alphabet, sheets) {
      fake.verifyCalls.push({ letter, alphabet, sheets });
      return fake.onVerifyTerms(letter, alphabet, sheets);
    },
  };
  return fake;
}
