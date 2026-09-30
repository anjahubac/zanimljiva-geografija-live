# Research: Letters from the whole alphabet

No `NEEDS CLARIFICATION` remained after the owner's answers (`Plan.md` §2B.13).
These are the design decisions made while planning.

## R1. Where the alphabet lives

- **Decision:** a field `alphabet: Language` on the server's `Room`, set when the room is opened, and copied onto the `Round`. It is not added to any server → client payload.
- **Rationale:** the client already knows its own language and shows the letter it is sent; the other player does not need the set. Keeping payloads unchanged keeps the privacy and contract surface unchanged.
- **Alternatives:** broadcasting it in `round:scheduled` (no consumer); deriving it from the letter (impossible — L, N, D and most letters are in both sets).

## R2. How the client tells the server its language

- **Decision:** a required `language` field (`languageSchema`) on `room:create`, `room:quick-play` and `room:play-ai`. `room:join` does not carry one: the joiner never decides.
- **Rationale:** the schemas are `.strict()`; a required field makes an old or forged client fail loudly (`INVALID_PAYLOAD`) instead of silently getting a default. It is a preference like `displayName`, not authority over the letter.
- **Alternatives:** optional with a Serbian default (hides a broken client); a separate "set language" event (a new event, which the scope rule forbids).

## R3. Random queue

- **Decision:** the queue entry stores the waiting player's language; the match uses it, and the arriving player's language is ignored.
- **Rationale:** owner decision 1 ("the player who was already waiting"). The queue stays one queue.

## R4. The letter rule with digraphs

- **Decision:** `startsWithLetter(text, letter, alphabet)`: the normalized text starts with the normalized letter, and, when `alphabet === "sr"`, does not start with the digraph that extends it (`l → lj`, `n → nj`, `d → dž`). The rule stays in `src/domain/validate-answer.ts`; every caller passes the alphabet.
- **Rationale:** one owner of the rule, as today. Normalization is NFKC then Serbian Latin lowercase, so the single-codepoint digraphs (ǈ, ǋ, ǅ …) fold to two letters and are handled.
- **Alternatives:** an optional alphabet parameter defaulting to English (a forgotten caller would silently lose the Serbian rule); a `RoundLetter` object (same churn, more ceremony).

## R5. Hints and the bot

- **Decision:** new prompt versions `bot-answers.v2` and `hint.v3` (module 07: never edit a released prompt). Both receive `alphabet` in the user content and a per-alphabet letter rule. Code checks their output with the same rule:
  - bot: each answer as written, blanked if it fails (unchanged mechanism);
  - hint: in a Serbian room the Serbian name must fit; in an English room either the Serbian or the English name may fit (FR-011).
- **Rationale:** English-only letters (Q, W, X, Y) have almost no Serbian names, so an English room has to allow English terms; the checker already judges the letter on the recognised name closest to what was written.
- **Checker prompt:** unchanged (`check-round.v3` says "do not judge the starting letter"); only the code that checks the recognised name gets the alphabet.

## R6. Displaying Lj, Nj, Dž

- **Decision:** the letter is shown as sent (`Lj`), and `.letter strong` stops inheriting `text-transform: uppercase`, which would show `LJ`.

## R7. Live AI evals

- The W4-7 live smoke run has never happened, so there is no live baseline to break. `scripts/ai-smoke.ts` passes the alphabet and gains one English-room bot case (letter W) so the first live run covers the new prompts.
