# Data model: Letters from the whole alphabet

All state is in memory, as before.

## Alphabet (`Language`: `"sr" | "en"`)

| Alphabet | Letters, in order | Count |
| --- | --- | ---: |
| `sr` | A B C Č Ć D Dž Đ E F G H I J K L Lj M N Nj O P R S Š T U V Z Ž | 30 |
| `en` | A B C D E F G H I J K L M N O P Q R S T U V W X Y Z | 26 |

`Letter` is the union of both: 34 distinct values. `letterSchema` accepts exactly
those, in this capitalisation (`Lj`, not `LJ` or `lj`).

**Digraph exclusions (Serbian only):** `L` excludes `Lj…`, `N` excludes `Nj…`, `D` excludes `Dž…`.

## Room (server)

| Field | Change |
| --- | --- |
| `alphabet: Language` | **new**. Set once when the room is opened, from the opener's language; never changed. |

## Round (server)

| Field | Change |
| --- | --- |
| `letter: Letter` | now drawn from `ALPHABETS[room.alphabet]` |
| `alphabet: Language` | **new**, copied from the room, so round-level code needs no room lookup |

## Quick-play queue entry (server)

| Field | Change |
| --- | --- |
| `language: Language` | **new**. The waiting player's language; it becomes the room's alphabet on a match. |

## State transitions

None change. The alphabet is fixed at `waiting_for_player` (friend, queue) or
`synchronizing` (AI) and read at `scheduleRound`, in the bot turn, on a hint
and in `closeRound`.
