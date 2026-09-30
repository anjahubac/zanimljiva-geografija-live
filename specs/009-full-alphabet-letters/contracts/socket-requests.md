# Contract changes: socket requests

Defined in `src/contracts/socket.schemas.ts`; all remain `.strict()`.

| Event | Before | After |
| --- | --- | --- |
| `room:create` | `{ displayName }` | `{ displayName, language: "sr" \| "en" }` |
| `room:quick-play` | `{ displayName }` | `{ displayName, language: "sr" \| "en" }` |
| `room:play-ai` | `{ displayName }` | `{ displayName, language: "sr" \| "en" }` |
| `room:join` | `{ roomCode, displayName }` | unchanged — the joiner does not choose |

A missing `language`, or any other value, fails the schema: the ack is the
existing `INVALID_PAYLOAD` error and no state changes. No new error code.

## Server → client

`round:scheduled.letter` and `round:revealed.letter` use `letterSchema`, which
now accepts the 34 letters of both alphabets. No field is added.

## Internal (not over the wire)

- `LetterSelector: (alphabet: Language) => Letter`
- `AiService.checkRound(letter, alphabet, sheets)`, `botAnswers(letter, alphabet)`, `hint(letter, alphabet, category, language)`
- `startsWithLetter(text, letter, alphabet)`, `isValidAnswer(raw, letter, alphabet)`, `checkAnswerLocally(raw, letter, alphabet)`
