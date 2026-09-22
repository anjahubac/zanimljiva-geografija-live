# CONTEXT_MANIFEST

What was deliberately put in front of the model, what was deliberately kept out,
and why. Written 2026-09-22.

## Included

| Source | Role | Priority | Risk if over-trusted | Mitigation |
| --- | --- | --- | --- | --- |
| The team's stated requirements (two computers, one shared letter, no early advantage, traditional scoring) | Authoritative product intent | 1 | Verbal requirements drift between sessions | Written into `GAME_SPEC.md` and frozen |
| `docs/GAME_SPEC.md` | Authoritative behavior | 2 | Could be edited to match buggy code | Marked FROZEN; changes require an entry in `EVIDENCE_003.md` |
| Week 3 challenge PDF (`week-03-week-04-retro-ai-engineering-challenge.pdf`) | Submission criteria, evidence requirements, AI guardrails | 3 | Its arcade-game framing does not fit this domain | Domain deviation flagged; instructor approval pending in `GAME_SPEC.md` §9 |
| `Plan.md` | Architecture, sequencing, ownership, risks | 4 | 800 lines is more context than any single step needs | Module 10 names the specific sections per step |
| `.github/instructions/*` | Stable engineering rules, exact stack, schemas, test patterns | 5 | Instruction sprawl; the model reads everything and dilutes attention | Index defines a reading order: 4 files for implementation, the rest on demand |

## Excluded

| Source | Why excluded | Risk if it had been included |
| --- | --- | --- |
| `~/Desktop/generic-instruction-files-example/README.md` | Structural reference only — a different project | Its placeholder services, credentials, remotes, bot runner and deployment environment would have been copied in as if real |
| Earlier planning chats | Superseded by `Plan.md` and `GAME_SPEC.md` | Re-introducing decisions that were later reversed, e.g. the `review` phase and Play Again |
| Public Scattergories / Stadt-Land-Fluss implementations | Not read | Importing their scoring variants, word lists and architecture instead of the agreed rules |
| Geography word lists and APIs | Out of scope by decision | Would imply semantic answer checking, which Core explicitly does not do |
| `.env`, deployment credentials, hosting dashboard contents | Secrets | Credential leakage into source, prompts, screenshots or evidence |

## Conflicts found and how they were resolved

Resolved on 2026-09-22 while auditing the plan against the instruction set:

| Conflict | Resolution |
| --- | --- |
| `RoomPhase` contained `revealed`/`review`; the state machine contained `CLOSED` | One enum: `waiting_for_player → synchronizing → countdown → answering → results → closed`. Reveal is an event, not a phase. |
| The protocol table listed `answer:review` and `round:play-again`, both marked Stretch | Removed from Core; marked "do not implement". |
| `Plan.md` §7 normalized with NFKC; the conventions module said NFC | NFKC, matching the authoritative function body. |
| The architecture lifecycle looped `results → countdown` | Removed; exactly one round per room. |
| Instructions referenced a dictionary and answer-bank coverage | Core validity is letter-only; dictionary language removed. |
| Client payloads carried a `requestId`, but client schemas are `.strict()` | Dropped from Core; the Socket.IO ack already correlates request and response. |

## Known context risk still open

`Plan.md` is long. A weaker model asked to "read the plan" will spend most of
its attention budget before writing a line of code. The mitigation is the per-step
reading list in module 10 — if a future session ignores it, expect scope drift.
