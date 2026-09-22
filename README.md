# Zanimljiva Geografija Live

A two-player, two-computer online round of the Serbian pen-and-paper game
*Zanimljiva geografija*. One player creates a room, the other joins with a
six-character code, and the server deals both of them the same random letter at
the same moment — so neither gets a head start.

Built for Week 3 of the Serbian AI Bootcamp.

## Status

Scaffold and required documents are in place. Gameplay is not implemented yet.
Progress follows the numbered steps in
[.github/instructions/10-implementation-order.instructions.md](.github/instructions/10-implementation-order.instructions.md).

## How it plays

1. Player 1 enters a name and creates a room; a six-character code appears.
2. Player 2 enters a name and joins with that code.
3. Once both game screens have loaded, the server picks one letter from
   `A B D K M S V` and schedules a shared 3-second countdown.
4. Both players privately fill six categories — Država, Grad, Reka, Planina,
   Biljka, Životinja — for 90 seconds.
5. The round ends when both press **Finished** or the server deadline passes.
6. Answers are revealed together and scored: two different valid answers 10 each,
   the same answer 5 each, only one valid answer 10 and 0, neither 0 and 0.

Answers are checked only for the starting letter. Players are responsible for
semantic correctness.

## Requirements

Node.js 20 or 22, npm.

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
```

Copy `.env.example` to `.env` for local overrides. Never commit `.env`.

## Documentation

| File | What it holds |
| --- | --- |
| [docs/GAME_SPEC.md](docs/GAME_SPEC.md) | Authoritative game behavior (frozen) |
| [Plan.md](Plan.md) | Architecture, sequencing, ownership, risks |
| [docs/EVALS.md](docs/EVALS.md) | Evaluations, written before the code |
| [docs/CONTEXT_MANIFEST.md](docs/CONTEXT_MANIFEST.md) | What context was used, and what was excluded |
| [docs/AI_USAGE_LOG.md](docs/AI_USAGE_LOG.md) | Every meaningful AI call |
| [AGENTS.md](AGENTS.md) | Entry point for coding agents |

## Known limitations

Rooms live in memory in a single process: a server restart ends active rooms.
There is no reconnect after a refresh, no replay in the same room, and no
semantic checking of answers. These are deliberate Week 3 scope decisions.
