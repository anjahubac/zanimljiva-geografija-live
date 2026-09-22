import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { CATEGORIES } from "@contracts/game.schemas";
import type { HistoryEntry } from "@contracts/account.schemas";
import { createAccountStore, type AccountStore } from "@server/accounts/account-store";

const PASSWORD = "dovoljno duga sifra";
/** Derived, so a change to the category set cannot silently break the bound. */
const PERFECT_SCORE = CATEGORIES.length * 10;
const open = (clock?: () => number) => {
  const dir = mkdtempSync(join(tmpdir(), "zg-accounts-"));
  const store = createAccountStore(join(dir, "players.sqlite"), clock);
  return { store, dir, path: join(dir, "players.sqlite") };
};

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  roundId: randomUUID(),
  completedAt: 1_700_000_000_000,
  letter: "S",
  opponent: "Protivnik",
  answers: CATEGORIES.map((category) => ({ category, raw: "Srbija", valid: true, points: 10 })),
  total: PERFECT_SCORE,
  opponentTotal: 40,
  outcome: "win",
  ...over,
});

const dirs: string[] = [];
const stores: AccountStore[] = [];
const track = <T extends { store: AccountStore; dir: string }>(opened: T): T => {
  stores.push(opened.store);
  dirs.push(opened.dir);
  return opened;
};

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("accounts are keyed by email address", () => {
  it("registers once, then authenticates that address and refuses a wrong password", async () => {
    const { store } = track(open());

    const created = await store.authenticate({
      email: "ana@primer.rs",
      password: PASSWORD,
      displayName: "Ana",
    });
    expect(created.account?.email).toBe("ana@primer.rs");

    const again = await store.authenticate({
      email: "ana@primer.rs",
      password: PASSWORD,
      displayName: "Druga Ana",
    });
    expect(again.error).toBe("EMAIL_UNAVAILABLE");

    expect((await store.authenticate({ email: "ana@primer.rs", password: PASSWORD })).account?.id)
      .toBe(created.account?.id);
    expect(
      (await store.authenticate({ email: "ana@primer.rs", password: "pogresna duga sifra" })).error,
    ).toBe("AUTH_FAILED");
  });

  it("answers the same way for an address that was never registered", async () => {
    const { store } = track(open());
    const result = await store.authenticate({ email: "niko@primer.rs", password: PASSWORD });
    expect(result.error).toBe("AUTH_FAILED");
    expect(result.account).toBeUndefined();
  });

  it("issues a session, resolves it, and stops resolving it once revoked or expired", async () => {
    let now = 1_700_000_000_000;
    const { store } = track(open(() => now));
    const created = await store.authenticate({
      email: "ana@primer.rs",
      password: PASSWORD,
      displayName: "Ana",
    });
    const account = created.account!;

    const token = store.createSession(account);
    expect(store.getSession(token)?.email).toBe("ana@primer.rs");
    expect(store.getSession("not-a-token")).toBeNull();
    expect(store.getSession(undefined)).toBeNull();

    store.deleteSession(token);
    expect(store.getSession(token)).toBeNull();

    const second = store.createSession(account);
    now += 8 * 24 * 60 * 60 * 1_000;
    expect(store.getSession(second)).toBeNull();
  });

  it("keeps one row per round per player and never mixes two players' history", async () => {
    const { store } = track(open());
    const ana = (
      await store.authenticate({ email: "ana@primer.rs", password: PASSWORD, displayName: "Ana" })
    ).account!;
    const marko = (
      await store.authenticate({ email: "marko@primer.rs", password: PASSWORD, displayName: "Marko" })
    ).account!;

    const shared = entry();
    store.saveRound([
      { accountId: ana.id, entry: shared },
      { accountId: marko.id, entry: entry({ roundId: shared.roundId, outcome: "loss", total: 40 }) },
    ]);
    // The canonical close is idempotent; a repeated save must not double-count.
    store.saveRound([{ accountId: ana.id, entry: shared }]);

    const anaProfile = store.profile(ana, 1);
    expect(anaProfile.games).toBe(1);
    expect(anaProfile.points).toBe(PERFECT_SCORE);
    expect(anaProfile.wins).toBe(1);
    expect(anaProfile.history).toHaveLength(1);

    const markoProfile = store.profile(marko, 1);
    expect(markoProfile.wins).toBe(0);
    expect(markoProfile.points).toBe(40);
    expect(markoProfile.history[0]?.outcome).toBe("loss");
  });

  it("pages history newest first and counts every page in the totals", async () => {
    const { store } = track(open());
    const ana = (
      await store.authenticate({ email: "ana@primer.rs", password: PASSWORD, displayName: "Ana" })
    ).account!;

    store.saveRound(
      Array.from({ length: 25 }, (_, index) => ({
        accountId: ana.id,
        entry: entry({ completedAt: 1_700_000_000_000 + index, total: 10, outcome: "draw" }),
      })),
    );

    const first = store.profile(ana, 1);
    expect(first.games).toBe(25);
    expect(first.points).toBe(250);
    expect(first.history).toHaveLength(20);
    expect(store.profile(ana, 2).history).toHaveLength(5);
    expect(first.history[0]!.completedAt).toBeGreaterThan(first.history[19]!.completedAt);
  });

  it("still knows the account and its history after the database is reopened", async () => {
    const { store, dir, path } = track(open());
    const ana = (
      await store.authenticate({ email: "ana@primer.rs", password: PASSWORD, displayName: "Ana" })
    ).account!;
    store.saveRound([{ accountId: ana.id, entry: entry() }]);
    store.close();
    stores.splice(stores.indexOf(store), 1);

    const reopened = createAccountStore(path);
    stores.push(reopened);
    expect(dirs).toContain(dir);

    const signedIn = await reopened.authenticate({ email: "ana@primer.rs", password: PASSWORD });
    expect(signedIn.account?.id).toBe(ana.id);
    expect(reopened.profile(signedIn.account!, 1).games).toBe(1);
  });
});
