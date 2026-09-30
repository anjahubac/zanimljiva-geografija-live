import { afterEach, describe, expect, it } from "vitest";
import type { Socket } from "socket.io-client";
import type { Language, Letter } from "@contracts/game.schemas";
import { CLIENT_EVENTS, SERVER_EVENTS, type RoundScheduled } from "@contracts/socket.schemas";
import { connectClient, emitAck, waitFor } from "../helpers/socket-client";
import { startTestServer, type TestContext } from "../helpers/test-server";
import { fakeAi } from "../fakes/fake-ai";

/**
 * `Plan.md` §2B.13, spec 009 US3: the room's alphabet is the language of the
 * player who opened it, whatever the second player's language is. The letter
 * selector records the alphabet it is asked for and answers with a letter
 * only that alphabet has, so the letter both players receive shows it too.
 */

let ctx: TestContext | null = null;
const sockets: Socket[] = [];
let asked: Language[] = [];

const LETTER_OF: Record<Language, Letter> = { sr: "Lj", en: "W" };

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await ctx?.close();
  ctx = null;
  asked = [];
});

async function start(ai = fakeAi()) {
  ctx = await startTestServer({
    ai,
    selectLetter: (alphabet) => {
      asked.push(alphabet);
      return LETTER_OF[alphabet];
    },
  });
  return ai;
}

async function client(): Promise<Socket> {
  const socket = await connectClient(ctx!.port);
  sockets.push(socket);
  return socket;
}

/** Both players ready; resolves with the round each of them received. */
async function scheduleBoth(p1: Socket, p2: Socket, roomCode: string) {
  const scheduled = Promise.all([
    waitFor<RoundScheduled>(p1, SERVER_EVENTS.roundScheduled),
    waitFor<RoundScheduled>(p2, SERVER_EVENTS.roundScheduled),
  ]);
  await emitAck(p1, CLIENT_EVENTS.clientReady, { roomCode });
  await emitAck(p2, CLIENT_EVENTS.clientReady, { roomCode });
  return scheduled;
}

describe("a friend room takes the creator's alphabet", () => {
  it.each([
    ["sr", "en"],
    ["en", "sr"],
  ] as const)("creator on %s, joiner on %s", async (creatorLanguage, _joinerLanguage) => {
    await start();
    const p1 = await client();
    const p2 = await client();

    const created = await emitAck<{ roomCode: string }>(p1, CLIENT_EVENTS.createRoom, {
      displayName: "Ana",
      language: creatorLanguage,
    });
    if (!created.ok) throw new Error("room was not created");
    // Joining carries no language: the joiner never decides.
    const joined = await emitAck(p2, CLIENT_EVENTS.joinRoom, { roomCode: created.data.roomCode, displayName: "Marko" });
    expect(joined.ok).toBe(true);

    const [a, b] = await scheduleBoth(p1, p2, created.data.roomCode);
    expect(asked).toEqual([creatorLanguage]);
    expect(a.letter).toBe(LETTER_OF[creatorLanguage]);
    expect(b.letter).toBe(a.letter);
  });
});

describe("a random match takes the waiting player's alphabet", () => {
  it.each([
    ["en", "sr"],
    ["sr", "en"],
  ] as const)("waiting on %s, arriving on %s", async (waitingLanguage, arrivingLanguage) => {
    await start();
    const waiting = await client();
    const arriving = await client();

    const queued = await emitAck(waiting, CLIENT_EVENTS.quickPlay, { displayName: "Ana", language: waitingLanguage });
    expect(queued).toMatchObject({ ok: true, data: { status: "queued" } });
    const matched = await emitAck<{ status: string; roomCode: string }>(arriving, CLIENT_EVENTS.quickPlay, {
      displayName: "Marko",
      language: arrivingLanguage,
    });
    if (!matched.ok || matched.data.status !== "matched") throw new Error("not matched");

    const [a, b] = await scheduleBoth(waiting, arriving, matched.data.roomCode);
    expect(asked).toEqual([waitingLanguage]);
    expect(a.letter).toBe(LETTER_OF[waitingLanguage]);
    expect(b.letter).toBe(a.letter);
  });
});

describe("an AI room takes the human's alphabet", () => {
  it.each(["sr", "en"] as const)("human on %s", async (language) => {
    const ai = await start();
    const human = await client();

    const created = await emitAck<{ roomCode: string }>(human, CLIENT_EVENTS.playAi, { displayName: "Ana", language });
    if (!created.ok) throw new Error("AI room not created");
    const scheduled = waitFor<RoundScheduled>(human, SERVER_EVENTS.roundScheduled);
    await emitAck(human, CLIENT_EVENTS.clientReady, { roomCode: created.data.roomCode });

    expect((await scheduled).letter).toBe(LETTER_OF[language]);
    expect(asked).toEqual([language]);
    expect(ai.botCalls).toEqual([{ letter: LETTER_OF[language], alphabet: language }]);
  });

  it("keeps the room's alphabet when the player asks for a hint in the other language", async () => {
    const ai = await start();
    const human = await client();

    const created = await emitAck<{ roomCode: string }>(human, CLIENT_EVENTS.playAi, {
      displayName: "Ana",
      language: "sr",
    });
    if (!created.ok) throw new Error("AI room not created");
    const scheduled = waitFor<RoundScheduled>(human, SERVER_EVENTS.roundScheduled);
    await emitAck(human, CLIENT_EVENTS.clientReady, { roomCode: created.data.roomCode });
    const { roundId } = await scheduled;
    ctx!.advance(ctx!.config.countdownMs);

    const hint = await emitAck(human, CLIENT_EVENTS.hint, { roundId, category: "city", language: "en" });
    expect(hint.ok).toBe(true);
    expect(ai.hintCalls).toEqual([{ letter: "Lj", alphabet: "sr", category: "city", language: "en" }]);
  });
});

describe("opening a room without a valid language is refused and changes nothing", () => {
  it.each([
    [CLIENT_EVENTS.createRoom, { displayName: "Ana" }],
    [CLIENT_EVENTS.createRoom, { displayName: "Ana", language: "de" }],
    [CLIENT_EVENTS.quickPlay, { displayName: "Ana" }],
    [CLIENT_EVENTS.quickPlay, { displayName: "Ana", language: "SR" }],
    [CLIENT_EVENTS.playAi, { displayName: "Ana", language: null }],
  ])("%s with %j", async (event, payload) => {
    await start();
    const socket = await client();

    const result = await emitAck(socket, event, payload);
    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_PAYLOAD" } });
    expect(ctx!.server.store.getRoomBySocket(socket.id ?? "")).toBeUndefined();
    expect(ctx!.server.store.queueLength()).toBe(0);
    expect(asked).toEqual([]);
  });
});
