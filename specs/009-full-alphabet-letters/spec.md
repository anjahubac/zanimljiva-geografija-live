# Feature Specification: Letters from the whole alphabet

**Feature Branch**: `main` (no feature branch; the owner has not asked for one)

**Created**: 2026-09-30

**Status**: Built 2026-09-30 and committed on main (`4dea3b5`); live smoke ran 2026-10-07 (`docs/AI_EVALS.md`).

**Input**: User description: "Update so we can get any letter from azbuka if we're on serbian, if we're on english, we get any letter from alphabet." Open questions decided by the owner the same day and recorded in `Plan.md` §2B.13.

**Source of truth**: `Plan.md` §2B.13 (decision), `docs/GAME_SPEC.md` Amendment 7 and §5 (rules).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Serbian game draws from the whole Serbian alphabet (Priority: P1)

A player whose interface is in Serbian opens a game (a friend room, a random
match in which they were waiting first, or a game against the AI). The round
letter can be any of the 30 letters of the Serbian Latin alphabet, not only
A, B, D, K, M, S, V. Both players see the same letter.

**Why this priority**: This is the request. Without it nothing changes.

**Independent Test**: Open many Serbian rooms with the real letter picker and
confirm that every letter drawn is one of the 30, that letters outside the old
seven appear, and that no English-only letter (Q, W, X, Y) appears.

**Acceptance Scenarios**:

1. **Given** a player on the Serbian interface, **When** they create a friend room and the round starts, **Then** the letter is one of A B C Č Ć D Dž Đ E F G H I J K L Lj M N Nj O P R S Š T U V Z Ž, and both players receive the same letter.
2. **Given** a Serbian room whose letter is Lj, **When** a player writes "Ljubljana" for Grad, **Then** the answer passes the letter rule.
3. **Given** a Serbian room whose letter is L, **When** a player writes "Ljubljana", **Then** the answer is rejected for the wrong letter, and "London" is accepted.
4. **Given** a Serbian room whose letter is N, **When** a player writes "Njemačka", **Then** it is rejected for the wrong letter; **and given** the letter D, "Džakarta" is rejected while "Danska" is accepted.
5. **Given** a Serbian room whose letter is Š, **When** a player writes "Šabac", **Then** it passes the letter rule, and "Sabac" does not (diacritics are respected, as today).

---

### User Story 2 - An English game draws from the whole English alphabet (Priority: P1)

A player whose interface is in English opens a game. The round letter can be
any of the 26 letters A–Z. There is no digraph rule: with the letter L,
"Ljubljana" counts.

**Why this priority**: The same request, for the other language.

**Independent Test**: Open many English rooms and confirm every letter drawn is
one of A–Z, that Q, W, X or Y can appear, and that no Serbian-only letter
(Č, Ć, Dž, Đ, Lj, Nj, Š, Ž) appears.

**Acceptance Scenarios**:

1. **Given** a player on the English interface, **When** they open a game, **Then** the letter is one of A–Z.
2. **Given** an English room whose letter is L, **When** a player writes "Ljubljana", **Then** it passes the letter rule.
3. **Given** an English room whose letter is C, **When** a player writes "Čačak", **Then** it is rejected for the wrong letter (diacritics respected), and "Cairo" is accepted.

---

### User Story 3 - The room's alphabet follows the player who opened it (Priority: P1)

The two players may use different interface languages. The room's alphabet is
the language of the player who opened it, and it is fixed when the room is
opened.

**Why this priority**: Without one rule the two players could not agree on a
letter set, and the server could not choose a letter.

**Independent Test**: Open rooms in each mode with the opener on one language
and the second player on the other, and check which alphabet the letter comes
from.

**Acceptance Scenarios**:

1. **Given** a creator on Serbian and a joiner on English, **When** the round starts, **Then** the letter comes from the Serbian alphabet.
2. **Given** a random match where the waiting player is on English and the arriving player on Serbian, **When** they are matched, **Then** the letter comes from the English alphabet.
3. **Given** a player on Serbian who plays against the AI, **When** the round starts, **Then** the letter comes from the Serbian alphabet.
4. **Given** a room already opened in Serbian, **When** the creator switches the interface to English before or during the round, **Then** the room's alphabet does not change.
5. **Given** a request to open a room with a language other than Serbian or English, or without one, **Then** it is refused like any other malformed request, and no room is created.

---

### User Story 4 - The AI opponent and hints follow the round's alphabet (Priority: P2)

The AI opponent's answers and the terms behind hints must fit the round's
letter under the same rule the players are judged by.

**Why this priority**: The game still works if the bot leaves a letter blank,
but a bot or a hint that ignores the digraph rule, or that cannot answer an
English-only letter, makes the new letters feel broken.

**Independent Test**: With a scripted AI, check that a bot answer or hint term
that breaks the round's letter rule is discarded (the bot's cell left blank;
the hint not charged), and that the AI is told the round's alphabet.

**Acceptance Scenarios**:

1. **Given** a Serbian round with the letter L, **When** the AI opponent answers "Ljubljana" for Grad, **Then** that answer is blanked before the round is judged.
2. **Given** an English round with the letter W, **When** the AI opponent answers "Washington", **Then** the answer is kept.
3. **Given** a Serbian round with the letter N, **When** a hint's hidden term is "Njemačka", **Then** the clue is discarded and the player is not charged.
4. **Given** an English round with the letter W, **When** a hint's hidden term has an English name starting with W, **Then** the clue is accepted even if the Serbian name starts differently.

### Edge Cases

- **Letters with few or no terms** (Q, X, Đ, Dž, Nj …): accepted by the owner. The round runs as usual; a hint may answer "no known term" and costs nothing, as today.
- **The AI checker's recognised name**: the letter is judged on the recognised name closest to what the player wrote, as today, with the room's digraph rule applied. "Dzakarta" in a Serbian D round is recognised as Džakarta and rejected for the wrong letter.
- **The AI is unavailable**: the local rule alone decides, with the room's digraph rule; the results say the round was not verified, as today.
- **Same answer, different spellings**: unchanged; "Srbija" and "Serbia" are still the same answer when the AI recognises them.
- **Answers without diacritics in a diacritic round** (e.g. "Sabac" when the letter is Š): rejected, as today. This affects more rounds now that Č, Ć, Š, Ž, Đ and Dž can be drawn.
- **Letter shown on screen**: Lj, Nj and Dž are shown as two characters (first upper, second lower).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every room MUST have an alphabet, Serbian or English, fixed when the room is opened and never changed afterwards.
- **FR-002**: The alphabet MUST be the interface language of the player who opened the room: the creator of a friend room, the player facing the AI, or the player already waiting in the random queue when the match is made.
- **FR-003**: Opening a room (friend, random queue, AI) MUST carry the opener's language; a request without it, or with any value other than Serbian or English, MUST be refused as malformed without changing any state.
- **FR-004**: The server MUST draw the round letter uniformly at random from the room's alphabet: the 30 Serbian Latin letters A B C Č Ć D Dž Đ E F G H I J K L Lj M N Nj O P R S Š T U V Z Ž, or the 26 English letters A–Z.
- **FR-005**: The letter MUST still be chosen only after both seats are ready, and both players MUST receive the identical letter (unchanged).
- **FR-006**: An answer passes the letter rule when, after normalization and ignoring letter case, it starts with the round letter, with diacritics respected (unchanged).
- **FR-007**: In a Serbian-alphabet room, an answer MUST NOT pass the letter rule for L if it starts with Lj, for N if it starts with Nj, or for D if it starts with Dž.
- **FR-008**: In an English-alphabet room there MUST be no digraph exclusion.
- **FR-009**: The same letter rule (FR-006 to FR-008) MUST apply everywhere the letter is checked: the local rule, the check of the AI checker's recognised name, the AI opponent's answers, and the hint's hidden term.
- **FR-010**: The AI opponent and the hint MUST be told the round's alphabet and the digraph rule, so they can offer terms that fit; their output is still checked by code (FR-009) and not trusted.
- **FR-011**: A hint term MUST fit the round letter under its Serbian name in a Serbian-alphabet room, and under either its Serbian or its English name in an English-alphabet room.
- **FR-012**: The rules and scoring otherwise stay as they are: at least two characters, answers accepted in Serbian or English, the AI checker, hints, and 10/5/0 scoring.
- **FR-013**: Room codes, round timing, privacy of answers before the reveal and close-exactly-once MUST be unaffected.

### Key Entities

- **Alphabet**: Serbian (30 letters, Latin script, with the digraphs Lj, Nj, Dž) or English (26 letters). It belongs to a room.
- **Round letter**: one letter of the room's alphabet, possibly two characters long (Lj, Nj, Dž).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Over a large sample of Serbian rooms, all 30 Serbian letters are drawn and no other; over a large sample of English rooms, all 26 English letters are drawn and no other.
- **SC-002**: In 100% of tested rooms, the alphabet matches the opener's language, including when the second player's language differs.
- **SC-003**: Every digraph case listed in the acceptance scenarios is judged as specified, with the AI available and with the AI unavailable.
- **SC-004**: All existing game evals (the synchronized round, privacy before reveal, close exactly once, A1–A6) still pass unchanged in intent.

## Assumptions

- The Serbian alphabet is used in Latin script, matching the interface and answers; Cyrillic input remains out of scope (`Plan.md` §4).
- The English interface's letter set does not change what answers are accepted: an English room still accepts Serbian answers and vice versa.
- A player who switches language after opening a room keeps the room's original alphabet; the letter set is not shown separately on screen, since the letter itself is shown.
- Changing the bot and hint prompts gives them new version ids; the live AI evals (W4-7) have not been run yet, so there is no earlier live baseline to invalidate.
- Uniform randomness per letter is enough; letters are not weighted by how many terms they have.
