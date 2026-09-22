import { useReducer } from "react";
import { CATEGORIES, type Category, type PlayerSlot } from "@contracts/game.schemas";
import type {
  PlayerFinished,
  RoomState,
  RoundResults,
  RoundRevealed,
  RoundScheduled,
} from "@contracts/socket.schemas";

/** Per-field synchronization status, shown next to every input. */
export type DraftStatus = "empty" | "pending" | "saved" | "rejected";

export type Screen =
  | "lobby"
  | "join"
  | "searching"
  | "waiting"
  | "countdown"
  | "answering"
  | "waiting_for_opponent"
  | "results";

export type GameState = {
  connected: boolean;
  /** Which entry step the player is on before a room exists. */
  entry: "lobby" | "join" | "searching";
  roomCode: string | null;
  you: PlayerSlot | null;
  room: RoomState | null;
  round: RoundScheduled | null;
  /** serverNow - Date.now() at the moment the round arrived; presentation only. */
  clockOffsetMs: number;
  answers: Record<Category, string>;
  draftStatus: Record<Category, DraftStatus>;
  revisions: Record<Category, number>;
  finished: boolean;
  opponentFinished: boolean;
  revealed: RoundRevealed | null;
  results: RoundResults | null;
  errorMessage: string | null;
  /** Error shown next to a specific field, not only as a banner. */
  fieldError: Partial<Record<Category, string>>;
  busy: boolean;
};

export type GameAction =
  | { type: "connection"; connected: boolean }
  | { type: "entry"; entry: "lobby" | "join" | "searching" }
  | { type: "joined"; roomCode: string; you: PlayerSlot }
  | { type: "room-state"; payload: RoomState }
  | { type: "round-scheduled"; payload: RoundScheduled; receivedAt: number }
  | { type: "player-finished"; payload: PlayerFinished }
  | { type: "revealed"; payload: RoundRevealed }
  | { type: "results"; payload: RoundResults }
  | { type: "answer-changed"; category: Category; value: string }
  | { type: "draft-sent"; category: Category; revision: number }
  | { type: "draft-accepted"; category: Category; revision: number }
  | { type: "draft-rejected"; category: Category; message: string }
  | { type: "finish-accepted" }
  | { type: "busy"; busy: boolean }
  | { type: "error"; message: string | null };

const emptyByCategory = <T,>(value: T): Record<Category, T> =>
  Object.fromEntries(CATEGORIES.map((category) => [category, value])) as Record<Category, T>;

export const initialGameState: GameState = {
  connected: false,
  entry: "lobby",
  roomCode: null,
  you: null,
  room: null,
  round: null,
  clockOffsetMs: 0,
  answers: emptyByCategory(""),
  draftStatus: emptyByCategory<DraftStatus>("empty"),
  revisions: emptyByCategory(0),
  finished: false,
  opponentFinished: false,
  revealed: null,
  results: null,
  errorMessage: null,
  fieldError: {},
  busy: false,
};

/**
 * One reducer over server events. It holds no canonical logic: phase, timing,
 * validity and points all arrive from the server. It also never stores an
 * opponent answer — the only place those exist is `revealed`, which the server
 * sends after the canonical close.
 */
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "connection":
      return {
        ...state,
        connected: action.connected,
        errorMessage: action.connected ? state.errorMessage : "Veza sa serverom je prekinuta.",
      };

    case "entry":
      return { ...state, entry: action.entry, errorMessage: null };

    case "joined":
      return { ...state, roomCode: action.roomCode, you: action.you, errorMessage: null };

    case "room-state":
      return {
        ...state,
        room: action.payload,
        roomCode: action.payload.roomCode,
        you: action.payload.you,
        finished:
          action.payload.players.find((player) => player.slot === action.payload.you)?.finished ??
          state.finished,
        opponentFinished:
          action.payload.players.find((player) => player.slot !== action.payload.you)?.finished ??
          state.opponentFinished,
      };

    case "round-scheduled":
      return {
        ...state,
        round: action.payload,
        // Offset lets the browser estimate server time; the server still
        // decides whether any mutation is early, current or late.
        clockOffsetMs: action.payload.serverNow - action.receivedAt,
        revealed: null,
        results: null,
      };

    case "player-finished":
      return action.payload.slot === state.you
        ? { ...state, finished: true }
        : { ...state, opponentFinished: true };

    case "revealed":
      return { ...state, revealed: action.payload };

    case "results":
      return { ...state, results: action.payload };

    case "answer-changed":
      return {
        ...state,
        answers: { ...state.answers, [action.category]: action.value },
        draftStatus: { ...state.draftStatus, [action.category]: "pending" },
        fieldError: { ...state.fieldError, [action.category]: undefined },
      };

    case "draft-sent":
      return {
        ...state,
        revisions: { ...state.revisions, [action.category]: action.revision },
        draftStatus: { ...state.draftStatus, [action.category]: "pending" },
      };

    case "draft-accepted":
      // A late acknowledgement for an older revision must not mark a newer
      // edit as saved.
      return action.revision < state.revisions[action.category]
        ? state
        : {
            ...state,
            draftStatus: { ...state.draftStatus, [action.category]: "saved" },
            fieldError: { ...state.fieldError, [action.category]: undefined },
          };

    case "draft-rejected":
      return {
        ...state,
        draftStatus: { ...state.draftStatus, [action.category]: "rejected" },
        fieldError: { ...state.fieldError, [action.category]: action.message },
      };

    case "finish-accepted":
      // Only an accepted acknowledgement locks the form, never an optimistic click.
      return { ...state, finished: true, busy: false };

    case "busy":
      return { ...state, busy: action.busy };

    case "error":
      return { ...state, errorMessage: action.message };

    default:
      return state;
  }
}

/** The screen is derived from server phase, never stored as its own truth. */
export function selectScreen(state: GameState): Screen {
  if (!state.roomCode || !state.room) return state.entry;

  switch (state.room.phase) {
    case "waiting_for_player":
    case "synchronizing":
      return "waiting";
    case "countdown":
      return "countdown";
    case "answering":
      return state.finished ? "waiting_for_opponent" : "answering";
    case "results":
    case "closed":
      return "results";
    default:
      return "waiting";
  }
}

export function useGameState() {
  return useReducer(gameReducer, initialGameState);
}
