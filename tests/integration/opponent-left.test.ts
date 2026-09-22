import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Socket } from "socket.io-client";
import { CATEGORIES, type Category } from "@contracts/game.schemas";
import { CLIENT_EVENTS, SERVER_EVENTS, type RoomState } from "@contracts/socket.schemas";
import { gameReducer, initialGameState, type GameState } from "@client/state/useGameState";
import type { DraftStatus } from "@client/state/useGameState";
import { AnswerScreen } from "@client/screens/AnswerScreen";
import { connectClient, emitAck, settle, waitFor } from "../helpers/socket-client";
import { startTestServer, type TestContext } from "../helpers/test-server";

/**
 * E4, end to end. The defect was never inside one layer: the server said the
 * opponent had gone, the payload carried it, and the browser threw it away. A
 * test that stops at the payload — as `room-lifecycle.test.ts` rightly does —
 * cannot see that. This one carries a real socket drop through the real
 * reducer into real markup, which is the only place the defect was visible.
 */
describe("E4 a real disconnect reaches the remaining player's screen", () => {
  let ctx: TestContext;
  const sockets: Socket[] = [];

  beforeEach(async () => {
    ctx = await startTestServer({ letter: "S" });
  });

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.disconnect();
    await ctx.close();
  });

  async function open(): Promise<Socket> {
    const socket = await connectClient(ctx.port);
    sockets.push(socket);
    return socket;
  }

  /** Two players in a live, running round. */
  async function liveRound(): Promise<{ p1: Socket; p2: Socket; roomCode: string }> {
    const p1 = await open();
    const p2 = await open();

    const created = await emitAck<{ roomCode: string }>(p1, CLIENT_EVENTS.createRoom, {
      displayName: "Ana",
    });
    if (!created.ok) throw new Error("room was not created");
    const { roomCode } = created.data;

    await emitAck(p2, CLIENT_EVENTS.joinRoom, { roomCode, displayName: "Marko" });
    await emitAck(p1, CLIENT_EVENTS.clientReady, { roomCode });
    await emitAck(p2, CLIENT_EVENTS.clientReady, { roomCode });
    await settle();
    ctx.advance(ctx.config.countdownMs);
    await settle();

    return { p1, p2, roomCode };
  }

  const blank = <T,>(value: T): Record<Category, T> =>
    Object.fromEntries(CATEGORIES.map((category) => [category, value])) as Record<Category, T>;

  /** Exactly the props `App.tsx` gives the answering screen. */
  function screenFor(state: GameState): string {
    return renderToStaticMarkup(
      createElement(AnswerScreen, {
        letter: "S",
        remainingMs: 90_000,
        answers: blank(""),
        draftStatus: blank<DraftStatus>("empty"),
        fieldError: {},
        locked: state.finished,
        busy: false,
        opponentFinished: state.opponentFinished,
        opponentConnected: state.opponentConnected,
        announcement: "",
        onChange: () => {},
        onBlur: () => {},
        onFinish: () => {},
      }),
    );
  }

  it("tells the player still playing that their opponent left", async () => {
    const { p1, p2 } = await liveRound();

    const incoming = waitFor<RoomState>(p1, SERVER_EVENTS.roomState);
    p2.disconnect();
    const afterDisconnect = await incoming;

    // The payload was always right. This assertion already existed elsewhere,
    // and is repeated here to show the server is not what changed.
    expect(afterDisconnect.players.find((player) => player.slot === 2)?.connected).toBe(false);

    // What is new: that same payload, through the real reducer, into markup.
    const state = gameReducer(initialGameState, {
      type: "room-state",
      payload: afterDisconnect,
    });

    expect(state.opponentConnected).toBe(false);
    expect(screenFor(state)).toContain("Protivnik je napustio partiju.");
    expect(screenFor(state)).not.toContain("Protivnik još igra.");
  });

  it("keeps the round running underneath the message", async () => {
    const { p1, p2 } = await liveRound();

    const incoming = waitFor<RoomState>(p1, SERVER_EVENTS.roomState);
    p2.disconnect();
    const afterDisconnect = await incoming;

    // `Plan.md` §13: the timer continues and accepted drafts are retained. A
    // departure is a notification, not a phase change.
    expect(afterDisconnect.phase).toBe("answering");

    const room = ctx.server.store.getRoomByCode(afterDisconnect.roomCode);
    const draft = await emitAck(p1, CLIENT_EVENTS.draft, {
      roundId: room?.round?.roundId,
      category: CATEGORIES[0],
      value: "Srbija",
      revision: 1,
    });

    expect(draft.ok).toBe(true);
  });

  it("says nothing about leaving while both players are connected", async () => {
    const { p1 } = await liveRound();
    await settle();

    const room = ctx.server.store.getRoomBySocket(p1.id ?? "");
    expect(room).toBeDefined();
    const state = gameReducer(initialGameState, {
      type: "room-state",
      payload: ctx.server.store.projectRoomState(room!, 1),
    });

    expect(state.opponentConnected).toBe(true);
    expect(screenFor(state)).not.toContain("napustio");
  });
});
