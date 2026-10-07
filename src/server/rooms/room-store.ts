import { randomUUID } from "node:crypto";
import {
  BOT_DISPLAY_NAME,
  CATEGORIES,
  HINTS_PER_ROUND,
  type Category,
  type ClosedReason,
  type Language,
  type Letter,
  type PlayerSlot,
  type RejectReason,
  type RoomPhase,
  type ServerConfig,
} from "@contracts/game.schemas";
import { type Ack, fail, ok } from "@contracts/errors";
import type { CoachReport, CoachRequest } from "@contracts/coach.schemas";
import {
  SERVER_EVENTS,
  type DraftAck,
  type DraftRequest,
  type FinishAck,
  type HintAck,
  type HintRequest,
  type PlayerFinished,
  type RevealedAnswer,
  type RoomState,
  type RoundRevealed,
  type RoundResults,
  type RoundScheduled,
  hintAckSchema,
  playerFinishedSchema,
  roomStateSchema,
  roundRevealedSchema,
  roundResultsSchema,
  roundScheduledSchema,
} from "@contracts/socket.schemas";
import { normalizeAnswer } from "@domain/normalize-answer";
import { checkAnswerLocally } from "@domain/validate-answer";
import { scoreJudgedRound } from "@domain/score-round";
import type { JudgedAnswer } from "@domain/score-category";
import type { AiService } from "@server/ai/service";
import type { UsageLimits } from "@server/usage-limits";
import type { Cancel, Clock, Scheduler } from "@server/clock";
import { answerKey, type CheckVerdicts } from "@server/features/check-round";
import { generateResumeToken, generateRoomCode, generateRoundId } from "@server/ids";
import { runCoach, type CoachRunOutcome } from "@server/agent/coach-agent";
import { consoleRunLog, type RunLogSink } from "@server/agent/run-log";
import type { FocusEntry } from "@server/agent/tools";
import type { LetterSelector } from "@server/letters";

/* ------------------------------------------------------- internal state */

type Draft = { value: string; revision: number };

/**
 * Internal only. Holds both players' drafts and both private resume tokens, so
 * it is never serialized to a client: every outbound payload goes through a
 * per-recipient projection below (module 01).
 */
type Player = {
  slot: PlayerSlot;
  displayName: string;
  /** The server's AI opponent: no socket, always connected and ready (§2B.3). */
  bot: boolean;
  socketId: string | null;
  resumeToken: string;
  connected: boolean;
  clientReady: boolean;
  finished: boolean;
  drafts: Record<Category, Draft>;
  /** Snapshot taken when this player locks; the round scores from this, not from drafts. */
  lockedAnswers: Record<Category, string> | null;
  /** Categories this player received a clue for in the current round (§2B.8). */
  hinted: Set<Category>;
  hintPending: boolean;
  /**
   * The round coach (§2C), one run per player per round: running (later
   * requests join it) or done (later requests get the same report).
   */
  coach: CoachState | null;
};

type CoachState =
  | { state: "running"; roundId: string; promise: Promise<CoachRunOutcome>; controller: AbortController }
  | { state: "done"; roundId: string; report: CoachReport };

/** The bot's side of a round. Its answers stay here, unseen, until it finishes. */
type BotTurn = {
  status: "thinking" | "ready" | "failed";
  answers: Record<Category, string> | null;
  finishAt: number;
  /** Its finish time came while the AI was still answering: finish on arrival. */
  finishWhenReady: boolean;
  cancelFinish: Cancel | null;
};

type Round = {
  roundId: string;
  letter: Letter;
  /** The room's alphabet, copied so round code needs no room lookup (§2B.13). */
  alphabet: Language;
  startsAt: number;
  endsAt: number;
  closed: boolean;
  /** Reveal and results were emitted. Set once, by `completeRound`. */
  revealed: boolean;
  cancelStart: Cancel | null;
  cancelDeadline: Cancel | null;
  cancelJudgeTimeout: Cancel | null;
  bot: BotTurn | null;
  /** The reveal both players saw, kept read-only for the round coach (§2C, research R11). */
  reveal: RoundRevealed | null;
};

export type Room = {
  roomCode: string;
  phase: RoomPhase;
  /** The opener's language, fixed for the room; the letter comes from it (§2B.13). */
  alphabet: Language;
  createdAt: number;
  /** Sparse until player 2 joins; never grows past two entries. */
  players: Partial<Record<PlayerSlot, Player>>;
  round: Round | null;
  resultsAt: number | null;
};

/* ------------------------------------------------------------ deliveries */

/**
 * The store never touches Socket.IO. It hands back addressed payloads and the
 * socket layer performs the send, which is what makes the whole state machine
 * testable without a transport (and what lets a deadline timer, with no request
 * in flight, still reach both players).
 */
export type Delivery =
  | { socketId: string; event: typeof SERVER_EVENTS.roomState; payload: RoomState }
  | { socketId: string; event: typeof SERVER_EVENTS.roundScheduled; payload: RoundScheduled }
  | { socketId: string; event: typeof SERVER_EVENTS.playerFinished; payload: PlayerFinished }
  | { socketId: string; event: typeof SERVER_EVENTS.roundRevealed; payload: RoundRevealed }
  | { socketId: string; event: typeof SERVER_EVENTS.roundResults; payload: RoundResults };

export type RoomStoreDeps = {
  clock: Clock;
  scheduler: Scheduler;
  selectLetter: LetterSelector;
  config: ServerConfig;
  deliver: (delivery: Delivery) => void;
  /** Absent when no AI key is configured: rounds use the local rule, and there is no bot or hint. */
  ai?: AiService | null;
  /** Per-visitor and daily AI bounds (§2B.11); absent means unbounded, as in most unit tests. */
  limits?: UsageLimits | null;
  /** The bot's choices; injected so tests are deterministic. */
  random?: () => number;
  /** Where each coach run's `agent.run` record goes; the console by default. */
  runLog?: RunLogSink;
};

export type CreateRoomResult = { room: Room; resumeToken: string; slot: PlayerSlot };
export type JoinRoomResult = CreateRoomResult;

export type QuickPlayResult =
  | { status: "queued" }
  | { status: "matched"; room: Room; resumeToken: string; slot: PlayerSlot };

export type RoomStore = {
  /** `alphabet` is the opener's language; the room's letters come from it (§2B.13). */
  createRoom(displayName: string, socketId: string, alphabet: Language): CreateRoomResult;
  joinRoom(roomCode: string, displayName: string, socketId: string): Ack<JoinRoomResult>;
  /** On a match, the waiting player's language becomes the room's alphabet. */
  quickPlay(displayName: string, socketId: string, alphabet: Language): Ack<QuickPlayResult>;
  cancelQuickPlay(socketId: string): void;
  /** `visitor` is the client address the limits count against; the socket id when absent. */
  createAiRoom(displayName: string, socketId: string, alphabet: Language, visitor?: string): Ack<CreateRoomResult>;
  queueLength(): number;
  markClientReady(roomCode: string, socketId: string): Ack<{ accepted: true }>;
  applyDraft(input: DraftRequest, socketId: string): Ack<DraftAck>;
  finish(roundId: string, socketId: string): Ack<FinishAck>;
  requestHint(input: HintRequest, socketId: string, visitor?: string): Promise<Ack<HintAck>>;
  /** Week 5 (§2C). Null: the run was cancelled because the caller left or the room was reaped; send nothing. */
  requestCoach(input: CoachRequest, socketId: string, visitor?: string): Promise<Ack<CoachReport> | null>;
  closeRound(roundId: string, reason: ClosedReason): void;
  projectRoomState(room: Room, slot: PlayerSlot): RoomState;
  markDisconnected(socketId: string): void;
  getRoomByCode(roomCode: string): Room | undefined;
  getRoomBySocket(socketId: string): Room | undefined;
  cleanup(): void;
};

const MAX_ROOM_CODE_ATTEMPTS = 50;

/**
 * Longest the room waits for the AI check before scoring with the local rule.
 * Above the gateway's own 18 s budget, so this only fires if the service
 * itself never answers.
 */
export const JUDGE_TIMEOUT_MS = 20_000;

/** The bot keeps 5-7 of its 8 answers and finishes at 55-85% of the round. */
export const BOT_MIN_KEPT = 5;
export const BOT_MAX_KEPT = 7;
export const BOT_FINISH_FROM = 0.55;
export const BOT_FINISH_TO = 0.85;

const emptyDrafts = (): Record<Category, Draft> =>
  Object.fromEntries(CATEGORIES.map((category) => [category, { value: "", revision: 0 }])) as Record<
    Category,
    Draft
  >;

const blankSheet = (): Record<Category, string> =>
  Object.fromEntries(CATEGORIES.map((category) => [category, ""])) as Record<Category, string>;

/** Every AI call, of any operation, counts toward today's budget (§2B.11). */
function countedAi(ai: AiService, limits: UsageLimits, clock: Clock): AiService {
  return {
    checkRound(letter, alphabet, sheets) {
      limits.countCall(clock.now());
      return ai.checkRound(letter, alphabet, sheets);
    },
    botAnswers(letter, alphabet) {
      limits.countCall(clock.now());
      return ai.botAnswers(letter, alphabet);
    },
    hint(letter, alphabet, category, language) {
      limits.countCall(clock.now());
      return ai.hint(letter, alphabet, category, language);
    },
    // Each coach model step is one call, whatever its retries (§2C.8).
    coachStep(input, options) {
      limits.countCall(clock.now());
      return ai.coachStep(input, options);
    },
  };
}

export function createRoomStore(deps: RoomStoreDeps): RoomStore {
  const { clock, scheduler, selectLetter, config, deliver } = deps;
  const limits = deps.limits ?? null;
  const ai = deps.ai && limits ? countedAi(deps.ai, limits, clock) : (deps.ai ?? null);
  const random = deps.random ?? Math.random;
  const runLog = deps.runLog ?? consoleRunLog;

  const rooms = new Map<string, Room>();
  const roomCodeBySocket = new Map<string, string>();
  const roomCodeByRound = new Map<string, string>();
  /** Players waiting for a random opponent, oldest first. */
  const waiting: { socketId: string; displayName: string; alphabet: Language }[] = [];

  /* ------------------------------------------------------------ helpers */

  function playersOf(room: Room): Player[] {
    return [room.players[1], room.players[2]].filter((player): player is Player => Boolean(player));
  }

  function findPlayerBySocket(room: Room, socketId: string): Player | undefined {
    return playersOf(room).find((player) => player.socketId === socketId);
  }

  function nextRoomCode(): string {
    for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt += 1) {
      const code = generateRoomCode();
      if (!rooms.has(code)) return code;
    }
    throw new Error("Could not allocate an unused room code");
  }

  function createPlayer(slot: PlayerSlot, displayName: string, socketId: string | null, bot = false): Player {
    return {
      slot,
      displayName,
      bot,
      socketId,
      resumeToken: generateResumeToken(),
      connected: true,
      clientReady: bot,
      finished: false,
      drafts: emptyDrafts(),
      lockedAnswers: null,
      hinted: new Set(),
      hintPending: false,
      coach: null,
    };
  }

  /**
   * The only place an outbound room payload is built. Parsing through the
   * strict schema means an accidentally added internal field throws here
   * instead of leaking to a browser.
   */
  function projectRoomState(room: Room, slot: PlayerSlot): RoomState {
    return roomStateSchema.parse({
      roomCode: room.roomCode,
      phase: room.phase,
      you: slot,
      players: playersOf(room).map((player) => ({
        slot: player.slot,
        displayName: player.displayName,
        connected: player.connected,
        clientReady: player.clientReady,
        finished: player.finished,
        bot: player.bot,
      })),
    });
  }

  function broadcastRoomState(room: Room): void {
    for (const player of playersOf(room)) {
      if (!player.socketId) continue;
      deliver({
        socketId: player.socketId,
        event: SERVER_EVENTS.roomState,
        payload: projectRoomState(room, player.slot),
      });
    }
  }

  function lockedAnswersOf(player: Player): Record<Category, string> {
    return Object.fromEntries(
      CATEGORIES.map((category) => [category, player.drafts[category].value]),
    ) as Record<Category, string>;
  }

  /** Still the room's current, open round, after an await. */
  function isOpen(room: Room, roundId: string): boolean {
    return rooms.get(room.roomCode) === room && room.round?.roundId === roundId && !room.round.closed;
  }

  /* ------------------------------------------------- round scheduling */

  function scheduleRound(room: Room): void {
    const serverNow = clock.now();
    const startsAt = serverNow + config.countdownMs;
    const endsAt = startsAt + config.roundDurationMs;
    const roundId = generateRoundId();

    room.round = {
      roundId,
      letter: selectLetter(room.alphabet),
      alphabet: room.alphabet,
      startsAt,
      endsAt,
      closed: false,
      revealed: false,
      cancelStart: null,
      cancelDeadline: null,
      cancelJudgeTimeout: null,
      bot: null,
      reveal: null,
    };
    room.phase = "countdown";
    roomCodeByRound.set(roundId, room.roomCode);

    room.round.cancelStart = scheduler.schedule(startsAt, () => {
      // Presentation unlocks at startsAt on both clients; the server flips the
      // phase itself so a late joiner or a room:state refresh agrees with them.
      if (room.round?.roundId !== roundId || room.round.closed) return;
      room.phase = "answering";
      broadcastRoomState(room);
    });

    room.round.cancelDeadline = scheduler.schedule(endsAt, () => {
      closeRound(roundId, "deadline");
    });

    if (room.players[2]?.bot) startBotTurn(room, room.round);

    // One payload object, delivered to both: identical roundId, letter,
    // categories, startsAt and endsAt by construction, not by convention.
    const scheduled: RoundScheduled = roundScheduledSchema.parse({
      roundId,
      letter: room.round.letter,
      categories: [...CATEGORIES],
      serverNow,
      startsAt,
      endsAt,
    });

    for (const player of playersOf(room)) {
      if (!player.socketId) continue;
      deliver({
        socketId: player.socketId,
        event: SERVER_EVENTS.roundScheduled,
        payload: scheduled,
      });
    }
    broadcastRoomState(room);
  }

  /* --------------------------------------------------------- AI opponent */

  /**
   * The bot asks the AI for its sheet when the letter is chosen — the same
   * moment the human sees it — and finishes at a random point in the round.
   * Its answers are held in `round.bot`, never in a projection.
   */
  function startBotTurn(room: Room, round: Round): void {
    const span = BOT_FINISH_TO - BOT_FINISH_FROM;
    const finishAt = round.startsAt + Math.floor(config.roundDurationMs * (BOT_FINISH_FROM + random() * span));
    const turn: BotTurn = { status: "thinking", answers: null, finishAt, finishWhenReady: false, cancelFinish: null };
    round.bot = turn;

    turn.cancelFinish = scheduler.schedule(finishAt, () => {
      if (!isOpen(room, round.roundId)) return;
      if (turn.status === "thinking") turn.finishWhenReady = true;
      else finishBot(room, round);
    });

    void (ai ? ai.botAnswers(round.letter, round.alphabet) : Promise.resolve(null)).then((answers) => {
      if (!isOpen(room, round.roundId)) return;
      turn.answers = answers;
      turn.status = answers ? "ready" : "failed";
      if (turn.finishWhenReady) finishBot(room, round);
    });
  }

  /** Keeps a random 5-7 of the bot's answers, so it plays like a person. */
  function botSheet(answers: Record<Category, string> | null): Record<Category, string> {
    const sheet = blankSheet();
    if (!answers) return sheet;

    const order = [...CATEGORIES];
    for (let index = order.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [order[index], order[swap]] = [order[swap]!, order[index]!];
    }
    const kept = BOT_MIN_KEPT + Math.floor(random() * (BOT_MAX_KEPT - BOT_MIN_KEPT + 1));
    for (const category of order.slice(0, kept)) sheet[category] = answers[category];
    return sheet;
  }

  function finishBot(room: Room, round: Round): void {
    const bot = room.players[2];
    if (!bot?.bot || bot.finished || !round.bot) return;

    const sheet = botSheet(round.bot.answers);
    for (const category of CATEGORIES) bot.drafts[category] = { value: sheet[category], revision: 1 };
    bot.finished = true;
    bot.lockedAnswers = sheet;

    const finished: PlayerFinished = playerFinishedSchema.parse({ slot: bot.slot });
    for (const each of playersOf(room)) {
      if (!each.socketId) continue;
      deliver({ socketId: each.socketId, event: SERVER_EVENTS.playerFinished, payload: finished });
    }
    broadcastRoomState(room);

    if (playersOf(room).every((each) => each.finished)) closeRound(round.roundId, "both_finished");
  }

  /**
   * The human finished first: the bot stops waiting for its own moment and
   * finishes now, or on arrival if its answers are still being written, so
   * results come without running out the clock. Its sheet was fixed when the
   * letter was chosen, so finishing early gives it nothing.
   */
  function hurryBot(room: Room, round: Round): void {
    const turn = round.bot;
    if (!turn || !room.players[2]?.bot || room.players[2].finished) return;
    turn.cancelFinish?.();
    turn.cancelFinish = null;
    if (turn.status === "thinking") turn.finishWhenReady = true;
    else finishBot(room, round);
  }

  /* ---------------------------------------------------------- mutations */

  function createRoom(displayName: string, socketId: string, alphabet: Language): CreateRoomResult {
    const roomCode = nextRoomCode();
    const player = createPlayer(1, displayName, socketId);
    const room: Room = {
      roomCode,
      phase: "waiting_for_player",
      alphabet,
      createdAt: clock.now(),
      players: { 1: player },
      round: null,
      resultsAt: null,
    };

    rooms.set(roomCode, room);
    roomCodeBySocket.set(socketId, roomCode);
    // Every membership or phase change broadcasts room:state, so the lobby has
    // one source of truth rather than a screen the socket layer assembles.
    broadcastRoomState(room);

    return { room, resumeToken: player.resumeToken, slot: 1 };
  }

  function joinRoom(roomCode: string, displayName: string, socketId: string): Ack<JoinRoomResult> {
    const room = rooms.get(roomCode);
    if (!room) return fail("ROOM_NOT_FOUND");
    // Slot 2 occupied is the only way a room is full; a room in any later
    // phase already has two players, so there is no separate phase check here.
    if (room.players[2]) return fail("ROOM_FULL");

    const player = createPlayer(2, displayName, socketId);
    room.players[2] = player;
    room.phase = "synchronizing";
    roomCodeBySocket.set(socketId, roomCode);

    broadcastRoomState(room);
    return ok({ room, resumeToken: player.resumeToken, slot: 2 });
  }

  /**
   * The human takes slot 1 and the bot slot 2 in one step. The bot is ready at
   * once, so the round is scheduled by the human's own `room:client-ready`,
   * exactly as in a two-human room: there is still one way to start a round.
   */
  function createAiRoom(
    displayName: string,
    socketId: string,
    alphabet: Language,
    visitor = socketId,
  ): Ack<CreateRoomResult> {
    if (!ai) return fail("AI_UNAVAILABLE");
    if (getRoomBySocket(socketId)) return fail("WRONG_PHASE");
    const limited = limits?.check("aiRoom", visitor, clock.now());
    if (limited) return fail(limited);
    limits?.charge("aiRoom", visitor, clock.now());
    cancelQuickPlay(socketId);

    const created = createRoom(displayName, socketId, alphabet);
    created.room.players[2] = createPlayer(2, BOT_DISPLAY_NAME, null, true);
    created.room.phase = "synchronizing";
    broadcastRoomState(created.room);
    return ok(created);
  }

  /**
   * Two strangers who never exchanged a code. The queue holds one entry per
   * waiting socket; the second arrival creates the room and joins it, so a
   * matched pair travels exactly the path a room made from a code travels —
   * there is no second way to start a round.
   */
  function quickPlay(displayName: string, socketId: string, alphabet: Language): Ack<QuickPlayResult> {
    if (getRoomBySocket(socketId)) return fail("WRONG_PHASE");
    // Asking twice is not an error; it is the same answer.
    if (waiting.some((entry) => entry.socketId === socketId)) return ok({ status: "queued" });

    // The longest-waiting player is matched first.
    const partner = waiting.shift();
    if (!partner) {
      waiting.push({ socketId, displayName, alphabet });
      return ok({ status: "queued" });
    }

    // The waiting player opened the game, so their language decides (§2B.13).
    const created = createRoom(partner.displayName, partner.socketId, partner.alphabet);
    const joined = joinRoom(created.room.roomCode, displayName, socketId);
    if (!joined.ok) {
      // Leave nothing behind: the partner's room would sit empty and
      // unreachable, and the partner would wait forever.
      rooms.delete(created.room.roomCode);
      roomCodeBySocket.delete(partner.socketId);
      waiting.unshift(partner);
      return joined;
    }

    return ok({
      status: "matched",
      room: joined.data.room,
      resumeToken: joined.data.resumeToken,
      slot: joined.data.slot,
    });
  }

  function cancelQuickPlay(socketId: string): void {
    const index = waiting.findIndex((entry) => entry.socketId === socketId);
    if (index !== -1) waiting.splice(index, 1);
  }

  function queueLength(): number {
    return waiting.length;
  }

  function markClientReady(roomCode: string, socketId: string): Ack<{ accepted: true }> {
    const room = rooms.get(roomCode);
    if (!room) return fail("ROOM_NOT_FOUND");

    const player = findPlayerBySocket(room, socketId);
    if (!player) return fail("NOT_IN_ROOM");
    if (room.phase !== "synchronizing") return fail("WRONG_PHASE");

    // Idempotent: a repeated acknowledgement from the same player must not
    // schedule a second round.
    const alreadyReady = player.clientReady;
    player.clientReady = true;

    if (!alreadyReady) {
      const both = playersOf(room);
      if (both.length === 2 && both.every((each) => each.clientReady)) {
        scheduleRound(room);
      } else {
        broadcastRoomState(room);
      }
    }

    return ok({ accepted: true as const });
  }

  function applyDraft(input: DraftRequest, socketId: string): Ack<DraftAck> {
    const room = getRoomBySocket(socketId);
    if (!room) return fail("NOT_IN_ROOM");

    const player = findPlayerBySocket(room, socketId);
    if (!player) return fail("NOT_IN_ROOM");

    const round = room.round;
    if (!round || round.roundId !== input.roundId || round.closed) return fail("ROUND_STALE");

    const now = clock.now();
    if (now < round.startsAt) return fail("TOO_EARLY");
    // At endsAt the round is over even if the browser still shows time left.
    if (now >= round.endsAt) return fail("TOO_LATE");
    if (room.phase !== "answering") return fail("WRONG_PHASE");
    if (player.finished) return fail("ALREADY_FINISHED");

    const current = player.drafts[input.category];
    if (input.revision <= current.revision) return fail("STALE_REVISION");

    player.drafts[input.category] = { value: input.value, revision: input.revision };
    return ok({ category: input.category, acceptedRevision: input.revision });
  }

  function finish(roundId: string, socketId: string): Ack<FinishAck> {
    const room = getRoomBySocket(socketId);
    if (!room) return fail("NOT_IN_ROOM");

    const player = findPlayerBySocket(room, socketId);
    if (!player) return fail("NOT_IN_ROOM");

    const round = room.round;
    if (!round || round.roundId !== roundId) return fail("ROUND_STALE");

    // Duplicate finish returns the current lock state instead of scoring twice.
    if (player.finished) return ok({ finished: true as const });
    if (round.closed) return fail("ROUND_STALE");

    const now = clock.now();
    if (now < round.startsAt) return fail("TOO_EARLY");
    if (now >= round.endsAt) {
      // Finish raced the deadline and lost. Close here rather than waiting for
      // the timer, so the outcome is identical either way; closeRound locks
      // this player's latest accepted drafts, so nothing is discarded.
      closeRound(roundId, "deadline");
      return fail("TOO_LATE");
    }

    player.finished = true;
    player.lockedAnswers = lockedAnswersOf(player);

    const finished: PlayerFinished = playerFinishedSchema.parse({ slot: player.slot });
    for (const each of playersOf(room)) {
      if (!each.socketId) continue;
      deliver({ socketId: each.socketId, event: SERVER_EVENTS.playerFinished, payload: finished });
    }
    broadcastRoomState(room);

    if (playersOf(room).every((each) => each.finished)) {
      closeRound(roundId, "both_finished");
    } else {
      hurryBot(room, round);
    }

    return ok({ finished: true as const });
  }

  /**
   * A private clue for one category (`Plan.md` §2B.8). Checked like a draft
   * before the AI is asked, and checked again after it answers, because the
   * round may have closed meanwhile. A credit is spent only on a clue shown.
   */
  async function requestHint(input: HintRequest, socketId: string, visitor = socketId): Promise<Ack<HintAck>> {
    const room = getRoomBySocket(socketId);
    if (!room) return fail("NOT_IN_ROOM");

    const player = findPlayerBySocket(room, socketId);
    if (!player) return fail("NOT_IN_ROOM");

    const round = room.round;
    if (!round || round.roundId !== input.roundId || round.closed) return fail("ROUND_STALE");

    const now = clock.now();
    if (now < round.startsAt) return fail("TOO_EARLY");
    if (now >= round.endsAt) return fail("TOO_LATE");
    if (room.phase !== "answering") return fail("WRONG_PHASE");
    if (player.finished) return fail("ALREADY_FINISHED");
    if (!ai) return fail("AI_UNAVAILABLE");
    if (player.hintPending || player.hinted.size >= HINTS_PER_ROUND || player.hinted.has(input.category)) {
      return fail("HINT_LIMIT");
    }
    // Charged here, just before the AI call: a request refused above cost no AI.
    const limited = limits?.check("hint", visitor, now);
    if (limited) return fail(limited);
    limits?.charge("hint", visitor, now);

    player.hintPending = true;
    const result = await ai.hint(round.letter, round.alphabet, input.category, input.language);
    player.hintPending = false;

    // The round ended while the AI was thinking: nothing is shown or charged.
    if (!isOpen(room, round.roundId) || player.finished) return fail("ROUND_STALE");
    if (!result.ok) return fail(result.code === "quota_exhausted" ? "AI_LIMIT" : "AI_UNAVAILABLE");

    if (result.outcome.kind === "no_known_term") {
      return ok(
        hintAckSchema.parse({
          kind: "no_known_term",
          category: input.category,
          hintsLeft: HINTS_PER_ROUND - player.hinted.size,
        }),
      );
    }

    player.hinted.add(input.category);
    return ok(
      hintAckSchema.parse({
        kind: "clue",
        category: input.category,
        clue: result.outcome.clue,
        hintsLeft: HINTS_PER_ROUND - player.hinted.size,
      }),
    );
  }

  /**
   * The round coach (`Plan.md` §2C, contracts/coach-socket.md). Read-only: it
   * reads the reveal the caller already saw and writes nothing but the
   * caller's own coach state. Every check below costs no AI and changes no
   * state; the visitor is charged only when a run actually starts.
   */
  async function requestCoach(input: CoachRequest, socketId: string, visitor = socketId): Promise<Ack<CoachReport> | null> {
    // 2. A human player of a room: the bot has no socket, so it never gets here.
    const room = getRoomBySocket(socketId);
    if (!room) return fail("NOT_IN_ROOM");
    const player = findPlayerBySocket(room, socketId);
    if (!player || player.bot) return fail("NOT_IN_ROOM");

    // 3. That room's round, then 4. revealed (so a request while judging is WRONG_PHASE).
    const round = room.round;
    if (!round || round.roundId !== input.roundId) return fail("ROUND_STALE");
    if (room.phase !== "results" || !round.reveal) return fail("WRONG_PHASE");

    // 5. Only categories where the caller scored 0, i.e. was not valid.
    const sheet = player.slot === 1 ? round.reveal.player1 : round.reveal.player2;
    const missed = new Map(sheet.filter((answer) => !answer.valid).map((answer) => [answer.category, answer]));
    if (!input.focus.every((category) => missed.has(category))) return fail("INVALID_PAYLOAD");

    // 6. An AI to coach with.
    if (!ai) return fail("AI_UNAVAILABLE");

    // 7. One run per player per round: join it, or return its report.
    const existing = player.coach?.roundId === round.roundId ? player.coach : null;
    if (existing?.state === "done") return ok(existing.report);
    if (existing?.state === "running") return settleCoach(await existing.promise);

    // 8-9. The daily budget, then this visitor's hourly runs; 10. charge and start.
    const limited = limits?.check("coach", visitor, clock.now());
    if (limited) return fail(limited);
    limits?.charge("coach", visitor, clock.now());

    // Exactly what the agent may see (§2C.5): the caller's own misses, in category order.
    const focus: FocusEntry[] = CATEGORIES.filter((category) => input.focus.includes(category)).map((category) => {
      const answer = missed.get(category)!;
      return { category, yourAnswer: answer.raw, whyMissed: answer.reason ?? "empty" };
    });
    const controller = new AbortController();
    const promise = runCoach(
      {
        runId: randomUUID(),
        goal: input.goal,
        language: input.language,
        snapshot: Object.freeze({ letter: round.letter, alphabet: round.alphabet, focus: Object.freeze(focus) }),
      },
      { ai, now: () => clock.now(), signal: controller.signal, log: runLog },
    );
    const running: CoachState = { state: "running", roundId: round.roundId, promise, controller };
    player.coach = running;

    const outcome = await promise;
    if (player.coach === running) {
      player.coach = outcome.cancelled ? null : { state: "done", roundId: round.roundId, report: outcome.report };
    }
    return settleCoach(outcome);
  }

  const settleCoach = (outcome: CoachRunOutcome): Ack<CoachReport> | null =>
    outcome.cancelled ? null : ok(outcome.report);

  /** The caller left or the room is gone: stop the run; nothing is kept or sent. */
  function abortCoach(player: Player): void {
    if (player.coach?.state === "running") player.coach.controller.abort();
  }

  /**
   * Idempotent. The only path to reveal and scoring, per `Plan.md` §12.
   *
   * Week 4 (§2B.2): closing and scoring are now two stages. Steps 1-4 run
   * synchronously, so a second call (deadline racing both-finished) still
   * returns at step 1. With an AI configured the room then shows `judging`
   * until the checker answers or `JUDGE_TIMEOUT_MS` passes; `completeRound`
   * runs exactly once either way.
   */
  function closeRound(roundId: string, reason: ClosedReason): void {
    const roomCode = roomCodeByRound.get(roundId);
    const room = roomCode ? rooms.get(roomCode) : undefined;
    const round = room?.round;

    // 1. Not the current open round -> no mutation at all.
    if (!room || !round || round.roundId !== roundId || round.closed) return;

    // 2. Mark closed before any other work, so a re-entrant call returns above.
    round.closed = true;

    // 3. Cancel this round's timers.
    round.cancelStart?.();
    round.cancelDeadline?.();
    round.bot?.cancelFinish?.();
    round.cancelStart = null;
    round.cancelDeadline = null;

    // 4. Lock both players' latest accepted drafts. A bot that had not
    //    finished locks a blank sheet: its answers were never drafts.
    for (const player of playersOf(room)) {
      player.lockedAnswers ??= lockedAnswersOf(player);
    }

    const player1 = room.players[1];
    const player2 = room.players[2];
    if (!player1?.lockedAnswers || !player2?.lockedAnswers) return;
    const sheets = { 1: player1.lockedAnswers, 2: player2.lockedAnswers };

    if (!ai) {
      completeRound(room, round, reason, null);
      return;
    }

    // 5. Judge, with a timeout that does not depend on the AI service behaving.
    room.phase = "judging";
    broadcastRoomState(room);
    round.cancelJudgeTimeout = scheduler.schedule(clock.now() + JUDGE_TIMEOUT_MS, () =>
      completeRound(room, round, reason, null),
    );
    void ai
      .checkRound(round.letter, round.alphabet, sheets)
      .catch(() => null)
      .then((verdicts) => completeRound(room, round, reason, verdicts));
  }

  /** Runs once per round: validity, one reveal, one scored result (§12 steps 5-8). */
  function completeRound(room: Room, round: Round, reason: ClosedReason, verdicts: CheckVerdicts | null): void {
    if (round.revealed || rooms.get(room.roomCode) !== room) return;
    round.revealed = true;
    round.cancelJudgeTimeout?.();
    round.cancelJudgeTimeout = null;

    const player1 = room.players[1]!;
    const player2 = room.players[2]!;
    const verified = verdicts !== null;

    // Validity per answer: the local rule first, then the AI verdict if there is one.
    const judge = (player: Player) => {
      const revealed: RevealedAnswer[] = [];
      const judged = {} as Record<Category, JudgedAnswer>;

      for (const category of CATEGORIES) {
        const raw = player.lockedAnswers![category];
        const normalized = normalizeAnswer(raw);
        const local = checkAnswerLocally(raw, round.letter, round.alphabet);
        let valid = local.ok;
        let rejected: RejectReason | null = local.ok || local.reason === "empty" ? null : local.reason;
        let key = normalized;

        const verdict = local.ok ? verdicts?.get(answerKey(player.slot, category)) : undefined;
        if (verdict?.valid) key = verdict.canonical;
        else if (verdict) {
          valid = false;
          rejected = verdict.reason;
        }

        revealed.push({ category, raw, normalized, valid, reason: rejected, hinted: player.hinted.has(category) });
        judged[category] = { valid, key };
      }
      return { revealed, judged };
    };

    const one = judge(player1);
    const two = judge(player2);

    room.phase = "results";
    room.resultsAt = clock.now();

    // 6. One reveal, to both.
    const revealed: RoundRevealed = roundRevealedSchema.parse({
      roundId: round.roundId,
      letter: round.letter,
      closedReason: reason,
      player1: one.revealed,
      player2: two.revealed,
    });
    round.reveal = revealed;
    for (const player of playersOf(room)) {
      if (!player.socketId) continue;
      deliver({ socketId: player.socketId, event: SERVER_EVENTS.roundRevealed, payload: revealed });
    }

    // 7. One scored result, to both.
    const results: RoundResults = roundResultsSchema.parse({
      roundId: round.roundId,
      ...scoreJudgedRound(one.judged, two.judged),
      verified,
      botFailed: round.bot !== null && round.bot.status !== "ready",
    });
    for (const player of playersOf(room)) {
      if (!player.socketId) continue;
      deliver({ socketId: player.socketId, event: SERVER_EVENTS.roundResults, payload: results });
    }

    broadcastRoomState(room);
  }

  /* --------------------------------------------------------- lifecycle */

  function markDisconnected(socketId: string): void {
    // A socket that drops while queued must not be matched with the next
    // arrival, who would then wait for someone who has gone.
    cancelQuickPlay(socketId);

    const room = getRoomBySocket(socketId);
    roomCodeBySocket.delete(socketId);
    if (!room) return;

    const player = findPlayerBySocket(room, socketId);
    if (!player) return;

    // Before a round is scheduled, a room whose last human has gone is
    // abandoned: its code must stop working at once, or a friend could join a
    // room nobody is in and wait forever on the synchronizing screen. This is
    // also how the Leave button on the waiting screen releases a room.
    const preRound = room.phase === "waiting_for_player" || room.phase === "synchronizing";
    const humanStays = playersOf(room).some(
      (each) => each !== player && !each.bot && each.connected,
    );
    if (preRound && !humanStays) {
      dropRoom(room);
      return;
    }

    // The round timer keeps running and accepted drafts are retained; only the
    // public connection status changes (`Plan.md` §13).
    abortCoach(player);
    player.connected = false;
    player.socketId = null;
    broadcastRoomState(room);
  }

  function getRoomByCode(roomCode: string): Room | undefined {
    return rooms.get(roomCode);
  }

  function getRoomBySocket(socketId: string): Room | undefined {
    const roomCode = roomCodeBySocket.get(socketId);
    return roomCode ? rooms.get(roomCode) : undefined;
  }

  function dropRoom(room: Room): void {
    room.phase = "closed";
    room.round?.cancelStart?.();
    room.round?.cancelDeadline?.();
    room.round?.cancelJudgeTimeout?.();
    room.round?.bot?.cancelFinish?.();
    for (const player of playersOf(room)) {
      abortCoach(player);
      if (player.socketId) roomCodeBySocket.delete(player.socketId);
    }
    if (room.round) roomCodeByRound.delete(room.round.roundId);
    rooms.delete(room.roomCode);
  }

  /** Bounded memory: finished rooms and abandoned lobbies are both reaped. */
  function cleanup(): void {
    const now = clock.now();
    for (const room of [...rooms.values()]) {
      const finishedLongEnough =
        room.resultsAt !== null && now - room.resultsAt >= config.completedRoomTtlMs;
      // An AI room sits in `synchronizing` until its human's screen loads; one
      // that never loads is as abandoned as an empty lobby.
      const abandonedLobby =
        (room.phase === "waiting_for_player" || room.phase === "synchronizing") &&
        now - room.createdAt >= config.waitingRoomTtlMs;

      if (finishedLongEnough || abandonedLobby) dropRoom(room);
    }
    limits?.prune(now);
  }

  return {
    createRoom,
    joinRoom,
    quickPlay,
    cancelQuickPlay,
    createAiRoom,
    queueLength,
    markClientReady,
    applyDraft,
    finish,
    requestHint,
    requestCoach,
    closeRound,
    projectRoomState,
    markDisconnected,
    getRoomByCode,
    getRoomBySocket,
    cleanup,
  };
}
