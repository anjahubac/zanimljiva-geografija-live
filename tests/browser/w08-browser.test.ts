/*
 * W08 real-browser checks for the round coach (`Plan.md` §2D). Chromium loads
 * the production client build (`dist/client`) from the real server with its
 * real headers; CSP is never bypassed. The opponent is a Socket.IO client in
 * Node; the AI service is the scriptable fake.
 *
 *   npm run test:browser   (builds the client first)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import type { Socket } from "socket.io-client";
import { serverConfigSchema } from "@contracts/game.schemas";
import { CLIENT_EVENTS, SERVER_EVENTS, type RoundScheduled } from "@contracts/socket.schemas";
import { createGameServer, CONTENT_SECURITY_POLICY, type GameServer } from "@server/index";
import { connectClient, emitAck, waitFor } from "../helpers/socket-client";
import { fakeAi } from "../fakes/fake-ai";

const XSS_NAME = "<svg/onload=__w08=1>"; // fits the 24-character name limit
const XSS_ANSWER = '<img src=x onerror="__w08=1">'; // fits the 40-character answer limit
const JS_URL_ANSWER = "javascript:__w08=1";
const NORMAL_NAME = "Đorđe O'Brien a < b";

let browser: Browser;
const opened: Array<{ server: GameServer; context: BrowserContext; bots: Socket[] }> = [];
let evil: Server;
let evilOrigin = "";

type Probe = { __w08?: unknown; __w08Inline?: boolean; __w08ExternalScript?: boolean; __cspViolations: Array<{ directive: string; blocked: string }> };

beforeAll(async () => {
  if (!existsSync(join(process.cwd(), "dist", "client", "index.html"))) throw new Error("Run `npm run build:client` first (npm run test:browser does).");
  try {
    browser = await chromium.launch();
  } catch {
    browser = await chromium.launch({ channel: "chrome" });
  }
  // A real, reachable script on another local origin: the CSP proof target.
  evil = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/javascript", "access-control-allow-origin": "*" });
    res.end("window.__w08ExternalScript = true;");
  });
  await new Promise<void>((resolve) => evil.listen(0, "127.0.0.1", () => resolve()));
  evilOrigin = `http://127.0.0.1:${(evil.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => evil.close(() => resolve()));
});

afterEach(async () => {
  for (const each of opened.splice(0)) {
    for (const bot of each.bots) bot.disconnect();
    await each.context.close();
    await each.server.close();
  }
});

async function launch(options: { securityHeaders?: boolean } = {}) {
  const server = createGameServer({
    config: serverConfigSchema.parse({ countdownMs: 1_000 }),
    selectLetter: () => "S",
    ai: fakeAi(),
    writeSecurityEvent: () => {},
    ...(options.securityHeaders === false ? { securityHeaders: false } : {}),
  });
  await new Promise<void>((resolve) => server.httpServer.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.httpServer.address() as AddressInfo).port;
  const context = await browser.newContext({ locale: "en-US" });
  const entry = { server, context, bots: [] as Socket[] };
  opened.push(entry);
  const page = await context.newPage();
  // Record CSP violations from the very first script.
  await page.addInitScript(() => {
    const probe = window as unknown as Probe;
    probe.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      probe.__cspViolations.push({ directive: event.effectiveDirective, blocked: event.blockedURI });
    });
  });
  const response = await page.goto(`http://127.0.0.1:${port}/`);
  return { page, port, entry, headers: response?.headers() ?? {} };
}

/** Plays one round: the page is player 1, a Node socket is the (hostile) opponent. */
async function playRound(page: Page, port: number, entry: { bots: Socket[] }, mine: Record<string, string>, theirName: string) {
  await page.fill("#lobby-name", NORMAL_NAME);
  await page.getByRole("button", { name: "Play a friend" }).click();
  const roomCode = (await page.locator(".room-code strong").textContent())?.trim() ?? "";
  const bot = await connectClient(port);
  entry.bots.push(bot);
  const scheduled = waitFor<RoundScheduled>(bot, SERVER_EVENTS.roundScheduled, 5_000);
  const joined = await emitAck(bot, CLIENT_EVENTS.joinRoom, { roomCode, displayName: theirName });
  if (!joined.ok) throw new Error(`bot could not join: ${JSON.stringify(joined)}`);
  // Both names as the waiting room lists them, read before the round starts.
  await page.getByText(theirName, { exact: false }).first().waitFor({ timeout: 5_000 });
  const waitingRoom = await domSafety(page);
  await emitAck(bot, CLIENT_EVENTS.clientReady, { roomCode });
  const round = await scheduled;
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, round.startsAt - Date.now()) + 100));
  await emitAck(bot, CLIENT_EVENTS.finish, { roundId: round.roundId });
  for (const [category, value] of Object.entries(mine)) {
    await page.fill(`#answer-${category}`, value);
    await page.locator(`#answer-${category}`).blur();
  }
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "I'm done" }).click();
  await page.getByRole("button", { name: "Analyse my round" }).waitFor({ timeout: 10_000 });
  return { waitingRoom };
}

/** DOM-level proof, not just the absence of a side effect. */
async function domSafety(page: Page) {
  return page.evaluate(() => ({
    marker: (window as unknown as Probe).__w08,
    withHandler: document.querySelectorAll("img[onerror], svg[onload], [onload], [onerror], [onmouseover]").length,
    injectedImgs: document.querySelectorAll("img[src='x']").length,
    jsLinks: [...document.querySelectorAll("a[href]")].filter((link) => /^\s*javascript:/i.test(link.getAttribute("href") ?? "")).length,
    text: document.body.innerText,
  }));
}

/** Adds one inline and one cross-origin script the way an XSS payload would. */
async function injectScripts(page: Page) {
  await page.evaluate((origin) => {
    const inline = document.createElement("script");
    inline.textContent = "window.__w08Inline = true;";
    document.head.appendChild(inline);
    const external = document.createElement("script");
    external.src = `${origin}/evil.js`;
    document.head.appendChild(external);
  }, evilOrigin);
  await page.waitForTimeout(500);
}

describe("W08 browser: CSP and safe rendering on the production build", () => {
  it("control (no headers): the same build WOULD run an inline script and a script from another local origin", async () => {
    const { page, headers } = await launch({ securityHeaders: false });
    expect(headers["content-security-policy"]).toBeUndefined();
    await injectScripts(page);
    const ran = await page.evaluate(() => ({ inline: (window as unknown as Probe).__w08Inline, external: (window as unknown as Probe).__w08ExternalScript }));
    expect(ran).toEqual({ inline: true, external: true });
  });

  it("with the real headers the game and the coach work with zero CSP violations; hostile text stays text; the scripts are blocked", async () => {
    const { page, port, entry, headers } = await launch();
    expect(headers["content-security-policy"]).toBe(CONTENT_SECURITY_POLICY);
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("no-referrer");

    // Lobby -> round -> results -> coach, under the policy. The page's own
    // answers are hostile; the coach panel shows them back as "Your answer".
    const { waitingRoom } = await playRound(page, port, entry, { river: XSS_ANSWER, animal: JS_URL_ANSWER, country: "Srbija" }, XSS_NAME);
    expect(waitingRoom).toMatchObject({ marker: undefined, withHandler: 0, injectedImgs: 0 });
    for (const name of [XSS_NAME, NORMAL_NAME]) expect(waitingRoom.text).toContain(name);
    await page.getByRole("button", { name: "Analyse my round" }).click();
    await page.getByText("Analysis complete.").waitFor({ timeout: 15_000 });

    const dom = await domSafety(page);
    expect(dom.marker).toBeUndefined();
    expect(dom.withHandler).toBe(0);
    expect(dom.injectedImgs).toBe(0);
    expect(dom.jsLinks).toBe(0);
    for (const text of [XSS_ANSWER, JS_URL_ANSWER]) expect(dom.text).toContain(text);
    expect(await page.evaluate(() => document.styleSheets.length)).toBeGreaterThan(0);
    expect(await page.evaluate(() => (window as unknown as Probe).__cspViolations)).toEqual([]);

    await injectScripts(page);
    const ran = await page.evaluate(() => ({ inline: (window as unknown as Probe).__w08Inline, external: (window as unknown as Probe).__w08ExternalScript }));
    expect(ran).toEqual({ inline: undefined, external: undefined });
    expect(await page.evaluate(() => (window as unknown as Probe).__cspViolations)).toEqual(
      expect.arrayContaining([
        { directive: "script-src-elem", blocked: "inline" },
        { directive: "script-src-elem", blocked: `${evilOrigin}/evil.js` },
      ]),
    );
  });
});
