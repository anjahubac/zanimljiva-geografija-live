import { createServer, type Server as HttpServer } from "node:http";
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
import { createRoomStore, type RoomStore } from "@server/rooms/room-store";
import { registerHandlers } from "@server/socket/register-handlers";

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

export type GameServerDeps = {
  config: ServerConfig;
  clock?: Clock;
  scheduler?: Scheduler;
  selectLetter?: LetterSelector;
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
    })();
  });

  const io = new SocketServer(httpServer);

  const store = createRoomStore({
    clock,
    scheduler,
    selectLetter,
    config,
    // The store addresses a recipient; only this line knows about sockets.
    deliver: ({ socketId, event, payload }) => {
      io.to(socketId).emit(event, payload);
    },
  });

  registerHandlers(io, store);

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
  const server = createGameServer({ config });

  const cleanupTimer = setInterval(() => server.store.cleanup(), CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();

  server.httpServer.listen(config.port, () => {
    console.info(`server listening on http://localhost:${config.port}`);
  });
}
