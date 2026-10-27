import type { Socket } from "socket.io-client";
import { CLIENT_EVENTS, SERVER_EVENTS, type RoundScheduled } from "@contracts/socket.schemas";
import { connectClient, emitAck, waitFor } from "./socket-client";
import type { TestContext } from "./test-server";

export type PlayedRound = { p1: Socket; p2: Socket; roomCode: string; roundId: string };

/**
 * Plays one friend room to the results screen through the real socket API, so
 * the coach source is captured by the production `closeRound` path.
 */
export async function playRoundToResults(
  ctx: Pick<TestContext, "port" | "advance" | "config">,
  options: {
    names?: [string, string];
    answers?: [Record<string, string>, Record<string, string>];
    headers?: [Record<string, string> | undefined, Record<string, string> | undefined];
  } = {},
): Promise<PlayedRound> {
  const [name1, name2] = options.names ?? ["Ana", "Bojan"];
  const p1 = await connectClient(ctx.port, options.headers?.[0]);
  const p2 = await connectClient(ctx.port, options.headers?.[1]);
  const created = await emitAck<{ roomCode: string }>(p1, CLIENT_EVENTS.createRoom, { displayName: name1, language: "sr" });
  if (!created.ok) throw new Error("room was not created");
  const joined = await emitAck(p2, CLIENT_EVENTS.joinRoom, { roomCode: created.data.roomCode, displayName: name2 });
  if (!joined.ok) throw new Error("room was not joined");
  const scheduled = waitFor<RoundScheduled>(p1, SERVER_EVENTS.roundScheduled);
  await emitAck(p1, CLIENT_EVENTS.clientReady, { roomCode: created.data.roomCode });
  await emitAck(p2, CLIENT_EVENTS.clientReady, { roomCode: created.data.roomCode });
  const round = await scheduled;
  ctx.advance(ctx.config.countdownMs);
  for (const [index, socket] of [p1, p2].entries()) {
    for (const [category, value] of Object.entries(options.answers?.[index] ?? {})) {
      await emitAck(socket, CLIENT_EVENTS.draft, { roundId: round.roundId, category, value, revision: 1 });
    }
  }
  const results = waitFor(p1, SERVER_EVENTS.roundResults);
  await emitAck(p1, CLIENT_EVENTS.finish, { roundId: round.roundId });
  await emitAck(p2, CLIENT_EVENTS.finish, { roundId: round.roundId });
  await results;
  return { p1, p2, roomCode: created.data.roomCode, roundId: round.roundId };
}

/** A coach request exactly as the browser sends it. */
export function coachRequestFor(roundId: string, language: "sr" | "en" = "sr") {
  return { roundId, goalId: "review_round", language };
}
