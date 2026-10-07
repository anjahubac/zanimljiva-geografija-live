# Zanimljiva Geografija Live

A two-player online round of the Serbian pen-and-paper game
*Zanimljiva geografija*. The server deals both players the same random letter
at the same moment — so neither gets a head start — and an AI (Google Gemini,
with Groq as a backup) checks that every answer is a real term of its category.

Built for Weeks 3–4 of the Serbian AI Bootcamp. Week 5 adds a **round
coach** — after the results, a bounded AI agent shows what would have counted
where you scored 0 — approved and specified, not built yet
([Plan.md §2C](Plan.md), [specs/010](specs/010-round-coach-agent/spec.md)).

## Three ways to play

No account needed — type a name and choose:

- **Play a friend** — create a room and share its six-character code.
- **Play a random person** — get matched with whoever is waiting.
- **Play against AI** — an AI opponent plays the same round on the server.

The interface is in **Serbian or English** (switch in the header). Answers count
in either language in every game. The language of the player who opens the
game also picks the letters: a Serbian game uses the whole Serbian alphabet
(including Lj, Nj, Dž), an English game A–Z.

## How it plays

1. Player 1 enters a name and creates a room; a six-character code appears.
   Changed your mind? **Leave game** takes you back to the start, and the code
   stops working.
2. Player 2 enters a name and joins with that code.
3. Once both game screens have loaded, the server picks one letter from the
   game's alphabet and schedules a shared 3-second countdown. In a Serbian
   game Lj, Nj and Dž are letters of their own: "Ljubljana" counts for Lj,
   not for L.
4. Both players privately fill eight categories — Država, Grad, Reka, Planina,
   More, Životinja, Biljka, Predmet — for 150 seconds. Stuck? Ask for a
   **hint** (two per round); a hinted cell is marked for both players.
5. The round ends when both press **Finished** or the server deadline passes.
6. The AI checks the answers (a few seconds), then they are revealed together
   and scored: two different valid answers 10 each, the same answer 5 each,
   only one valid answer 10 and 0, neither 0 and 0. Each rejected answer shows
   why (doesn't exist, wrong category, wrong letter…).

If the AI is unavailable, the round is scored on the starting letter only, and
the results say so. The game never waits on the AI for more than 20 seconds.

7. On the results sheet, the **round coach** (_Trener partije_) offers the
   categories where you scored 0. Ask, and within about half a minute you get
   one suggestion per category that passed the game's own letter rule, or an
   honest "no suggestion", with a short summary in your language. An AI
   proposes words, the game checks them, and the AI may revise once; it never
   changes your points, only you see the report, and it never uses your
   opponent's answers. One analysis per round (`Plan.md` §2C).

## Requirements

Node.js 22.13 or newer, npm. For the AI features, a free Gemini and/or Groq API key.

## Commands

```bash
npm install
npm run dev        # Vite client on :5173, game server on :3000
npm test           # Vitest, once
npm run typecheck
npm run lint
npm run build      # dist/client + dist/server
npm start          # serve the built SPA, /healthz and Socket.IO from one origin
npm run verify     # typecheck + lint + test + build — the gate before any handoff
npm run smoke:ai   # opt-in: 5 real AI requests with fixed, pre-written expectations
```

Copy `.env.example` to `.env` and set `GEMINI_API_KEY` (free, from
[Google AI Studio](https://aistudio.google.com/apikey), in a project **without
billing**) and/or `GROQ_API_KEY` (free, from
[console.groq.com/keys](https://console.groq.com/keys)). With both, each covers
for the other when it fails or runs out of free quota. Never commit `.env`.
Without any key the game still runs, with the letter rule only. Note that on
Gemini's free tier Google may use the requests to improve its products; the
lobby tells players this.

## Documentation

| File | What it holds |
| --- | --- |
| [docs/GAME_SPEC.md](docs/GAME_SPEC.md) | Authoritative game behavior (frozen) |
| [Plan.md](Plan.md) | Architecture, sequencing, ownership, risks |
| [docs/EVALS.md](docs/EVALS.md) | Evaluations, written before the code |
| [docs/AI_EVALS.md](docs/AI_EVALS.md) | Live checks of the AI against real Gemini and Groq |
| [docs/EVIDENCE_003.md](docs/EVIDENCE_003.md) | Week 3: scope changes, baseline, the controlled change |
| [docs/EVIDENCE_004.md](docs/EVIDENCE_004.md) | Week 4: scope changes, AI evals, runs, open findings |
| [docs/EVIDENCE_005.md](docs/EVIDENCE_005.md) | Week 5: the round coach — scope change, baseline, runs, security checklist |
| [docs/AGENT_FLOW.md](docs/AGENT_FLOW.md) | Week 5: the coach's flow, checks and stop conditions |
| [docs/AGENT_EVALS.md](docs/AGENT_EVALS.md) | Week 5: agent evals C1–C19 and live L1–L3, written before the code |
| [specs/](specs/README.md) | Spec Kit features; Week 5 is `specs/010-round-coach-agent` (tool contracts in `contracts/tools.md`) |
| [docs/PRODUCT_REVIEW.md](docs/PRODUCT_REVIEW.md) | Product review and prioritised improvements |
| [docs/BUILD_PROMPT_V1.md](docs/BUILD_PROMPT_V1.md) | The first build prompt, kept as written |
| [docs/CONTEXT_MANIFEST.md](docs/CONTEXT_MANIFEST.md) | What context was used, and what was excluded |
| [docs/AI_USAGE_LOG.md](docs/AI_USAGE_LOG.md) | Every meaningful AI call |
| [AGENTS.md](AGENTS.md) | Entry point for coding agents |

## Known limitations

Rooms live in memory in a single process: a server restart ends active rooms.
There is no reconnect after a refresh and no replay in the same room. Once a
round has started there is no Leave button: the round plays to its deadline. The AI
checker can be wrong on rare or ambiguous terms, and the free quotas are
limited per day. The server caps AI use per visitor per hour and per day
(`Plan.md` §2B.11); players sharing one address share the per-visitor cap. The
round coach checks the letter, not the facts: a suggestion can pass the letter
rule and still not be a real term of its category. Its report lives with the
finished room and is gone when the room is cleared five minutes later. See [Plan.md §2B](Plan.md) for the full design and free hosting.
