# Zanimljiva Geografija Live - Detailed Implementation Plan

## 1. Status and deadline

- Product name: **Zanimljiva Geografija Live**
- Delivery target: **23 September 2026**
- Players: exactly two people on two separate computers
- Deployment: one public browser URL backed by one real-time Node.js service
- Plan status: Core gameplay implemented; baseline/evidence and deployed two-computer acceptance remain incomplete. See the 2026-09-22 review in `docs/PRODUCT_REVIEW.md`.
- Primary objective: deliver the smallest reliable synchronized round and the evidence required for Week 3

## 2. How the source documents are used

### Product-owner expansion — 2026-09-22

The owner explicitly requested real cross-device accounts, player profiles,
persistent answer/points history, and a wider game sheet. These supersede the
Core exclusions below for this extension. Random matchmaking was a proposal
when this section was written; it was approved on 2026-09-22 and is now
implemented — see "Two ways into a room" below.

Implementation sequence for the extension:
1. Shared account/history schemas and acceptance cases.
2. SQLite account/session/history store; **email**/password authentication with
   asynchronous scrypt, expiring HttpOnly cookies, bounded requests and login
   attempts. Use built-in `node:sqlite` (Node >=22.13), no new package/service.
   The email address *is* the identity: it is trimmed and lowercased before it
   is stored or compared, so one address is one account whatever its casing.
3. Bind authenticated identity on the server when entering a room; persist
   each player's own answers and server points once on canonical round close.
   Guest room-code play remains available, without persistent guest history.
4. Login/register/profile/history UI, paginated history, and wider tables.
5. Authentication, privacy, persistence, scoring and browser verification.

SQLite must live on a persistent disk in production. Active rooms remain in
memory. Password recovery, reconnect, rematches and matchmaking remain future
work. The baseline commit before this extension is
`481535a9065852ad9001719f96de2a73ebe399b3`; this is not a claim that the full
Week 3 baseline/evidence exercise has been completed.

#### Google sign-in — proposed, not implemented (2026-09-22)

The owner asked whether players could also sign in with Google. It is **not**
implemented, and it is not a small addition to the above: it needs an OAuth
client library, a Google Cloud project, registered redirect URIs, a client
secret held outside the repository, and a decision about what happens when a
Google address matches an existing password account. That is a new dependency
and a new external service, which §4 and rule 5 of the agent instructions
forbid without an explicit scope change.

Email and password ship first and stand on their own. If Google sign-in is
approved later, the account table already keys on the email address, so a
Google identity joins an existing row rather than forcing a migration.

#### Two ways into a room (2026-09-22)

A player chooses between **playing a friend** — create a room, share the code,
the existing path — and **playing a stranger**, a first-come queue held in the
same process as the rooms. The second player to queue causes the server to
create a room for the waiting player and immediately join the arriving one, so
a matched pair travels exactly the path a room code travels: there is no second
way to start a round, and every existing timing, privacy and scoring guarantee
applies unchanged.

Rules the queue must keep:

- One entry per socket. Asking twice returns the same queued answer rather than
  creating a second entry that a later player could match against.
- A socket that disconnects while queued is removed, so nobody is matched with
  a player who has gone.
- A signed-in account is never matched with itself on a second device; it waits
  for a different account instead.
- A player already in a room cannot queue.
- The queue lives in memory beside the rooms. A restart loses it, exactly as it
  loses rooms, and this is the same accepted limitation §13 already records.

A signed-in player is not asked for a name on either path: the account supplies
the display name, and the server takes it from the session rather than from the
payload, so a client cannot claim another name by editing the request.

#### Disputed answers — approved 2026-09-22, not yet built

The owner asked for a way to challenge an answer the opponent believes is
invalid, with the server consulting an outside source. The approved design is a
**flag plus an advisory lookup**: at reveal either player may mark a cell as
suspicious, both players see it marked, and the server reports what an external
lookup found as *evidence*, never as a verdict that changes the score.

This is sequenced after the deployed two-computer round, because:

- It touches the reveal-and-scoring path, the most invariant-protected code in
  the repository, and §8 states that reveal and scoring happen exactly once.
- `answer:review` is listed in §11 as a Stretch event that Core schemas must not
  declare, and live web lookup is excluded three times in §4. Building it is a
  recorded scope change, not a refactor.
- It needs a provider choice, an API key held in deploy configuration, rate
  limiting, caching, and a defined answer for when the lookup fails, times out
  or is ambiguous — none of which can be deterministic in tests, so the lookup
  must sit behind an injected interface with a fake in tests, the way `Clock`
  and `LetterSelector` already do.

The scoring rule does not change: points stay as §6 defines them, and a flagged
cell is presented as disputed rather than rescored. Deciding otherwise would
make the score depend on a network call.

#### Game-sheet shape (2026-09-23)

The answer sheet is the paper sheet, not a two-player grid. The categories head
the columns and the body is ruled for five lines: Core plays one round, so the
player writes on the first line and the remaining four stay blank. The blank
lines are the look of the page and carry no data, so they are `aria-hidden`.

The **playing** sheet carries the categories and nothing else — no letter column
and no total column. The letter is stated in the header above the sheet, and a
total has nothing to show before the reveal, because points do not exist until
the server closes the round.

The **scoring** sheet keeps a player column and a total column, one scored line
per player above the blank remainder, because that is where totals belong.

Neither sheet stacks into a list at any width. Both keep their columns and, if
the window is too narrow, scroll inside their own container — the sheet screens
are allowed a wider page than the forms so that ordinary laptop widths do not
need to scroll at all.

The supplied documents have different roles:

1. The team's explicit request controls the product behavior.
2. `docs/GAME_SPEC.md`, after team approval, becomes the authoritative game specification.
3. The Week 3 challenge PDF supplies submission criteria, evidence requirements, and AI-engineering guardrails.
4. This file supplies architecture, work sequence, ownership, tests, deployment, and risk management.
5. The `.github` instruction set supplies reusable engineering guidance to coding agents.
6. The generic instruction-files README is a structural example only. Its sample architecture, commands, credentials, remotes, bot runner, and deployment environment do not apply here.

If two higher-priority sources conflict, pause and resolve the conflict in `GAME_SPEC.md` before implementing it.

## 2A. Execution contract for the implementation model

This plan intentionally locks the Core decisions. An implementation model must not invent alternatives, add optional features, or pause for product choices already resolved here.

Required execution order:

1. Read `Plan.md`, `.github/00-index.instructions.md`, `.github/copilot-instructions.md`, and instruction modules 10-13 (10 is the step-by-step driver; 11 fixes the stack; 12 holds the schemas and error codes; 13 holds the test patterns). Open modules 01-09 only when the routing matrix in the index sends you there.
2. Create the required Week 3 documents from the locked decisions in this plan.
3. Before application code, write `docs/BUILD_PROMPT_V1.md` and pre-register E1-E4 in `docs/EVALS.md`.
4. Scaffold exactly the stack and commands in Sections 9 and 19A.
5. Implement the phases in Section 17 in order. Do not start styling before the two-client synchronization slice works.
6. Preserve the first runnable integrated version as the baseline before hardening it.
7. Stop after the Definition of Done passes. Do not implement any item marked **Stretch - do not implement for Core**.

If a technical detail is not defined, choose the smallest solution consistent with server authority, privacy, deterministic tests, and the single-service architecture. Record the assumption in `docs/EVIDENCE_003.md`; do not add infrastructure.

## 3. Product goal

Create a browser game in which Player 1 creates a temporary room and Player 2 joins it from another computer. When Player 2 has joined and both game screens have automatically acknowledged that they are loaded, the server chooses one random supported letter and schedules one future start and deadline for both players. Each player privately fills the same categories. Answers are revealed only after both players click **Finished** or the authoritative server deadline expires, then the server applies traditional scoring.

The Week 3 version proves one stable online round. It is not a general gaming platform.

## 4. Locked MVP scope

### Included

- Exactly two players per room
- Player 1 enters a name, creates a room, and receives a short room code
- Player 2 enters a name and joins using that code
- Automatic two-client synchronization after both game screens load
- Server-selected random letter from exactly `A, B, D, K, M, S, V`
- Shared three-second countdown, `startsAt`, and `endsAt`
- Exactly 150 seconds of answer time
- Eight categories: Država, Grad, Reka, Planina, More, Životinja, Biljka, Predmet
- Same categories and duration for both players
- Private answer entry and private server draft saving
- **Finished** action that atomically saves and locks a player's answers
- Automatic finish when the server deadline expires
- Reveal only after both finish or time expires
- Traditional per-category scoring and total score
- Results and winner/draw shown to both players
- Runtime validation of configuration and every client-to-server event
- Deterministic domain and server integration tests
- One WebSocket-capable production deployment

### Explicitly out of scope

The first and third lines below were the Core position and are **superseded by
the product-owner expansion in §2**, which adds email accounts, profiles and
saved history. They are kept, struck through, so the original Core boundary
stays auditable rather than being quietly rewritten.

- ~~Accounts, passwords, profiles, or social login~~ — email accounts, profiles
  and saved history are now in scope per §2. Social login (Google) remains out.
- More than two players, spectators, public matchmaking, or public room lists
- ~~Database, permanent history, or persistent leaderboard~~ — a single SQLite
  file on a persistent disk is now in scope per §2. A leaderboard is not.
- Chat, voice, reactions, invitations beyond sharing the room code
- Multiple backend instances or horizontal scaling
- Semantic verification that an entry is a real country, city, river, mountain, plant, or animal
- Curated answer dictionary or live geography lookup
- Live web lookup or external geography API
- Perfect anti-cheat protection
- Tournament mode or category editor
- Native mobile application
- AI hints or AI answer judging during Week 3
- Cyrillic input and Cyrillic/Latin equivalence
- Custom music or copied branding/assets

### Stretch - do not implement for Core

- Play Again or multiple rounds in one room
- Refresh/reconnect/resume support
- Manual or AI review of semantic correctness
- Curated answer dictionary
- Animations and extra visual polish

### Locked constants

| Setting | Core value |
| --- | --- |
| Categories | `country`, `city`, `river`, `mountain`, `sea`, `animal`, `plant`, `thing` |
| Serbian labels | Država, Grad, Reka, Planina, More, Životinja, Biljka, Predmet |
| Supported letters | `A`, `B`, `D`, `K`, `M`, `S`, `V` |
| Countdown | 3,000 ms |
| Answer time | 150,000 ms |
| Display-name length | 1-24 characters after trimming |
| Answer length | 0-40 characters before normalization |
| Room code | 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` |
| Draft debounce | 300 ms, plus immediate send on blur and Finish |
| Room storage | In memory, one Node process |
| Completed-room retention | 5 minutes, then delete |
| Inactive waiting-room TTL | 30 minutes |

## 5. Fair synchronized start

The server must not choose or reveal the letter while Player 1 is alone. Otherwise Player 1 gets extra thinking time.

```text
Player 1 creates room
  -> Player 2 joins
  -> each loaded game screen automatically sends room:client-ready
  -> server receives acknowledgements from both current players
  -> server selects one supported letter
  -> server creates one roundId
  -> startsAt = serverNow + 3 seconds
  -> endsAt = startsAt + configured duration
  -> server sends the same roundId, letter, categories, startsAt, and endsAt to both
  -> both clients unlock the form at startsAt
```

The browser displays a countdown, but only the server decides whether input is early, on time, or late.

## 6. Game rules

1. Both players receive the same letter, categories, start time, and deadline.
2. A player may enter at most one answer per category.
3. Answers remain hidden from the opponent while the round is active.
4. Clicking **Finished** permanently locks that player's round answers.
5. One finished player sees only a waiting state and the opponent's completion status.
6. The round closes when both players finish or the server deadline is reached.
7. Reveal and scoring happen exactly once.
8. Answer validity is decided before the two answers are compared.
9. The server calculates validity and points; the client only renders results.

### Traditional scoring

| Player 1 | Player 2 | P1 points | P2 points | Reason |
| --- | --- | ---: | ---: | --- |
| Valid answer A | Valid answer B, different after normalization | 10 | 10 | `both_different` |
| Valid answer A | Same valid normalized answer A | 5 | 5 | `same_answer` |
| Valid answer | Blank or invalid | 10 | 0 | `only_player_1` |
| Blank or invalid | Valid answer | 0 | 10 | `only_player_2` |
| Blank or invalid | Blank or invalid | 0 | 0 | `neither` |

Normalization precedes comparison. The baseline policy is Unicode normalization, trim, collapse repeated internal whitespace, and lowercase according to a documented Serbian Latin policy. The original answer is retained for post-reveal display.

## 7. Answer normalization and validity policy

The Core game uses an explicit honor-system rule. It does **not** decide whether an entry is geographically or semantically true.

An answer is valid when all of these are true:

1. The raw value is a string no longer than 40 characters.
2. After normalization it is at least two characters long. A single character
   is the round letter typed back, not an answer.
3. The normalized answer begins with the selected single-letter round letter, compared case-insensitively.

Use this exact normalization function:

```ts
function normalizeAnswer(raw: string): string {
  return raw
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("sr-Latn");
}
```

Use this exact validity rule:

```ts
function isValidAnswer(raw: string, letter: string): boolean {
  const normalized = normalizeAnswer(raw);
  const normalizedLetter = normalizeAnswer(letter);
  return normalized.length >= MIN_ANSWER_LENGTH && normalized.startsWith(normalizedLetter);
}
```

Then compare only valid normalized answers:

```text
normalize both answers
  -> calculate valid/invalid for each
  -> if both valid, compare normalized strings
  -> assign the traditional score
```

Examples for letter `S`:

- `" Srbija "` is valid and normalizes to `"srbija"`.
- `"SRBIJA"` is valid and compares equal to `" Srbija "`.
- `"Slovenija"` and `"Srbija"` are both valid and different, so they score 10/10.
- `"Beograd"` is invalid because it does not start with `S`.
- `"   "` is invalid.
- `"S"` is invalid: one character is the round letter typed back, not an answer.

The results screen must show: **Answers are checked only for the selected starting letter in this Week 3 version. Players are responsible for semantic correctness.** Semantic dictionaries and answer disputes are Stretch, not Core.

## 8. Room state machine

```text
WAITING_FOR_PLAYER
        |
        | Player 2 joins
        v
SYNCHRONIZING
        |
        | both clients acknowledge loaded game screen
        v
COUNTDOWN
        |
        | startsAt reached
        v
ANSWERING
   /                 \
both finish       server deadline
   \                 /
        v
RESULTS
        |
        | room cleanup after five minutes
        v
CLOSED
```

`connected`, `clientReady`, `finished`, and `draftRevision` are per-player properties, not room phases.

### Critical invariants

- A room has no more than two assigned player identities.
- Only the server chooses the letter, round ID, timestamps, phase, validity, and scores.
- Both clients receive identical public round metadata.
- A player never receives the opponent's draft before `RESULTS`.
- A locked player cannot update answers.
- A draft at or after `endsAt` is rejected even if the browser still shows time.
- `closeRound(roundId, reason)` is idempotent.
- Results derive only from locked server state.
- A failed validation leaves canonical state unchanged.
- There is exactly one round per room in Core.

## 9. Architecture

Use one TypeScript repository and one deployed Node.js process:

```text
Computer 1 ---- Socket.IO ----\
                              Node HTTP + Socket.IO service
Computer 2 ---- Socket.IO ----/              |
                                             +-- serves built React/Vite SPA
                                             +-- stores temporary rooms in memory
```

This same-origin topology removes unnecessary CORS and multi-service deployment complexity.

### Planned repository structure

```text
/
├── Plan.md
├── README.md
├── package.json
├── .env.example
├── .github/
│   ├── 00-index.instructions.md
│   ├── copilot-instructions.md
│   └── instructions/
├── docs/
│   ├── GAME_SPEC.md
│   ├── BUILD_PROMPT_V1.md
│   ├── BUILD_PROMPT_FINAL.md
│   ├── CONTEXT_MANIFEST.md
│   ├── EVALS.md
│   ├── EVIDENCE_003.md
│   └── AI_USAGE_LOG.md
├── src/
│   ├── client/
│   │   ├── components/
│   │   ├── screens/
│   │   ├── socket/
│   │   └── state/
│   ├── server/
│   │   ├── rooms/
│   │   ├── socket/
│   │   └── index.ts
│   ├── domain/
│   │   ├── normalize-answer.ts
│   │   ├── validate-answer.ts
│   │   └── score-category.ts
│   └── contracts/
│       ├── game.schemas.ts
│       └── socket.schemas.ts
└── tests/
    ├── unit/
    ├── integration/
    └── helpers/
```

### Layer ownership

- `src/domain`: pure normalization, validation decisions, category scoring, and totals; no network, clock, filesystem, React, or Socket.IO.
- `src/contracts`: strict shared runtime schemas and inferred TypeScript types.
- `src/server`: room membership, identity, synchronization, timestamps, letter selection, private drafts, locks, reveal, scoring, cleanup, health, and static serving.
- `src/client`: screens, local form values, draft acknowledgements, countdown presentation, connection status, and results display.

## 10. Core runtime contracts

Final definitions must be runtime schemas, not TypeScript-only declarations.

```ts
type Category =
  | "country"
  | "city"
  | "river"
  | "mountain"
  | "plant"
  | "animal";

type RoomPhase =
  | "waiting_for_player"
  | "synchronizing"
  | "countdown"
  | "answering"
  | "results"
  | "closed";

// There is no "revealed" or "review" phase. Reveal is an event emitted during
// the transition into "results". Review is Stretch and has no Core phase.

type RoomConfig = {
  roundDurationMs: number;
  countdownMs: number;
  categories: Category[];
  supportedLetters: string[];
  maxAnswerLength: number;
};

type PublicRound = {
  roundId: string;
  letter: string;
  categories: Category[];
  serverNow: number;
  startsAt: number;
  endsAt: number;
};

type DraftUpdate = {
  roundId: string;
  category: Category;
  value: string;
  revision: number;
};

type CategoryScore = {
  player1Points: 0 | 5 | 10;
  player2Points: 0 | 5 | 10;
  reason:
    | "both_different"
    | "same_answer"
    | "only_player_1"
    | "only_player_2"
    | "neither";
};
```

Validate at least `RoomConfig`, create/join requests, `room:client-ready`, drafts, finish events, public projections, reveals, and results. Unknown/extra authority fields are rejected.

## 11. Real-time event protocol

### Client to server

| Event | Payload | Server responsibility |
| --- | --- | --- |
| `room:create` | display name | Create room; bind Player 1; ack the room code and the caller-private resume token |
| `room:join` | room code, display name | Bind Player 2 only when one slot is available |
| `room:client-ready` | current room acknowledgement | Start scheduling only after both current clients acknowledge |
| `round:draft` | round ID, category, value, revision | Validate and privately save latest accepted revision |
| `round:finish` | round ID | Lock caller; close early only when both are locked |

`answer:review` and `round:play-again` are Stretch. Do not implement, emit, or
declare them in Core schemas. Adding them is a scope change, not a refactor.

### Server to client

| Event | Visible content | Privacy rule |
| --- | --- | --- |
| `room:created` | room code, caller's private resume token | Never broadcast token |
| `room:state` | public names and connected/client-ready/finished status | No opponent drafts |
| `round:scheduled` | same letter, categories, server time, start, deadline | Identical public metadata for both |
| `round:draft-ack` | category and accepted revision | Only to submitting player |
| `round:player-finished` | public completion status | No answers |
| `round:revealed` | both locked answer sets and validity states | Only after canonical close |
| `round:results` | category scores, reasons, totals, winner/draw | Server-calculated only |
| `game:error` | stable code and safe message | No stack, token, or hidden data |

Core payloads carry no client-generated `requestId`: the Socket.IO acknowledgement already correlates a request with its response, and the client schemas are strict, so an extra key is rejected. A server-generated request id may still appear in server logs.

Use a typed acknowledgement envelope:

```ts
type Ack<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
```

## 12. Timer, drafts, and race handling

The round cannot depend on each browser submitting at the final millisecond. The client therefore sends debounced private drafts, and sends immediately on field blur and Finish. The server retains the latest accepted revision.

The server sends `serverNow`; each browser estimates an offset and displays:

```ts
remainingMs = Math.max(0, endsAt - estimatedServerNow);
```

This is presentation only. Before any draft or Finish mutation, the server calls an expiration check.

Both end conditions invoke one operation:

```text
closeRound(roundId, reason: "both_finished" | "deadline")
  1. Return without mutation unless this is the current open round.
  2. Mark it closed before other work.
  3. Cancel its deadline timer.
  4. Lock both latest accepted drafts.
  5. Normalize and validate answers.
  6. Emit one reveal.
  7. Resolve unknowns if enabled.
  8. Calculate and emit one result.
```

This finish/deadline race is a mandatory integration test.

## 13. Failure behavior

| Failure | Required behavior |
| --- | --- |
| Invalid or expired room code | Stay on join screen; show safe message |
| Third player attempts to join | Reject; do not change either existing player |
| Malformed payload | Reject with structured error; no partial mutation |
| Wrong room or stale round | Reject; retain current canonical state |
| Draft before start or at/after deadline | Reject with safe timing code |
| Draft after player finished | Reject; preserve locked version |
| Duplicate Finish | Return current lock state; never double-score |
| Finish races deadline | Close, reveal, and score exactly once |
| One player disconnects | Timer continues; retain accepted drafts; show connection status |
| Server restarts | In-memory room is lost; show session-ended/rejoin message |

Full reconnect recovery is optional. Restart durability is explicitly out of scope.

## 14. Week 3 required artifacts

### `docs/GAME_SPEC.md`

Must contain:

- Project name
- Three-to-five-sentence description
- Player objective and controls
- Core loop and round-completion condition
- Five-to-eight key rules
- Minimum visual requirement
- Explicit exclusions
- Verifiable Definition of Done
- Recorded instructor approval for the unusual non-arcade game domain
- Justification that deployment and the minimal real-time backend are necessary for two-computer play, not decorative complexity

Freeze it before the first major implementation prompt.

### `docs/BUILD_PROMPT_V1.md`

Must define the coding-agent role, goal, expected output, forbidden scope, technical context, relevant files, gameplay rules, Definition of Done, allowed edit areas, and checks. It must begin by requiring the agent to:

1. Summarize its understanding.
2. Give a short plan.
3. State ambiguities and assumptions.
4. Avoid expanding scope without explicit reason/approval.

### `docs/CONTEXT_MANIFEST.md`

For each source record: included/excluded, why, priority, and risk. It must make these roles explicit:

- Agreed user requirements and `GAME_SPEC.md`: authoritative behavior
- Week 3 PDF: submission/evidence criteria
- Generic README/instruction pack: structural reference only
- Old chats/random web examples: excluded unless intentionally approved

### Preserved baseline

Before the selected controlled fix, preserve:

- First build prompt and exact context
- Recoverable code state or commit/tag
- Screenshot or recording
- Run/test command and actual output
- First genuine visible problem
- Initial test/eval results

Do not manufacture a defect or overwrite the baseline with the fixed code.

### Structured runtime contract

Show an expected shape, valid example, invalid example, runtime validation, and defined invalid-input behavior. `RoomConfig`, `JoinRoomRequest`, or `DraftUpdate` are good choices. A TypeScript type alone does not qualify.

### `docs/EVALS.md`

Write expectations before execution, then repeat identical cases after one controlled change:

| ID | Scenario | Expected result |
| --- | --- | --- |
| E1 | Player 2 joins and both screens synchronize | Both receive identical `roundId`, letter, `startsAt`, and `endsAt` |
| E2 | Both Finish events occur close to deadline | Close, reveal, and scoring happen exactly once |
| E3 | Third player or malformed/stale draft | Rejected; canonical room state is unchanged |
| E4 | First genuine baseline defect | The observed defect no longer reproduces after the focused fix |

Additionally test every traditional scoring row and the hidden-answer invariant.

### One hypothesis and one controlled change

Record: claim, signal, hypothesis, smallest change, verification, result, and limitation. Change one explanatory variable at a time; do not change the prompt, context, schema, implementation, and criteria simultaneously.

### `docs/EVIDENCE_003.md`

Include baseline claim, selected problem, hypothesis, controlled change, same evals before/after, actual commands/results, known limitation, and both developers' contributions.

### `docs/AI_USAGE_LOG.md`

For each meaningful AI call record phase, reason, expected result, actual result, and next decision. Do not record private chain-of-thought, secrets, tokens, private URLs, or sensitive payloads.

Session 004 artifacts such as `TOOL_CONTRACT.md`, AI hints, tool allowlists, fake providers, and `EVIDENCE_004.md` are intentionally deferred.

### Week 3 AI and pair-work guardrails

- Target no more than 10-15 meaningful coding-agent iterations across the full two-week project unless the instructor changes the limit.
- Do not use parallel AI coding agents for the Core implementation. Parallel human ownership is allowed, but contract design, integration, evals, and review follow the documented driver/observer rotation.
- Before a significant AI call, state what should change and which observable signal will prove it.
- Log the planning and implementation calls that materially affect decisions; do not log private chain-of-thought.
- If the same blocker lasts about 20 minutes, stop widening scope and record the goal, expected behavior, actual behavior, commands/files checked, evidence, and precise question.

## 15. Week 3 acceptance checklist

- [ ] Scope and Definition of Done are clear and small.
- [ ] Instructor approval for this game domain is recorded.
- [ ] Build prompt exists before the first major implementation call.
- [ ] Context Manifest lists included and intentionally excluded context.
- [ ] Baseline is preserved separately from the fixed version.
- [ ] At least one meaningful object has runtime validation.
- [ ] Four or more eval expectations are written before running them.
- [ ] The same evals are repeated after one controlled change.
- [ ] At least one eval captures a genuine baseline problem.
- [ ] The change has a hypothesis, measurable signal, result, and limitation.
- [ ] Both clients receive the same letter and authoritative timestamps.
- [ ] Opponent drafts remain absent before canonical reveal.
- [ ] Both-finish and deadline paths reveal exactly once.
- [ ] Traditional 10/10, 5/5, 10/0, and 0/0 scoring passes.
- [ ] Invalid input leaves canonical state unchanged.
- [ ] Evidence includes real commands, output, screenshots, and both contributions.
- [ ] AI Usage Log explains major calls and resulting decisions.
- [ ] AI usage stays within the documented budget and Core implementation did not use parallel coding agents.
- [ ] No credentials, tokens, private URLs, hidden answers, or sensitive environment data appear in source or evidence.

## 16. Equal two-developer split

Primary ownership enables speed, but contracts, integration, evals, deployment verification, and evidence remain shared. For every joint block, one developer drives while the other checks expectations, diff, and result; swap halfway through.

### Developer A - server and synchronization

- Room creation/join and two-player cap
- Socket-to-player identity and private resume token
- Automatic client-ready handshake
- Server clock, shared scheduling, and letter selection
- Private drafts, revisions, locks, and idempotent closing
- Server integration tests
- Production server, static serving, and health route

### Developer B - client and domain

- Lobby, join, synchronization, countdown, answer, waiting, reveal, and result screens
- Client socket adapter, draft debounce, save indicator, and clock offset
- Pure normalization, validity, scoring, and totals
- Small typed answer bank
- Domain/schema tests and client behavior tests
- Responsive, accessible presentation and safe errors

### Shared work

- Approve `GAME_SPEC.md` and event/runtime contracts
- Review each other's first implementation block
- Integrate locally on two isolated browser sessions
- Execute E1-E4 together and capture evidence
- Test on two physical computers using the deployed URL
- Complete documentation and rehearse the demo

Equal contribution is measured through code, tests, documentation, review, and evidence—not identical commit counts.

## 17. One-day implementation schedule

### Block 0 - 45 minutes: lock scope and evidence setup (paired)

- Obtain/record instructor approval.
- Agree on title, the category set, 6-8 letters, duration, and unknown-answer policy.
- Create/freeze `GAME_SPEC.md`.
- Create `BUILD_PROMPT_V1.md`, `CONTEXT_MANIFEST.md`, `EVALS.md`, and initial `AI_USAGE_LOG.md`.
- Agree on schemas, event names, and Definition of Done.
- Confirm the deployment target supports persistent WebSockets.

Exit: both developers can explain the same state machine and scope.

### Block 1 - 45 minutes: contracts first (paired)

- Scaffold TypeScript, React/Vite, Node/Socket.IO, Zod, and Vitest.
- Implement shared runtime schemas and acknowledgement envelope.
- Implement pure normalization/scoring tests before UI polish.
- Establish fake clock and fixed letter selector test helpers.

Exit: schemas parse valid examples and reject invalid ones at runtime.

### Block 2 - 2 hours: thin vertical slice (parallel ownership)

Developer A:

- Create/join and two-player limit
- Automatic synchronization
- Shared scheduled round
- Safe player-specific room projections

Developer B:

- Lobby/join/synchronization/countdown/form/result shell
- Socket adapter
- Pure normalization, validation, and scoring
- Unit tests and sample answer data

Exit: two local browser windows enter one room and receive one identical scheduled round.

### Block 3 - 1 hour: drafts, finish, timeout, reveal (paired)

- Connect private debounced drafts and acknowledgements.
- Lock on Finish.
- Implement one idempotent deadline/both-finished close path.
- Show waiting, reveal, and result screens.
- Prove opponent drafts do not appear early.

Exit: both-finish and timeout flows work locally.

### Block 4 - 30 minutes: preserve baseline

- Run pre-written evals unchanged.
- Save prompt, context, code state, commands, output, screenshots, and first genuine defect.
- Select one failure for the controlled-change exercise.

Exit: the baseline is recoverable rather than described from memory.

### Block 5 - 1 hour: one controlled change and cross-review

- Write claim, signal, hypothesis, smallest change, and verification first.
- Developer A reviews client/domain; Developer B reviews server/state.
- Swap driver/observer halfway.
- Make the smallest targeted change.
- Repeat the same evals and record actual results.

Exit: the target signal improves without changing the success criteria.

### Block 6 - 1 hour: hardening and full verification

- Complete safe invalid-room, full-room, malformed, stale, late, duplicate-finish, and disconnect behavior.
- Run unit/integration tests, typecheck, lint, and production build.
- Inspect diffs and scan for secrets or hidden-answer logging.

Exit: all required checks pass or a precise blocker is documented.

### Block 7 - 1 hour: deploy and test two computers

- Deploy the single Node service.
- Verify `/healthz`, static assets, and production WebSocket upgrade.
- Complete a full round from two physical computers.
- Verify one letter/timer, private drafts, both-finish, timeout, reveal, and scoring.

Exit: a fresh production room works end to end.

### Block 8 - 45 minutes: evidence and demo

- Finish `EVIDENCE_003.md` and `AI_USAGE_LOG.md`.
- Record both contributions and known limitations.
- Rehearse the game, scope, baseline, controlled change, runtime validation, evals, and deployment.
- Freeze features; accept only release-blocking fixes.

## 18. Test plan

### Domain tests

- Unicode/case/spacing normalization behaves as documented.
- Different valid answers score 10/10.
- Equal normalized valid answers score 5/5.
- Only one valid answer scores 10/0.
- Neither valid scores 0/0.
- Wrong-letter and over-length answers are invalid.

### Contract tests

- Valid room configuration, create, join, client-ready, draft, finish, reveal, and result payloads parse.
- Unknown category, invalid revision, over-length answer, malformed code, missing round ID, and extra authority fields are rejected.
- Invalid startup configuration fails clearly or uses a specifically documented safe fallback.

### Server integration tests

- Exactly two players can join; a third cannot.
- Both loaded clients receive identical scheduled metadata.
- One socket cannot act as the other player.
- Opponent draft data is absent from every pre-reveal event.
- Latest accepted draft revision wins; stale revision is ignored/rejected.
- Finished answers cannot be edited.
- Both finished closes early.
- Deadline closes when one/neither finished.
- Deadline/Finish race closes and scores once.
- Duplicate Finish does not duplicate reveal or points.
- Early, late, malformed, stale-round, and cross-room events do not mutate state.

### Manual checks

- Use two isolated browser profiles during local development.
- Use two physical computers for production acceptance.
- Verify the exact disconnect/reload limitation.
- Check standard desktop and narrow laptop widths.
- Ensure waiting and error states are understandable without developer tools.

## 19. Deployment plan

1. Build the React client into static assets.
2. Compile the TypeScript server.
3. Attach Socket.IO and `/healthz` to one HTTP server.
4. Serve the SPA and its route fallback from that server.
5. Bind to the host-provided `PORT` and public interface.
6. Run exactly one process/replica because rooms are in memory.
7. Configure secrets/settings only in the host or ignored local environment.
8. Verify HTTPS/WSS, health, page refresh, and a two-computer round.

Do not choose a request-only serverless runtime for the active room server. Server restarts losing rooms and lack of horizontal scaling are accepted, documented MVP limitations.

## 20. Risk register and cuts

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Letter reaches one player early | Unfair round | Future shared `startsAt` after both automatic acknowledgements |
| Device clocks differ | Countdown mismatch | `serverNow` offset plus server-only deadline enforcement |
| Finish races deadline | Duplicate result | One idempotent close operation and race integration test |
| Opponent answer leaks | Failed core requirement | Recipient-specific projections and absence assertions |
| Final typed characters are lost | Wrong results | Debounced private drafts plus immediate blur/Finish save |
| Legitimate answer missing | Dispute | Small declared dataset and optional host review |
| Deployment lacks WebSocket | No remote game | Deploy a minimal connection spike early |
| Server restart destroys room | Interrupted session | Document limitation; no database for Week 3 |
| Multiplayer conflicts with brief guidance | Scope concern | Record instructor approval and minimum-infrastructure justification |
| Evidence done from memory | Week 3 failure | Capture artifacts during each block |

If behind, cut in this order:

1. Animations and decorative polish
2. Play Again
3. Sophisticated reconnect
4. Manual unknown-answer review
5. Larger answer bank

Do not cut synchronized time, private answers, two-computer rooms, server scoring, runtime validation, baseline/evals, deployment verification, or evidence.

## 21. Definition of Done

The Week 3 build is done only when:

- Two players on two separate computers can create/join one room.
- Neither sees the letter before the common scheduled countdown.
- Both receive the same round ID, letter, categories, start, and deadline.
- Both can type privately for the same server-controlled duration.
- Finish locks that player's answers.
- Both-finished and timeout paths reveal exactly once.
- Traditional 10/10, 5/5, 10/0, and 0/0 cases pass.
- Server validation controls identity, time, phase, reveal, validity, and score.
- At least one meaningful contract shows valid/invalid runtime behavior.
- Required tests, typecheck, lint, and production build pass.
- The deployed game completes a two-computer smoke test.
- Week 3 documents, recoverable baseline, one controlled change, repeated evals, real outputs, contributions, and AI usage are recorded.
- Known limitations and excluded features are explicit.
- No secret, private token, or opponent draft is exposed in source, logs, client projections, prompts, screenshots, or evidence.

## 22. Immediate next steps

1. Obtain and record instructor approval for the game and its minimum real-time backend.
2. Confirm the title, the category set, 6-8 supported letters, round duration, and unknown-answer policy.
3. Create and approve `docs/GAME_SPEC.md` before application implementation.
4. Create `docs/BUILD_PROMPT_V1.md`, `docs/CONTEXT_MANIFEST.md`, `docs/EVALS.md`, and `docs/AI_USAGE_LOG.md`.
5. Choose a WebSocket-capable deployment target and prove a minimal deployed connection.
6. Implement shared runtime schemas and pure scoring tests.
7. Build create/join/automatic synchronization/shared countdown as the first vertical slice.
8. Add private drafts, Finish, deadline, reveal, and scoring.
9. Preserve the first integrated baseline and perform one evidence-backed controlled fix.
10. Run the full matrix, deploy, test two physical computers, finish evidence, and stop adding features.
