import {
  CATEGORIES,
  type Category,
  type ClosedReason,
  type Letter,
  type PlayerSlot,
  type RoomPhase,
  type ServerConfig,
} from "@contracts/game.schemas";
import { type Ack, fail, ok } from "@contracts/errors";
import {
  SERVER_EVENTS,
  type DraftAck,
  type DraftRequest,
  type FinishAck,
  type PlayerFinished,
  type RoomState,
  type RoundRevealed,
  type RoundResults,
  type RoundScheduled,
  playerFinishedSchema,
  roomStateSchema,
  roundRevealedSchema,
  roundResultsSchema,
  roundScheduledSchema,
} from "@contracts/socket.schemas";
import { normalizeAnswer } from "@domain/normalize-answer";
import { isValidAnswer } from "@domain/validate-answer";
import { scoreRound } from "@domain/score-round";
import type { Cancel, Clock, Scheduler } from "@server/clock";
import { generateResumeToken, generateRoomCode, generateRoundId } from "@server/ids";
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
  socketId: string | null;
  resumeToken: string;
  connected: boolean;
  clientReady: boolean;
  finished: boolean;
  drafts: Record<Category, Draft>;
  /** Snapshot taken when this player locks; the round scores from this, not from drafts. */
  lockedAnswers: Record<Category, string> | null;
};

type Round = {
  roundId: string;
  letter: Letter;
  startsAt: number;
  endsAt: number;
  closed: boolean;
  cancelStart: Cancel | null;
  cancelDeadline: Cancel | null;
};

export type Room = {
  roomCode: string;
  phase: RoomPhase;
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
};

export type CreateRoomResult = { room: Room; resumeToken: string; slot: PlayerSlot };
export type JoinRoomResult = CreateRoomResult;

export type RoomStore = {
  createRoom(displayName: string, socketId: string): CreateRoomResult;
  joinRoom(roomCode: string, displayName: string, socketId: string): Ack<JoinRoomResult>;
  markClientReady(roomCode: string, socketId: string): Ack<{ accepted: true }>;
  applyDraft(input: DraftRequest, socketId: string): Ack<DraftAck>;
  finish(roundId: string, socketId: string): Ack<FinishAck>;
  closeRound(roundId: string, reason: ClosedReason): void;
  projectRoomState(room: Room, slot: PlayerSlot): RoomState;
  markDisconnected(socketId: string): void;
  getRoomByCode(roomCode: string): Room | undefined;
  getRoomBySocket(socketId: string): Room | undefined;
  cleanup(): void;
};

const MAX_ROOM_CODE_ATTEMPTS = 50;

const emptyDrafts = (): Record<Category, Draft> =>
  Object.fromEntries(CATEGORIES.map((category) => [category, { value: "", revision: 0 }])) as Record<
    Category,
    Draft
  >;

export function createRoomStore(deps: RoomStoreDeps): RoomStore {
  const { clock, scheduler, selectLetter, config, deliver } = deps;

  const rooms = new Map<string, Room>();
  const roomCodeBySocket = new Map<string, string>();
  const roomCodeByRound = new Map<string, string>();

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

  function createPlayer(slot: PlayerSlot, displayName: string, socketId: string): Player {
    return {
      slot,
      displayName,
      socketId,
      resumeToken: generateResumeToken(),
      connected: true,
      clientReady: false,
      finished: false,
      drafts: emptyDrafts(),
      lockedAnswers: null,
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

  /* ------------------------------------------------- round scheduling */

  function scheduleRound(room: Room): void {
    const serverNow = clock.now();
    const startsAt = serverNow + config.countdownMs;
    const endsAt = startsAt + config.roundDurationMs;
    const roundId = generateRoundId();

    room.round = {
      roundId,
      letter: selectLetter(),
      startsAt,
      endsAt,
      closed: false,
      cancelStart: null,
      cancelDeadline: null,
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

  /* ---------------------------------------------------------- mutations */

  function createRoom(displayName: string, socketId: string): CreateRoomResult {
    const roomCode = nextRoomCode();
    const player = createPlayer(1, displayName, socketId);
    const room: Room = {
      roomCode,
      phase: "waiting_for_player",
      createdAt: clock.now(),
      players: { 1: player },
      round: null,
      resultsAt: null,
    };

    rooms.set(roomCode, room);
    roomCodeBySocket.set(socketId, roomCode);

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
    }

    return ok({ finished: true as const });
  }

  /** Idempotent. The only path to reveal and scoring, per `Plan.md` §12. */
  function closeRound(roundId: string, reason: ClosedReason): void {
    const roomCode = roomCodeByRound.get(roundId);
    const room = roomCode ? rooms.get(roomCode) : undefined;
    const round = room?.round;

    // 1. Not the current open round -> no mutation at all.
    if (!room || !round || round.roundId !== roundId || round.closed) return;

    // 2. Mark closed before any other work, so a re-entrant call returns above.
    round.closed = true;
    room.phase = "results";
    room.resultsAt = clock.now();

    // 3. Cancel this round's timers.
    round.cancelStart?.();
    round.cancelDeadline?.();
    round.cancelStart = null;
    round.cancelDeadline = null;

    // 4. Lock both players' latest accepted drafts.
    const players = playersOf(room);
    for (const player of players) {
      player.lockedAnswers ??= lockedAnswersOf(player);
    }

    const player1 = room.players[1];
    const player2 = room.players[2];
    if (!player1 || !player2) return;

    const answers1 = player1.lockedAnswers ?? lockedAnswersOf(player1);
    const answers2 = player2.lockedAnswers ?? lockedAnswersOf(player2);

    // 5. Normalize and validate.
    const revealFor = (answers: Record<Category, string>) =>
      CATEGORIES.map((category) => ({
        category,
        raw: answers[category],
        normalized: normalizeAnswer(answers[category]),
        valid: isValidAnswer(answers[category], round.letter),
      }));

    // 6. One reveal, to both.
    const revealed: RoundRevealed = roundRevealedSchema.parse({
      roundId,
      letter: round.letter,
      closedReason: reason,
      player1: revealFor(answers1),
      player2: revealFor(answers2),
    });
    for (const player of players) {
      if (!player.socketId) continue;
      deliver({ socketId: player.socketId, event: SERVER_EVENTS.roundRevealed, payload: revealed });
    }

    // 7. One scored result, to both.
    const scored = scoreRound(answers1, answers2, round.letter);
    const results: RoundResults = roundResultsSchema.parse({ roundId, ...scored });
    for (const player of players) {
      if (!player.socketId) continue;
      deliver({ socketId: player.socketId, event: SERVER_EVENTS.roundResults, payload: results });
    }

    broadcastRoomState(room);
  }

  /* --------------------------------------------------------- lifecycle */

  function markDisconnected(socketId: string): void {
    const room = getRoomBySocket(socketId);
    roomCodeBySocket.delete(socketId);
    if (!room) return;

    const player = findPlayerBySocket(room, socketId);
    if (!player) return;

    // The round timer keeps running and accepted drafts are retained; only the
    // public connection status changes (`Plan.md` §13).
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
    for (const player of playersOf(room)) {
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
      const abandonedLobby =
        room.phase === "waiting_for_player" && now - room.createdAt >= config.waitingRoomTtlMs;

      if (finishedLongEnough || abandonedLobby) dropRoom(room);
    }
  }

  return {
    createRoom,
    joinRoom,
    markClientReady,
    applyDraft,
    finish,
    closeRound,
    projectRoomState,
    markDisconnected,
    getRoomByCode,
    getRoomBySocket,
    cleanup,
  };
}
