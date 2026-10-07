# Feature specs

Spec Kit was added on 2026-09-30 (`Plan.md` §2B.12). Its rules are in
`.specify/memory/constitution.md`.

## Reconstructed features (001–008)

These were **written after the features were built**, from `Plan.md`,
`docs/GAME_SPEC.md`, the tests and the git history. They record what exists and
where its design lives. They are not evidence that a spec was written first,
and they do not replace the sources they link to.

Each has only a `spec.md`. The plan is the linked `Plan.md` section; the tasks
were the build steps in `.github/instructions/10-implementation-order.instructions.md`
(Week 3) and `Plan.md` §2B.6 (Week 4), all done.

| # | Feature | Built | Design |
| --- | --- | --- | --- |
| [001](001-synchronized-round/spec.md) | One synchronized two-player round | 2026-09-22 | `docs/GAME_SPEC.md`, `Plan.md` §3–§13 |
| [002](002-random-matchmaking/spec.md) | Play a random person | 2026-09-23 | `Plan.md` §2 "Two ways into a room" |
| [003](003-ai-answer-checker/spec.md) | AI answer checker (Gemini ⇄ Groq) | 2026-09-30 | `Plan.md` §2B.2, §2B.5 |
| [004](004-play-against-ai/spec.md) | Play against AI | 2026-09-30 | `Plan.md` §2B.3 |
| [005](005-hints/spec.md) | Hints | 2026-09-30 | `Plan.md` §2B.8 |
| [006](006-two-languages/spec.md) | Serbian and English | 2026-09-30 | `Plan.md` §2B.9 |
| [007](007-leave-waiting-screen/spec.md) | Leave the waiting screen | 2026-09-30 | `Plan.md` §2B.10 |
| [008](008-ai-usage-limits/spec.md) | AI usage limits | 2026-09-30 | `Plan.md` §2B.11 |

Email accounts (2026-09-23) were built and then removed (`Plan.md` §2B.1), so
they have no spec.

## New features (009 onward)

| # | Feature | Status | Design |
| --- | --- | --- | --- |
| [009](009-full-alphabet-letters/spec.md) | Letters from the whole alphabet | Built 2026-09-30, full flow | `Plan.md` §2B.13 |
| [010](010-round-coach-agent/spec.md) | Round coach — Week 5 bounded agentic feature | Specified 2026-10-07 through `tasks.md` and analyzed; Built 2026-10-07 on `feature/round-coach`: Core, O1 and O6 (W5-4 → W5-10b), 6 live runs (W5-11); demo open | `Plan.md` §2C, §2C.16 |

Use the full flow: `/speckit-specify` → `/speckit-clarify` (optional) →
`/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement`.
A feature that adds anything `Plan.md` does not list needs the owner's decision
recorded in `Plan.md` first (constitution principle V).
