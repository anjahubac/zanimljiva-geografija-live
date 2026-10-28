import { createPostRoundCoach } from "@server/features/post-round-coach";
import type { Room } from "@server/rooms/room-store";
import { securityEventSchema, type SecurityEvent } from "@server/security-events";
import { createFakeCoachAdapter, type CoachScriptEntry } from "../fakes/fake-coach";

/** Synthetic server secret (W08 §F). Never a real credential. */
export const SENTINEL = "W08_SERVER_SECRET_DO_NOT_EXPOSE";

export const toolRequest = (name = "analyze_round", args: unknown = { focus: "overview" }) =>
  JSON.stringify({ kind: "tool_request", toolRequest: { name, arguments: args } });

/** A final that is eligible for a sheet whose `city` cell is blank. */
export const finalCityBlank = JSON.stringify({
  kind: "final",
  final: { findingIds: ["cell:city"], recommendations: [{ code: "practice_recall", category: "city", evidenceIds: ["cell:city"] }], completed: true },
});

/** The production coach over a scripted adapter; telemetry and calls are inspectable. */
export function scriptedCoach(script: CoachScriptEntry[], modelChain: string[] = ["fake-model"]) {
  const fake = createFakeCoachAdapter(script);
  const telemetry: string[] = [];
  const coach = createPostRoundCoach({ adapter: fake.adapter, modelChain, thinkingLevel: null, writeTelemetry: (line) => telemetry.push(line) });
  return { coach, fake, telemetry };
}

/** Collects W08 security events and checks every line is one valid event. */
export function securityEvents() {
  const lines: string[] = [];
  return {
    write: (line: string) => lines.push(line),
    lines,
    events: (): SecurityEvent[] => lines.map((line) => securityEventSchema.parse(JSON.parse(line))),
  };
}

/** The canonical game facts a read-only coach run must never change. */
export function canonicalState(room: Room | undefined) {
  if (!room) return null;
  return JSON.parse(JSON.stringify({
    phase: room.phase,
    resultsAt: room.resultsAt,
    round: room.round && { roundId: room.round.roundId, letter: room.round.letter, closed: room.round.closed, revealed: room.round.revealed, endsAt: room.round.endsAt },
    players: Object.values(room.players).map((player) => ({
      slot: player.slot, finished: player.finished, lockedAnswers: player.lockedAnswers,
      drafts: player.drafts, hinted: [...player.hinted], coachSource: player.coachSource,
    })),
  })) as unknown;
}

export async function flush(times = 5): Promise<void> {
  for (let index = 0; index < times; index += 1) await new Promise((resolve) => setImmediate(resolve));
}
