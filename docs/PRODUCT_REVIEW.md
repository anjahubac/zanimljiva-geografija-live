# Product review — 2026-09-22

Reviewed against `Plan.md`, `docs/GAME_SPEC.md`, the implementation and tests.
The starting working tree was clean at commit
`481535a9065852ad9001719f96de2a73ebe399b3`.

## What is implemented

| Requirement | Evidence / status |
| --- | --- |
| Two-player rooms, create/join code | Room store and Socket.IO handlers; lifecycle/rejection tests |
| Both-client readiness, common countdown/letter/deadline | One server schedule, E1 integration tests |
| Nine categories, 150-second default round | Shared constants and config; current spec amendments |
| Private drafts and monotonic revisions | Recipient projections and privacy integration tests |
| Finish locks, timeout, one canonical reveal/result | `closeRound`, E2/race tests |
| Traditional category and total scoring | Pure domain functions and scoring tests |
| Runtime schemas and malformed-input rejection | Zod contracts, E3 and contract tests |
| Serbian game screens and paper-sheet presentation | Seven screens, responsive CSS, reducer tests |
| Production build, static serving, health endpoint | Existing Node service; not evidence of a deployed acceptance test |
| Week 3 document scaffolding | Present, but baseline/E4/controlled-change evidence incomplete |

The original build passed `npm run verify`: 223 tests across 13 files,
typecheck, lint and both builds. The first sandboxed run could not open local
test servers; the successful run used the required local-port permission.

## Requested extension implemented in this change

Real username/password accounts, expiring server sessions, a player profile,
lifetime points/game/win counts, and paginated personal answer history. Login
works from different devices against the same server. Each row contains the
round date, letter, opponent display name, own answers and per-category points,
outcome, own total and opponent total. Historical totals use stored results,
not recalculation under potentially changed future rules.

History is private to the authenticated owner and starts with rounds completed
after this extension; old in-memory rounds cannot be recovered. Guests can
still play using room codes. Account players get their display name and identity
from the session, even if a browser submits a different name. One account cannot
join both sides of one room. Duplicate room creation returns the existing room
rather than replacing the socket's membership.

SQLite uses the existing single Node process and a persistent disk. The built-in
SQLite module requires Node >=22.13.0; no new npm package or external service is
introduced. Passwords use asynchronous scrypt and unique random salts. Only
hashed session tokens are stored; browser session cookies are HttpOnly,
SameSite=Strict and Secure in production. Authentication has bounded request
size, attempts and concurrent password work. No password reset/email/social
provider is included in this first account implementation.

Completed rounds are saved transactionally with a unique `(accountId, roundId)`
key. If a write fails, gameplay results still arrive and cleanup retries the
stored snapshot without rescoring. A process crash before a failed write is
retried can still lose that history; persistent storage health and backups
remain operational requirements.

The sheet container grows from 74rem to 100rem, with fixed table columns and
wrapping for long answers. Small screens retain a scrollable results/history
region and stacked answer inputs. A narrow phone cannot display eleven readable
columns simultaneously; horizontal scrolling stays inside the table.

## Improvements to prioritize

1. **Finish the release evidence.** Instructor approval, the full preserved
   baseline, genuine E4 defect, one controlled change and repeated evaluations,
   screenshots, contributions and deployed two-computer acceptance remain
   unrecorded. Passing automated tests does not complete these checklist items.
2. **Recover from interruptions.** `markDisconnected` clears the socket binding,
   and the client disables reconnection. Refresh/network loss abandons a round.
   Add server-authenticated reattachment before public matchmaking.
3. **Clean up rooms stuck before countdown.** Cleanup only expires
   `waiting_for_player` and completed rooms. If a player disconnects in
   `synchronizing`, that room has no active-round deadline and no applicable TTL.
   Add a synchronization timeout and explicit cancellation behavior.
4. **Bound acknowledgement waits and display round errors.** The client socket
   adapter has no acknowledgement timeout. A connection loss can leave pending
   actions unresolved. Global errors are stored, but answering/waiting screens
   do not render that error text. Add timeout/retry UX with revision-safe handling.
5. **Decide how to judge actual geography before competitive play.** Today any
   normalized answer with at least two characters and the correct first letter
   can score, even an invented word. This is intentional Core behavior but weak
   for strangers, rankings or meaningful competitive records. Agree on an
   explicit validation/dispute policy before changing scoring.
6. **Keep docs aligned.** README had obsolete six-category/90-second text and
   claimed gameplay did not exist. Plan's status was stale. This change updates
   those entry points; some historical module examples still show the original
   constants and should be routed through the authoritative shared schemas.

## Recommendation: friends plus optional random opponents

Yes: offer two explicit actions after login, **Play with friends** and
**Find an opponent**. Never enqueue someone just because they logged in.
Keep friend rooms private and separate from the public queue.

Start with a simple FIFO queue of authenticated, connected, idle players. Match
people by waiting order rather than rating; low early traffic makes a rating
filter counterproductive. One account may occupy at most one queue entry or
active match, including across tabs. Cancel/disconnect removes an entry.
Pairing atomically removes both entries and creates an ordinary two-player
room; both clients must still acknowledge readiness before the letter is chosen.
Show a waiting state with Cancel; never invent an opponent or silently use a bot.

Implement after reconnect/cancellation and an answer-validity decision. Required
acceptance cases: 3/4 simultaneous entrants; duplicate tabs; cancel/pair races;
disconnect before pairing/readiness; queue re-entry; no friend-room leakage;
identical scheduled metadata; one opponent and one history result per player.
Matchmaking is a recommendation only in this change.

## Verification limits

No browser connection was available (`browsers.list()` returned an empty list).
Visual checks at 1280×720 and 360px and a two-browser user journey remain manual.
No deployment, push or pull request was performed.
