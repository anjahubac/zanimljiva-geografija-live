import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, type Category } from "@contracts/game.schemas";
import { createGameSocket, type GameSocket } from "@client/socket/game-socket";
import { selectScreen, useGameState, type GameState } from "@client/state/useGameState";
import { LobbyScreen } from "@client/screens/LobbyScreen";
import { JoinScreen } from "@client/screens/JoinScreen";
import { WaitingScreen } from "@client/screens/WaitingScreen";
import { CountdownScreen } from "@client/screens/CountdownScreen";
import { AnswerScreen } from "@client/screens/AnswerScreen";
import { SearchingScreen } from "@client/screens/SearchingScreen";
import { WaitingForOpponentScreen } from "@client/screens/WaitingForOpponentScreen";
import { ResultsScreen } from "@client/screens/ResultsScreen";
import { JudgingScreen } from "@client/screens/JudgingScreen";
import { useI18n } from "@client/i18n";
import type { GameError } from "@contracts/errors";
import type { CoachRunView } from "@contracts/coach.schemas";

const DRAFT_DEBOUNCE_MS = 300;
const TICK_MS = 250;
/** Seconds at which the countdown is announced, instead of every second. */
const ANNOUNCED_SECONDS = new Set([60, 30, 10, 5, 4, 3, 2, 1, 0]);

type AppProps = {
  /** Leave the room (still waiting, or finished) and start over from the lobby. */
  onLeave: () => void;
};

export function App({ onLeave }: AppProps) {
  const { t, language } = useI18n();
  const [state, dispatch] = useGameState();

  /**
   * The server's error text is Serbian; the player reads the one for their
   * language, looked up by the stable code. A ref, so switching language
   * does not re-open the socket.
   */
  const tRef = useRef(t);
  tRef.current = t;
  const languageRef = useRef(language);
  languageRef.current = language;
  const say = useCallback((error: GameError) => tRef.current.errors[error.code] ?? error.message, []);
  const [now, setNow] = useState(() => Date.now());
  const [announcement, setAnnouncement] = useState("");
  const coachAbortRef = useRef<AbortController | null>(null);

  const socketRef = useRef<GameSocket | null>(null);
  const readySentForRef = useRef<string | null>(null);
  const revisionsRef = useRef<Record<Category, number>>(
    Object.fromEntries(CATEGORIES.map((category) => [category, 0])) as Record<Category, number>,
  );
  const debounceRef = useRef<Map<Category, ReturnType<typeof setTimeout>>>(new Map());
  const answersRef = useRef<Record<Category, string>>(state.answers);
  const roundIdRef = useRef<string | null>(null);

  answersRef.current = state.answers;
  roundIdRef.current = state.round?.roundId ?? null;

  /* ------------------------------------------------------------ socket */

  useEffect(() => {
    const gameSocket = createGameSocket();
    socketRef.current = gameSocket;

    gameSocket.onConnectionChange((connected) => {
      if (!connected) {
        coachAbortRef.current?.abort();
        coachAbortRef.current = null;
      }
      dispatch({ type: "connection", connected, message: tRef.current.connectionLost });
    });
    gameSocket.onRoomState((payload) => dispatch({ type: "room-state", payload }));
    gameSocket.onRoundScheduled((payload) => {
      coachAbortRef.current?.abort();
      coachAbortRef.current = null;
      dispatch({ type: "round-scheduled", payload, receivedAt: Date.now() });
    });
    gameSocket.onPlayerFinished((payload) => dispatch({ type: "player-finished", payload }));
    gameSocket.onRoundRevealed((payload) => dispatch({ type: "revealed", payload }));
    gameSocket.onRoundResults((payload) => dispatch({ type: "results", payload }));
    gameSocket.onGameError((payload) => dispatch({ type: "error", message: say(payload) }));

    const timers = debounceRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      coachAbortRef.current?.abort();
      coachAbortRef.current = null;
      gameSocket.disconnect();
      socketRef.current = null;
    };
  }, [dispatch, say]);

  /* --------------------------------------------- automatic client-ready */

  useEffect(() => {
    const roomCode = state.room?.roomCode;
    if (!roomCode || state.room?.phase !== "synchronizing") return;
    if (readySentForRef.current === roomCode) return;

    readySentForRef.current = roomCode;
    void socketRef.current?.clientReady(roomCode).then((ack) => {
      if (!ack.ok) dispatch({ type: "error", message: say(ack.error) });
    });
  }, [state.room?.roomCode, state.room?.phase, dispatch, say]);

  /* ------------------------------------------------ presentation clock */

  const phase = state.room?.phase;
  useEffect(() => {
    if (phase !== "countdown" && phase !== "answering") return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [phase]);

  const estimatedServerNow = now + state.clockOffsetMs;
  const msToStart = state.round ? Math.max(0, state.round.startsAt - estimatedServerNow) : 0;
  const remainingMs = state.round ? Math.max(0, state.round.endsAt - estimatedServerNow) : 0;

  // Announce phase changes and a few countdown milestones, rather than
  // interrupting a screen reader once per second.
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  useEffect(() => {
    if (phase === "answering" && ANNOUNCED_SECONDS.has(remainingSeconds)) {
      setAnnouncement(`${tRef.current.timeLeft}: ${remainingSeconds} s`);
    }
  }, [phase, remainingSeconds]);

  useEffect(() => {
    if (!phase) return;
    if (phase === "answering") setAnnouncement(tRef.current.answeringTitle);
    if (phase === "judging") setAnnouncement(tRef.current.judgingTitle);
    if (phase === "results") setAnnouncement(tRef.current.resultsTitle);
  }, [phase]);

  /* -------------------------------------------------------- draft flow */

  const sendDraft = useCallback((category: Category, value: string) => {
    const roundId = roundIdRef.current;
    const gameSocket = socketRef.current;
    if (!roundId || !gameSocket) return;

    const revision = revisionsRef.current[category] + 1;
    revisionsRef.current[category] = revision;
    dispatch({ type: "draft-sent", category, revision });

    void gameSocket.sendDraft({ roundId, category, value, revision }).then((ack) => {
      if (ack.ok) {
        dispatch({ type: "draft-accepted", category, revision: ack.data.acceptedRevision });
      } else {
        dispatch({ type: "draft-rejected", category, message: say(ack.error) });
      }
    });
  }, [dispatch, say]);

  const flush = useCallback(
    (category: Category) => {
      const timer = debounceRef.current.get(category);
      if (timer) {
        clearTimeout(timer);
        debounceRef.current.delete(category);
        sendDraft(category, answersRef.current[category]);
      }
    },
    [sendDraft],
  );

  const handleChange = useCallback(
    (category: Category, value: string) => {
      dispatch({ type: "answer-changed", category, value });
      answersRef.current = { ...answersRef.current, [category]: value };

      const existing = debounceRef.current.get(category);
      if (existing) clearTimeout(existing);
      debounceRef.current.set(
        category,
        setTimeout(() => {
          debounceRef.current.delete(category);
          sendDraft(category, answersRef.current[category]);
        }, DRAFT_DEBOUNCE_MS),
      );
    },
    [sendDraft, dispatch],
  );

  const handleFinish = useCallback(() => {
    const roundId = roundIdRef.current;
    const gameSocket = socketRef.current;
    if (!roundId || !gameSocket) return;

    // Everything typed but not yet sent goes first, so Finish never discards
    // a character the player can still see on screen.
    for (const category of CATEGORIES) flush(category);

    dispatch({ type: "busy", busy: true });
    void gameSocket.finishRound(roundId).then((ack) => {
      if (ack.ok) {
        // The form locks on the accepted acknowledgement, not on the click.
        dispatch({ type: "finish-accepted" });
      } else {
        dispatch({ type: "busy", busy: false });
        dispatch({ type: "error", message: say(ack.error) });
      }
    });
  }, [flush, dispatch, say]);

  /* ----------------------------------------------------------- screens */

  const handleCreate = useCallback((displayName: string) => {
    dispatch({ type: "busy", busy: true });
    void socketRef.current?.createRoom(displayName, languageRef.current).then((ack) => {
      dispatch({ type: "busy", busy: false });
      if (ack.ok) dispatch({ type: "joined", roomCode: ack.data.roomCode, you: ack.data.you });
      else dispatch({ type: "error", message: say(ack.error) });
    });
  }, [dispatch, say]);

  const handleJoin = useCallback((roomCode: string, displayName: string) => {
    dispatch({ type: "busy", busy: true });
    void socketRef.current?.joinRoom(roomCode, displayName).then((ack) => {
      dispatch({ type: "busy", busy: false });
      if (ack.ok) dispatch({ type: "joined", roomCode: ack.data.roomCode, you: ack.data.you });
      else dispatch({ type: "error", message: say(ack.error) });
    });
  }, [dispatch, say]);

  const handleQuickPlay = useCallback((displayName: string) => {
    dispatch({ type: "busy", busy: true });
    void socketRef.current?.quickPlay(displayName, languageRef.current).then((ack) => {
      dispatch({ type: "busy", busy: false });
      if (!ack.ok) {
        dispatch({ type: "error", message: say(ack.error) });
        return;
      }
      // A match that already existed arrives as room:state too; the queued
      // case is the only one that needs a screen of its own.
      if (ack.data.status === "queued") dispatch({ type: "entry", entry: "searching" });
      else dispatch({ type: "joined", roomCode: ack.data.roomCode, you: ack.data.you });
    });
  }, [dispatch, say]);

  const handlePlayAi = useCallback((displayName: string) => {
    dispatch({ type: "busy", busy: true });
    void socketRef.current?.playAi(displayName, languageRef.current).then((ack) => {
      dispatch({ type: "busy", busy: false });
      if (ack.ok) dispatch({ type: "joined", roomCode: ack.data.roomCode, you: ack.data.you });
      else dispatch({ type: "error", message: say(ack.error) });
    });
  }, [dispatch, say]);

  const handleHint = useCallback((category: Category) => {
    const roundId = roundIdRef.current;
    const gameSocket = socketRef.current;
    if (!roundId || !gameSocket) return;

    dispatch({ type: "hint-requested", category });
    void gameSocket.requestHint({ roundId, category, language: languageRef.current }).then((ack) => {
      if (ack.ok) dispatch({ type: "hint-received", payload: ack.data });
      else dispatch({ type: "hint-failed", category, message: say(ack.error) });
    });
  }, [dispatch, say]);

  const handleReviewRound = useCallback(() => {
    const roundId = roundIdRef.current;
    const gameSocket = socketRef.current;
    if (!roundId || !gameSocket || !gameSocket.socket.connected || state.coach || coachAbortRef.current) return;
    const controller = new AbortController();
    coachAbortRef.current = controller;
    dispatch({ type: "coach-started", roundId });
    void gameSocket.reviewRound({ roundId, goalId: "review_round", language: languageRef.current }, controller.signal).then((ack) => {
      if (coachAbortRef.current !== controller) return;
      coachAbortRef.current = null;
      if (socketRef.current !== gameSocket || !gameSocket.socket.connected || roundIdRef.current !== roundId) return;
      if (ack.ok && ack.data.roundId === roundId) dispatch({ type: "coach-completed", roundId, payload: ack.data });
      else dispatch({ type: "coach-unavailable", roundId, code: ack.ok ? "INTERNAL" : ack.error.code });
    });
  }, [dispatch, state.coach]);

  const handleCancelSearch = useCallback(() => {
    dispatch({ type: "busy", busy: true });
    void socketRef.current?.cancelQuickPlay().then(() => {
      dispatch({ type: "busy", busy: false });
      dispatch({ type: "entry", entry: "lobby" });
    });
  }, [dispatch]);

  const screen = useMemo(() => selectScreen(state), [state]);

  return (
    <main className="app">
      {renderScreen({
        screen,
        state,
        msToStart,
        remainingMs,
        announcement,
        onCreate: handleCreate,
        onJoin: handleJoin,
        onQuickPlay: handleQuickPlay,
        onPlayAi: handlePlayAi,
        onHint: handleHint,
        coachView: state.coach?.status === "terminal" ? state.coach.view : null,
        coachLoading: state.coach?.status === "pending",
        coachUnavailable: state.coach?.status === "unavailable",
        coachErrorCode: state.coach?.status === "unavailable" ? state.coach.code : null,
        coachDisabled: !state.connected,
        onReviewRound: handleReviewRound,
        onCancelSearch: handleCancelSearch,
        onLeave,
        onChange: handleChange,
        onBlur: flush,
        onFinish: handleFinish,
        onSwitchToJoin: () => dispatch({ type: "entry", entry: "join" }),
        onBack: () => dispatch({ type: "entry", entry: "lobby" }),
      })}

      {!state.connected && state.roomCode ? (
        <p className="banner" role="alert">
          {t.connectionLost}
        </p>
      ) : null}
    </main>
  );
}

type RenderArgs = {
  screen: ReturnType<typeof selectScreen>;
  state: GameState;
  msToStart: number;
  remainingMs: number;
  announcement: string;
  onCreate: (displayName: string) => void;
  onJoin: (roomCode: string, displayName: string) => void;
  onQuickPlay: (displayName: string) => void;
  onPlayAi: (displayName: string) => void;
  onHint: (category: Category) => void;
  coachView: CoachRunView | null;
  coachLoading: boolean;
  coachUnavailable: boolean;
  coachErrorCode: GameError["code"] | null;
  coachDisabled: boolean;
  onReviewRound: () => void;
  onCancelSearch: () => void;
  onLeave: () => void;
  onChange: (category: Category, value: string) => void;
  onBlur: (category: Category) => void;
  onFinish: () => void;
  onSwitchToJoin: () => void;
  onBack: () => void;
};

function renderScreen(args: RenderArgs) {
  const { screen, state } = args;

  switch (screen) {
    case "join":
      return (
        <JoinScreen
          busy={state.busy}
          errorMessage={state.errorMessage}
          onJoin={args.onJoin}
          onBack={args.onBack}
        />
      );

    case "searching":
      return <SearchingScreen busy={state.busy} onCancel={args.onCancelSearch} />;

    case "waiting":
      return state.room ? <WaitingScreen room={state.room} onLeave={args.onLeave} /> : null;

    case "countdown":
      return (
        <CountdownScreen
          secondsToStart={Math.ceil(args.msToStart / 1000)}
          letter={state.round?.letter ?? ""}
        />
      );

    case "answering":
      return (
        <AnswerScreen
          letter={state.round?.letter ?? ""}
          remainingMs={args.remainingMs}
          answers={state.answers}
          draftStatus={state.draftStatus}
          fieldError={state.fieldError}
          // At zero the form locks and the client waits for the server's
          // reveal; it never closes the round itself.
          locked={state.finished || args.remainingMs === 0}
          busy={state.busy}
          opponentFinished={state.opponentFinished}
          opponentConnected={state.opponentConnected}
          opponentIsBot={state.opponentIsBot}
          announcement={args.announcement}
          hintsLeft={state.hintsLeft}
          hints={state.hints}
          onHint={args.onHint}
          onChange={args.onChange}
          onBlur={args.onBlur}
          onFinish={args.onFinish}
        />
      );

    case "waiting_for_opponent":
      return (
        <WaitingForOpponentScreen
          opponentFinished={state.opponentFinished}
          opponentConnected={state.opponentConnected}
          opponentIsBot={state.opponentIsBot}
          remainingMs={args.remainingMs}
        />
      );

    case "judging":
      return <JudgingScreen />;

    case "results":
      return state.revealed && state.results && state.you ? (
        <ResultsScreen
          you={state.you}
          revealed={state.revealed}
          results={state.results}
          opponentIsBot={state.opponentIsBot}
          coachView={args.coachView}
          coachLoading={args.coachLoading}
          coachUnavailable={args.coachUnavailable}
          coachErrorCode={args.coachErrorCode}
          coachDisabled={args.coachDisabled}
          onReviewRound={args.onReviewRound}
          onLeave={args.onLeave}
        />
      ) : (
        <JudgingScreen />
      );

    case "lobby":
    default:
      return (
        <LobbyScreen
          busy={state.busy}
          errorMessage={state.errorMessage}
          onCreate={args.onCreate}
          onQuickPlay={args.onQuickPlay}
          onPlayAi={args.onPlayAi}
          onSwitchToJoin={args.onSwitchToJoin}
        />
      );
  }
}
