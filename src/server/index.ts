import { createServer, type IncomingMessage, type Server as HttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Server as SocketServer } from "socket.io";
import type { ServerConfig } from "@contracts/game.schemas";
import type { Clock, Scheduler } from "@server/clock";
import { systemClock, systemScheduler } from "@server/clock";
import { loadConfig } from "@server/config";
import type { LetterSelector } from "@server/letters";
import { randomLetterSelector } from "@server/letters";
import { createAiServiceFromEnv, type AiService } from "@server/ai/service";
import { createRoomStore, type RoomStore } from "@server/rooms/room-store";
import { registerHandlers } from "@server/socket/register-handlers";
import { createUsageLimits } from "@server/usage-limits";

const CLIENT_DIR = join(process.cwd(), "dist", "client");
const CLEANUP_INTERVAL_MS = 60_000;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

async function serveStatic(urlPath: string): Promise<{ body: Buffer; type: string } | null> {
  // Strip the query string and any traversal before touching the filesystem.
  const pathOnly = urlPath.split("?")[0] ?? "/";
  const relative = normalize(pathOnly)
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/^\/+/, "");
  const candidate = relative === "" ? "index.html" : relative;
  try {
    const body = await readFile(join(CLIENT_DIR, candidate));
    return { body, type: CONTENT_TYPES[extname(candidate)] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

/**
 * A browser on another site must not open a socket to this game with the
 * player's connection (cross-site WebSocket hijacking). Non-browser clients
 * send no Origin and are allowed.
 */
export function sameOrigin(req: IncomingMessage): boolean {
  try {
    const origin = new URL(req.headers.origin ?? "");
    return (origin.protocol === "http:" || origin.protocol === "https:") && origin.host === req.headers.host;
  } catch {
    return false;
  }
}

export type GameServerDeps = {
  config: ServerConfig;
  clock?: Clock;
  scheduler?: Scheduler;
  selectLetter?: LetterSelector;
  /** The AI checker, bot and hints; absent means the local letter rule only (§2B). */
  ai?: AiService | null;
  random?: () => number;
};

export type GameServer = {
  httpServer: HttpServer;
  io: SocketServer;
  store: RoomStore;
  close(): Promise<void>;
};

/**
 * Wires the transport to the room store. Clock, scheduler and letter selection
 * are injected so a test can drive time and pin the letter; production passes
 * the system implementations.
 */
export function createGameServer(deps: GameServerDeps): GameServer {
  const {
    config,
    clock = systemClock,
    scheduler = systemScheduler,
    selectLetter = randomLetterSelector,
  } = deps;

  const httpServer = createServer((req, res) => {
    void (async () => {
      if (req.url === "/healthz") {
        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      const asset = await serveStatic(req.url ?? "/");
      if (asset) {
        res.writeHead(200, { "content-type": asset.type });
        res.end(asset.body);
        return;
      }

      // SPA fallback so a refreshed client route still loads the app.
      const index = await serveStatic("/index.html");
      if (index) {
        res.writeHead(200, { "content-type": index.type });
        res.end(index.body);
        return;
      }

      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found. Run `npm run build:client` first.");
    })().catch(() => {
      if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
      res.end("Internal server error");
    });
  });

  const io = new SocketServer(httpServer);
  io.use((socket, next) => {
    if (socket.request.headers.origin && !sameOrigin(socket.request)) return next(new Error("Origin not allowed"));
    next();
  });

  const store = createRoomStore({
    clock,
    scheduler,
    selectLetter,
    config,
    ai: deps.ai ?? null,
    limits: createUsageLimits(config),
    ...(deps.random ? { random: deps.random } : {}),
    // The store addresses a recipient; only this line knows about sockets.
    deliver: ({ socketId, event, payload }) => {
      io.to(socketId).emit(event, payload);
    },
  });

  registerHandlers(io, store, { trustProxyHops: config.trustProxyHops });

  return {
    httpServer,
    io,
    store,
    async close() {
      await io.close();
      await new Promise<void>((done) => {
        httpServer.close(() => done());
      });
    },
  };
}

/* ---------------------------------------------------------- bootstrap */

const entryPoint = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPoint === fileURLToPath(import.meta.url)) {
  const config = loadConfig(process.env);
  const ai = createAiServiceFromEnv(process.env);
  // Which providers are on, never a key.
  console.info(
    ai
      ? `AI checker, opponent and hints: on (${ai.providers.join(" -> ")})`
      : "AI: off — set GEMINI_API_KEY and/or GROQ_API_KEY to enable it",
  );
  if (ai && config.nodeEnv === "production" && config.trustProxyHops === 0) {
    // Behind a host proxy every visitor would share the proxy's address, and so one AI limit (§2B.11).
    console.warn("[limits] TRUST_PROXY_HOPS is 0: behind a host proxy, all visitors share one AI usage limit");
  }
  const server = createGameServer({ config, ai: ai?.service ?? null });

  const cleanupTimer = setInterval(() => server.store.cleanup(), CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();

  server.httpServer.listen(config.port, () => {
    console.info(`server listening on http://localhost:${config.port}`);
  });
}
