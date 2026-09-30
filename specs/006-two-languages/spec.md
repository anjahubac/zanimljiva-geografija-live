# Feature Specification: Serbian and English

**Feature Branch**: `main` (built before Spec Kit)

**Created**: 2026-09-30 — **reconstructed after the build**

**Status**: Implemented locally (commit `6232482`)

**Source of truth**: `Plan.md` §2B.9. This file summarizes and links; where it differs, the sources win.

## User Scenarios & Testing

### User Story 1 - Play in either language (Priority: P1)

A header switch (Srpski / English) changes every string, category label and
error message (`src/client/strings.ts`). The choice is remembered per browser;
the default is Serbian for South Slavic browser languages, English otherwise.

### User Story 2 - Answer in either language (Priority: P1)

Answers are accepted in Serbian or English in every game, whatever the
interface language, and the two players may differ. `Serbia` and `Srbija`
count as the same answer (compared on the recognised Serbian name, feature 003).

**Acceptance Scenarios**: `tests/unit/client-ai.test.ts` (interface),
`tests/unit/ai-features.test.ts` and `tests/integration/ai-round.test.ts`
(judging and hints in both languages).

### Edge Cases

- The server returns stable error codes; only the client translates them.
- `localStorage` access is fail-safe.
- Cyrillic input remains out of scope (`Plan.md` §4).
