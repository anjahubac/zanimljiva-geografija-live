/**
 * Walking skeleton only: health endpoint plus static serving of the built SPA.
 * The authoritative game server (createGameServer) arrives in Step 6 of
 * .github/instructions/10-implementation-order.instructions.md
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT ?? 3000);
const CLIENT_DIR = join(process.cwd(), "dist", "client");

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

async function serveStatic(urlPath: string): Promise<{ body: Buffer; type: string } | null> {
  const relative = normalize(urlPath).replace(/^(\.\.[/\\])+/, "").replace(/^\/+/, "");
  const candidate = relative === "" ? "index.html" : relative;
  try {
    const body = await readFile(join(CLIENT_DIR, candidate));
    return { body, type: CONTENT_TYPES[extname(candidate)] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

const server = createServer((req, res) => {
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

server.listen(PORT, () => {
  console.info(`server listening on http://localhost:${PORT}`);
});
