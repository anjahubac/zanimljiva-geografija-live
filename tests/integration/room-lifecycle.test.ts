import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Socket } from "socket.io-client";
import { CLIENT_EVENTS, SERVER_EVENTS, type RoomState } from "@contracts/socket.schemas";
import { roomAckSchema, roomStateSchema } from "@contracts/socket.schemas";
import { connectClient, emitAck, settle, waitFor } from "../helpers/socket-client";
import { startTestServer, type TestContext } from "../helpers/test-server";

describe("room lifecycle over the wire", () => {
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

  async function createRoom(socket: Socket, displayName = "Ana"): Promise<string> {
    const created = await emitAck<{ roomCode: string }>(socket, CLIENT_EVENTS.createRoom, {
      displayName,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("room was not created");
    // The ack shape is exactly the contract, including the caller-private token.
    expect(roomAckSchema.safeParse(created.data).success).toBe(true);
    return created.data.roomCode;
  }

  it("serves a health endpoint", async () => {
    const response = await fetch(`http://localhost:${ctx.port}/healthz`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("creates a room and puts the creator in slot 1, waiting for a player", async () => {
    const p1 = await open();
    const state = waitFor<RoomState>(p1, SERVER_EVENTS.roomState);
    const roomCode = await createRoom(p1);

    const lobby = await state;
    expect(roomStateSchema.safeParse(lobby).success).toBe(true);
    expect(lobby.roomCode).toBe(roomCode);
    expect(lobby.phase).toBe("waiting_for_player");
    expect(lobby.you).toBe(1);
    expect(lobby.players).toHaveLength(1);
    expect(lobby.players[0]).toEqual({
      slot: 1,
      displayName: "Ana",
      connected: true,
      clientReady: false,
      finished: false,
    });
  });

  it("moves both players to synchronizing when player 2 joins", async () => {
    const p1 = await open();
    const p2 = await open();
    const roomCode = await createRoom(p1);

    const stateP1 = waitFor<RoomState>(p1, SERVER_EVENTS.roomState);
    const stateP2 = waitFor<RoomState>(p2, SERVER_EVENTS.roomState);
    await emitAck(p2, CLIENT_EVENTS.joinRoom, { roomCode, displayName: "Marko" });

    const [forP1, forP2] = await Promise.all([stateP1, stateP2]);
    expect(forP1.phase).toBe("synchronizing");
    expect(forP2.phase).toBe("synchronizing");
    // Same room, different recipient: only `you` differs.
    expect(forP1.you).toBe(1);
    expect(forP2.you).toBe(2);
    expect(forP1.players).toEqual(forP2.players);
    expect(forP1.players.map((player) => player.displayName)).toEqual(["Ana", "Marko"]);
  });

  it("rejects an unknown room code", async () => {
    const p2 = await open();
    const result = await emitAck(p2, CLIENT_EVENTS.joinRoom, {
      roomCode: "ZZZZZZ",
      displayName: "Marko",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ROOM_NOT_FOUND");
      expect(result.error.message).toBe("Room not found. Check the code.");
    }
  });

  it("rejects a third player and leaves the two existing players untouched", async () => {
    const p1 = await open();
    const p2 = await open();
    const p3 = await open();
    const roomCode = await createRoom(p1);
    await emitAck(p2, CLIENT_EVENTS.joinRoom, { roomCode, displayName: "Marko" });
    await settle();

    const before = ctx.server.store.getRoomByCode(roomCode);
    if (!before) throw new Error("room missing");
    const snapshot = JSON.stringify(ctx.server.store.projectRoomState(before, 1));

    const result = await emitAck(p3, CLIENT_EVENTS.joinRoom, { roomCode, displayName: "Cveta" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ROOM_FULL");

    const after = ctx.server.store.getRoomByCode(roomCode);
    if (!after) throw new Error("room missing");
    expect(JSON.stringify(ctx.server.store.projectRoomState(after, 1))).toBe(snapshot);
  });

  it("rejects a malformed create payload without creating a room", async () => {
    const p1 = await open();

    const blankName = await emitAck(p1, CLIENT_EVENTS.createRoom, { displayName: "   " });
    expect(blankName.ok).toBe(false);
    if (!blankName.ok) expect(blankName.error.code).toBe("INVALID_PAYLOAD");

    const extraKey = await emitAck(p1, CLIENT_EVENTS.createRoom, {
      displayName: "Ana",
      you: 1,
    });
    expect(extraKey.ok).toBe(false);
    if (!extraKey.ok) expect(extraKey.error.code).toBe("INVALID_PAYLOAD");

    expect(ctx.server.store.getRoomBySocket(p1.id ?? "")).toBeUndefined();
  });

  it("reports a disconnected opponent without ending the room", async () => {
    const p1 = await open();
    const p2 = await open();
    const roomCode = await createRoom(p1);
    await emitAck(p2, CLIENT_EVENTS.joinRoom, { roomCode, displayName: "Marko" });
    await settle();

    const state = waitFor<RoomState>(p1, SERVER_EVENTS.roomState);
    p2.disconnect();
    const afterDisconnect = await state;

    expect(afterDisconnect.players.find((player) => player.slot === 2)?.connected).toBe(false);
    expect(ctx.server.store.getRoomByCode(roomCode)).toBeDefined();
  });

  it("reaps an abandoned lobby, after which its code is no longer joinable", async () => {
    const p1 = await open();
    const p2 = await open();
    const roomCode = await createRoom(p1);

    ctx.advance(ctx.config.waitingRoomTtlMs - 1);
    ctx.server.store.cleanup();
    expect(ctx.server.store.getRoomByCode(roomCode)).toBeDefined();

    ctx.advance(1);
    ctx.server.store.cleanup();

    const result = await emitAck(p2, CLIENT_EVENTS.joinRoom, { roomCode, displayName: "Marko" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ROOM_NOT_FOUND");
  });
});
