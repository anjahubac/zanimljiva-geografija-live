# Quickstart: validating letters from the whole alphabet

## Automated

```bash
npm run verify
```

Expected: typecheck, lint, build and all tests pass, including:

- `tests/unit/validate-answer.test.ts`: the digraph cases from spec US1 (L/Lj, N/Nj, D/Dž in `sr`; none in `en`) and diacritic cases (Š, Č in both).
- `tests/unit/server-primitives.test.ts`: over many draws, the selector returns every letter of the requested alphabet and none outside it.
- `tests/unit/contracts.test.ts`: the two alphabets have 30 and 26 letters; the request schemas refuse a missing or unknown `language`.
- `tests/unit/ai-features.test.ts`: bot answers and hint terms judged under each alphabet (spec US4).
- `tests/integration/alphabet.test.ts`: the opener's language decides in a friend room, a random match and an AI room, even when the second player's differs (spec US3).
- A1–A6 in `tests/integration/ai-round.test.ts` still pass.

## By hand

1. `npm run dev`, open two browser tabs.
2. Tab 1 on **Srpski**, create a room; tab 2 on **English**, join. Play a few rooms: the letter is one of the 30 Serbian letters; Lj, Nj and Dž show as `Lj`, `Nj`, `Dž`.
3. Swap the languages: the letters come from A–Z.
4. With a letter L in a Serbian room, write `Ljubljana` for Grad: it scores 0 with "wrong letter".

## Live AI (needs keys; W4-7)

`AI_PROVIDER_ORDER=gemini npm run smoke:ai` (and `=groq`) now includes an
English-alphabet bot sheet for W. Record the result in `docs/AI_EVALS.md`.
