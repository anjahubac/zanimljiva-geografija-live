import type { AddressInfo } from "node:net";
import { serverConfigSchema, type Letter, type ServerConfig } from "@contracts/game.schemas";
import type { AiService } from "@server/ai/service";
import { createGameServer, type GameServer } from "@server/index";
import type { LetterSelector } from "@server/letters";
import { createTestClock } from "./test-clock";

export type TestContext = {
  server: GameServer;
  port: number;
  config: ServerConfig;
  advance: (ms: number) => void;
  setNow: (atMs: number) => void;
  now: () => number;
  close: () => Promise<void>;
};

/**
 * Binds port 0 and injects the test clock, so round timing is driven explicitly
 * while Socket.IO keeps its real timers (module 13).
 */
export async function startTestServer(
  options: {
    letter?: Letter;
    /** Overrides `letter`: sees the room's alphabet, for tests of which alphabet a room gets. */
    selectLetter?: LetterSelector;
    config?: Record<string, unknown>;
    ai?: AiService;
    random?: () => number;
  } = {},
): Promise<TestContext> {
  const { clock, scheduler, advance, setNow } = createTestClock();
  const config = serverConfigSchema.parse(options.config ?? {});
  const letter: Letter = options.letter ?? "S";

  const server = createGameServer({
    config,
    clock,
    scheduler,
    selectLetter: options.selectLetter ?? (() => letter),
    ai: options.ai ?? null,
    ...(options.random ? { random: options.random } : {}),
  });

  await new Promise<void>((resolve) => {
    server.httpServer.listen(0, () => resolve());
  });
  const port = (server.httpServer.address() as AddressInfo).port;

  return {
    server,
    port,
    config,
    advance,
    setNow,
    now: () => clock.now(),
    close: () => server.close(),
  };
}
