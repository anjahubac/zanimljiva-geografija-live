import type { IncomingMessage, ServerResponse } from "node:http";
import { accountErrorSchema, historyQuerySchema, loginSchema, registerSchema, type AccountError } from "@contracts/account.schemas";
import type { AccountStore } from "./account-store";

const COOKIE = "zg_session";
export function sessionToken(cookie: string | undefined): string | undefined {
  return cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
}
export function sameOrigin(req: IncomingMessage): boolean {
  try {
    const origin = new URL(req.headers.origin ?? "");
    return (origin.protocol === "http:" || origin.protocol === "https:") && origin.host === req.headers.host;
  } catch { return false; }
}

export function createAccountHttp(accounts: AccountStore, secure: boolean) {
  const attempts = new Map<string, { count: number; until: number }>();
  function allow(key: string) {
    const now = Date.now();
    for (const [address, bucket] of attempts) if (bucket.until <= now) attempts.delete(address);
    const bucket = attempts.get(key);
    if (bucket) return ++bucket.count <= 20;
    if (attempts.size >= 10_000) return false;
    attempts.set(key, { count: 1, until: now + 15 * 60_000 });
    return true;
  }
  const cookie = (token: string, maxAge: number) => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/api/")) return false;
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
      res.end(JSON.stringify(body));
    };
    const reject = (status: number, error: AccountError) => send(status, accountErrorSchema.parse({ error }));
    try {
      const token = sessionToken(req.headers.cookie);
      if (req.method === "GET" && url.pathname === "/api/session") {
        send(200, { account: accounts.getSession(token) });
      } else if (req.method === "GET" && url.pathname === "/api/profile") {
        const account = accounts.getSession(token);
        const query = historyQuerySchema.safeParse(Object.fromEntries(url.searchParams));
        if (!account) reject(401, "UNAUTHORIZED");
        else if (!query.success) reject(400, "INVALID_INPUT");
        else send(200, accounts.profile(account, query.data.page));
      } else if (req.method === "POST" && ["/api/register", "/api/login", "/api/logout"].includes(url.pathname)) {
        if (!sameOrigin(req)) { reject(403, "FORBIDDEN"); return true; }
        if (url.pathname === "/api/logout") {
          accounts.deleteSession(token);
          res.setHeader("set-cookie", cookie("", 0));
          send(200, { account: null });
          return true;
        }
        // Do not trust X-Forwarded-For from arbitrary clients. Behind a proxy
        // this deliberately shares a conservative budget per proxy address.
        if (!allow(req.socket.remoteAddress ?? "unknown")) { reject(429, "RATE_LIMITED"); return true; }
        if (req.headers["content-type"]?.split(";")[0] !== "application/json") { reject(400, "INVALID_INPUT"); return true; }
        let length = 0;
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          length += bytes.length;
          if (length > 4096) { reject(413, "INVALID_INPUT"); return true; }
          chunks.push(bytes);
        }
        let body: unknown;
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
        catch { reject(400, "INVALID_INPUT"); return true; }
        const parsed = (url.pathname === "/api/register" ? registerSchema : loginSchema).safeParse(body);
        if (!parsed.success) { reject(400, "INVALID_INPUT"); return true; }
        const result = await accounts.authenticate(parsed.data);
        if (result.error) reject(result.error === "RATE_LIMITED" ? 429 : result.error === "AUTH_FAILED" ? 401 : 409, result.error);
        else {
          accounts.deleteSession(token);
          res.setHeader("set-cookie", cookie(accounts.createSession(result.account), 7 * 24 * 60 * 60));
          send(200, { account: result.account });
        }
      } else reject(404, "NOT_FOUND");
    } catch {
      // Never log credentials, database contents, or rejected payloads.
      reject(500, "INTERNAL");
    }
    return true;
  };
}
