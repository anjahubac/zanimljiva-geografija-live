import { createRequire } from "node:module";
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  accountSchema,
  historyEntrySchema,
  profileSchema,
  type Account,
  type HistoryEntry,
} from "@contracts/account.schemas";

// Vitest 2 predates node:sqlite; resolve the built-in through Node itself.
const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");

const SESSION_MS = 7 * 24 * 60 * 60 * 1_000;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const credentialsSchema = accountSchema.extend({ salt: z.string(), hash: z.string() });
const derive = (password: string, salt: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });

export function createAccountStore(path: string, now = Date.now) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, displayName TEXT NOT NULL,
      salt TEXT NOT NULL, hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      tokenHash TEXT PRIMARY KEY, accountId TEXT NOT NULL REFERENCES accounts(id), expiresAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS history (
      accountId TEXT NOT NULL REFERENCES accounts(id), roundId TEXT NOT NULL,
      completedAt INTEGER NOT NULL, total INTEGER NOT NULL, outcome TEXT NOT NULL,
      entry TEXT NOT NULL, PRIMARY KEY(accountId, roundId)
    );
    CREATE INDEX IF NOT EXISTS history_order ON history(accountId, completedAt DESC, roundId DESC);
  `);

  // Bound concurrent password hashing to keep memory use independent of a flood.
  let hashing = false;
  async function authenticate(input: { email: string; password: string; displayName?: string }) {
    if (hashing) return { error: "RATE_LIMITED" } as const;
    hashing = true;
    try {
      const raw = db.prepare("SELECT * FROM accounts WHERE email = ?").get(input.email);
      if (input.displayName !== undefined) {
        if (raw) return { error: "EMAIL_UNAVAILABLE" } as const;
        const salt = randomBytes(16).toString("hex");
        const hash = (await derive(input.password, salt)).toString("hex");
        const account = accountSchema.parse({
          id: randomUUID(),
          email: input.email,
          displayName: input.displayName,
        });
        db.prepare(
          "INSERT INTO accounts (id, email, displayName, salt, hash) VALUES (?, ?, ?, ?, ?)",
        ).run(account.id, account.email, account.displayName, salt, hash);
        return { account };
      }
      const stored = raw ? credentialsSchema.parse(raw) : null;
      // An address with no account still pays the same hashing cost, so the
      // reply time does not disclose who is registered.
      const key = await derive(input.password, stored?.salt ?? "0".repeat(32));
      if (!stored || !timingSafeEqual(key, Buffer.from(stored.hash, "hex")))
        return { error: "AUTH_FAILED" } as const;
      return {
        account: accountSchema.parse({
          id: stored.id,
          email: stored.email,
          displayName: stored.displayName,
        }),
      };
    } finally {
      hashing = false;
    }
  }

  function createSession(account: Account): string {
    db.prepare("DELETE FROM sessions WHERE expiresAt <= ?").run(now());
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions VALUES (?, ?, ?)").run(
      hashToken(token),
      account.id,
      now() + SESSION_MS,
    );
    return token;
  }

  function getSession(token: string | undefined): Account | null {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const row = db
      .prepare(
        `SELECT a.id, a.email, a.displayName FROM accounts a
         JOIN sessions s ON s.accountId = a.id WHERE s.tokenHash = ? AND s.expiresAt > ?`,
      )
      .get(hashToken(token), now());
    return row ? accountSchema.parse(row) : null;
  }

  function deleteSession(token: string | undefined) {
    if (token) db.prepare("DELETE FROM sessions WHERE tokenHash = ?").run(hashToken(token));
  }

  function saveRound(entries: { accountId: string; entry: HistoryEntry }[]) {
    const validated = entries.map(({ accountId, entry }) => ({
      accountId,
      entry: historyEntrySchema.parse(entry),
    }));
    db.exec("BEGIN IMMEDIATE");
    try {
      const insert = db.prepare("INSERT OR IGNORE INTO history VALUES (?, ?, ?, ?, ?, ?)");
      for (const { accountId, entry } of validated) {
        insert.run(
          accountId,
          entry.roundId,
          entry.completedAt,
          entry.total,
          entry.outcome,
          JSON.stringify(entry),
        );
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function profile(account: Account, page: number) {
    const stats = db
      .prepare(
        `SELECT COUNT(*) AS games, COALESCE(SUM(total), 0) AS points,
         COALESCE(SUM(CASE WHEN outcome = 'win' THEN 1 ELSE 0 END), 0) AS wins
         FROM history WHERE accountId = ?`,
      )
      .get(account.id);
    const rows = db
      .prepare(
        "SELECT entry FROM history WHERE accountId = ? ORDER BY completedAt DESC, roundId DESC LIMIT 20 OFFSET ?",
      )
      .all(account.id, (page - 1) * 20);
    return profileSchema.parse({
      account,
      ...stats,
      page,
      pageSize: 20,
      history: rows.map((row) => historyEntrySchema.parse(JSON.parse(z.string().parse(row.entry)))),
    });
  }

  return {
    authenticate,
    createSession,
    getSession,
    deleteSession,
    saveRound,
    profile,
    close: () => db.close(),
  };
}
export type AccountStore = ReturnType<typeof createAccountStore>;
