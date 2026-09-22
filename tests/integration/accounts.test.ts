import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { accountSchema } from "@contracts/account.schemas";
import { createAccountStore, type AccountStore } from "@server/accounts/account-store";
import { startTestServer, type TestContext } from "../helpers/test-server";

const PASSWORD = "dovoljno duga sifra";

describe("the account API over HTTP", () => {
  let ctx: TestContext;
  let accounts: AccountStore;
  let dir: string;
  let origin: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "zg-api-"));
    accounts = createAccountStore(join(dir, "players.sqlite"));
    ctx = await startTestServer({ accounts });
    origin = `http://localhost:${ctx.port}`;
  });

  afterEach(async () => {
    await ctx.close();
    accounts.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${origin}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, ...headers },
      body: JSON.stringify(body),
    });

  const cookieFrom = (response: Response): string => {
    const header = response.headers.get("set-cookie") ?? "";
    return header.split(";")[0]!;
  };

  it("registers an address, then recognizes its session cookie", async () => {
    const registered = await post("/api/register", {
      email: "Ana@Primer.RS",
      password: PASSWORD,
      displayName: "Ana",
    });
    expect(registered.status).toBe(200);

    const body = await registered.json();
    expect(accountSchema.parse(body.account).email).toBe("ana@primer.rs");

    const setCookie = registered.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    // The token itself must never be readable by page scripts.
    expect(setCookie).not.toContain("Secure"); // test server is plain http
    expect(body.account.hash).toBeUndefined();
    expect(body.account.password).toBeUndefined();

    const session = await fetch(`${origin}/api/session`, {
      headers: { cookie: cookieFrom(registered) },
    });
    expect((await session.json()).account.email).toBe("ana@primer.rs");
  });

  it("refuses a second account on the same address, whatever its casing", async () => {
    await post("/api/register", { email: "ana@primer.rs", password: PASSWORD, displayName: "Ana" });
    const again = await post("/api/register", {
      email: "ANA@primer.rs",
      password: PASSWORD,
      displayName: "Druga",
    });
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "EMAIL_UNAVAILABLE" });
  });

  it("logs in on a second client and logs out without touching the first", async () => {
    const registered = await post("/api/register", {
      email: "ana@primer.rs",
      password: PASSWORD,
      displayName: "Ana",
    });
    const firstCookie = cookieFrom(registered);

    const login = await post("/api/login", { email: "ana@primer.rs", password: PASSWORD });
    expect(login.status).toBe(200);
    const secondCookie = cookieFrom(login);
    expect(secondCookie).not.toBe(firstCookie);

    const loggedOut = await post("/api/logout", {}, { cookie: secondCookie });
    expect(loggedOut.status).toBe(200);

    const dead = await fetch(`${origin}/api/session`, { headers: { cookie: secondCookie } });
    expect((await dead.json()).account).toBeNull();

    const alive = await fetch(`${origin}/api/session`, { headers: { cookie: firstCookie } });
    expect((await alive.json()).account.email).toBe("ana@primer.rs");
  });

  it("rejects a wrong password without saying whether the address is known", async () => {
    await post("/api/register", { email: "ana@primer.rs", password: PASSWORD, displayName: "Ana" });

    const wrong = await post("/api/login", { email: "ana@primer.rs", password: "pogresna sifra x" });
    const unknown = await post("/api/login", { email: "niko@primer.rs", password: PASSWORD });

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
  });

  it("refuses a write from another origin and a payload it did not ask for", async () => {
    const crossOrigin = await post(
      "/api/register",
      { email: "ana@primer.rs", password: PASSWORD, displayName: "Ana" },
      { origin: "http://zlonamerni.example" },
    );
    expect(crossOrigin.status).toBe(403);

    const extraKey = await post("/api/register", {
      email: "ana@primer.rs",
      password: PASSWORD,
      displayName: "Ana",
      admin: true,
    });
    expect(extraKey.status).toBe(400);

    const notJson = await fetch(`${origin}/api/register`, {
      method: "POST",
      headers: { "content-type": "text/plain", origin },
      body: "email=ana",
    });
    expect(notJson.status).toBe(400);
  });

  it("keeps the profile behind the session and never leaks another player's", async () => {
    const anonymous = await fetch(`${origin}/api/profile`);
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toEqual({ error: "UNAUTHORIZED" });

    const registered = await post("/api/register", {
      email: "ana@primer.rs",
      password: PASSWORD,
      displayName: "Ana",
    });
    const profile = await fetch(`${origin}/api/profile`, {
      headers: { cookie: cookieFrom(registered) },
    });
    expect(profile.status).toBe(200);

    const body = await profile.json();
    expect(body.account.email).toBe("ana@primer.rs");
    expect(body.games).toBe(0);
    expect(body.history).toEqual([]);
    expect(body.pageSize).toBe(20);
  });
});
