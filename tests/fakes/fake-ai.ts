import type { Category, Language, Letter } from "@contracts/game.schemas";
import type { AiService, HintResult } from "@server/ai/service";
import type { CheckVerdicts, Sheets } from "@server/features/check-round";

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
  onCheck: (letter: Letter, alphabet: Language, sheets: Sheets) => Promise<CheckVerdicts | null>;
  onBot: (letter: Letter, alphabet: Language) => Promise<Record<Category, string> | null>;
  onHint: (letter: Letter, alphabet: Language, category: Category, language: Language) => Promise<HintResult>;
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

export function fakeAi(botSheet?: Partial<Record<Category, string>>): FakeAi {
  const fake: FakeAi = {
    checkCalls: [],
    botCalls: [],
    hintCalls: [],
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
  };
  return fake;
}
