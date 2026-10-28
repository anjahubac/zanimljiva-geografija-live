/*
 * W08 Secure the Arcade — real-browser checks (specs/011-secure-the-arcade).
 * Chromium loads the production client build (`dist/client`) from the real
 * server with its real headers; CSP is never bypassed. The opponent is a
 * Socket.IO client in Node; the provider is a scripted fake.
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
import { coachJson } from "../fakes/fake-coach";
import { connectClient, emitAck, waitFor } from "../helpers/socket-client";
import { finalCityBlank, scriptedCoach, securityEvents, toolRequest } from "../security/w08-fixtures";

const XSS_NAME = "<svg/onload=__w08=1>"; // fits the 24-character name limit
const XSS_ANSWER = '<img src=x onerror="__w08=1">'; // fits the 40-character answer limit
const JS_URL_ANSWER = "javascript:__w08=1";
const MD_LINK_ANSWER = "[klik](javascript:__w08=1)";
const NORMAL_NAME = "Đorđe O'Brien a < b";
const NORMAL_ANSWER = "Šabac & Čačak 'ž' a<b";

let browser: Browser;
const opened: Array<{ server: GameServer; context: BrowserContext; bots: Socket[] }> = [];
let evil: Server;
let evilOrigin = "";

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

async function launch(options: { script?: Parameters<typeof scriptedCoach>[0]; securityHeaders?: boolean; init?: () => void } = {}) {
  const { coach, fake } = scriptedCoach(options.script ?? [coachJson(toolRequest()), coachJson(finalCityBlank)]);
  const log = securityEvents();
  const server = createGameServer({
    config: serverConfigSchema.parse({ countdownMs: 1_000 }),
    coach,
    writeSecurityEvent: log.write,
    ...(options.securityHeaders === false ? { securityHeaders: false } : {}),
  });
  await new Promise<void>((resolve) => server.httpServer.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.httpServer.address() as AddressInfo).port;
  const context = await browser.newContext({ locale: "en-US" });
  const entry = { server, context, bots: [] as Socket[] };
  opened.push(entry);
  const page = await context.newPage();
  // Record CSP violations and console errors from the very first script.
  await page.addInitScript(() => {
    (window as unknown as { __cspViolations: unknown[] }).__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { __cspViolations: unknown[] }).__cspViolations.push({ directive: event.effectiveDirective, blocked: event.blockedURI });
    });
  });
  if (options.init) await page.addInitScript(options.init);
  const response = await page.goto(`http://127.0.0.1:${port}/`);
  return { page, port, fake, log, entry, headers: response?.headers() ?? {} };
}

/** Plays one round: the page is player 1, a Node socket is the (hostile) opponent. */
async function playRound(page: Page, port: number, entry: { bots: Socket[] }, mine: Record<string, string>, theirs: Record<string, string>, theirName = XSS_NAME) {
  await page.fill("#lobby-name", NORMAL_NAME);
  await page.getByRole("button", { name: "Play a friend" }).click();
  const roomCode = (await page.locator(".room-code strong").textContent())?.trim() ?? "";
  const bot = await connectClient(port);
  entry.bots.push(bot);
  const scheduled = waitFor<RoundScheduled>(bot, SERVER_EVENTS.roundScheduled, 5_000);
  const joined = await emitAck(bot, CLIENT_EVENTS.joinRoom, { roomCode, displayName: theirName });
  if (!joined.ok) throw new Error(`bot could not join: ${JSON.stringify(joined)}`);
  // Both names as the waiting room lists them, read before the round starts.
  await page.locator(".players").getByText(theirName, { exact: false }).waitFor({ timeout: 5_000 });
  const waitingRoom = await domSafety(page);
  await emitAck(bot, CLIENT_EVENTS.clientReady, { roomCode });
  const round = await scheduled;
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, round.startsAt - Date.now()) + 100));
  for (const [category, value] of Object.entries(theirs)) {
    const saved = await emitAck(bot, CLIENT_EVENTS.draft, { roundId: round.roundId, category, value, revision: 1 });
    if (!saved.ok) throw new Error(`bot draft refused: ${JSON.stringify(saved)}`);
  }
  await emitAck(bot, CLIENT_EVENTS.finish, { roundId: round.roundId });
  for (const [category, value] of Object.entries(mine)) {
    await page.fill(`#answer-${category}`, value);
    await page.locator(`#answer-${category}`).blur();
  }
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "I'm done" }).click();
  await page.getByRole("button", { name: "Analyze my round" }).waitFor({ timeout: 10_000 });
  return { waitingRoom };
}

/** DOM-level proof, not just the absence of a side effect. */
async function domSafety(page: Page) {
  return page.evaluate(() => ({
    marker: (window as unknown as { __w08?: unknown }).__w08,
    imgWithHandler: document.querySelectorAll("img[onerror], svg[onload], [onload], [onerror], [onmouseover]").length,
    injectedImgs: document.querySelectorAll("img[src='x']").length,
    jsLinks: [...document.querySelectorAll("a[href]")].filter((link) => /^\s*javascript:/i.test(link.getAttribute("href") ?? "")).length,
    scriptCount: document.querySelectorAll("script").length,
    text: document.body.innerText,
  }));
}

describe("W08 browser: rendering, storage and CSP on the production build", () => {
  it("T04/T05/I5: hostile name and answers render as inert text; normal Serbian text, apostrophes and a < b survive", async () => {
    const { page, port, entry } = await launch();
    const scriptsBefore = await page.evaluate(() => document.querySelectorAll("script").length);
    const { waitingRoom } = await playRound(page, port, entry, { country: "Srbija", thing: NORMAL_ANSWER }, { city: XSS_ANSWER, river: JS_URL_ANSWER, thing: MD_LINK_ANSWER });
    // Waiting room: the hostile opponent name is text, the normal name is intact.
    expect(waitingRoom.marker).toBeUndefined();
    expect(waitingRoom.imgWithHandler).toBe(0);
    expect(waitingRoom.text).toContain(XSS_NAME);
    expect(waitingRoom.text).toContain(NORMAL_NAME);

    const dom = await domSafety(page);
    expect(dom.marker).toBeUndefined();
    expect(dom.imgWithHandler).toBe(0);
    expect(dom.injectedImgs).toBe(0);
    expect(dom.jsLinks).toBe(0);
    expect(dom.scriptCount).toBe(scriptsBefore);
    // Shown literally, as text.
    expect(dom.text).toContain(XSS_ANSWER);
    expect(dom.text).toContain(JS_URL_ANSWER);
    expect(dom.text).toContain(MD_LINK_ANSWER);
    expect(dom.text).toContain(NORMAL_ANSWER);
  });

  it("T04: a model 'final answer' carrying markup is refused by the server and the UI shows only a fixed localized status", async () => {
    const markupFinal = JSON.stringify({ kind: "final", final: { findingIds: [XSS_ANSWER], recommendations: [{ code: "practice_recall", category: "city", evidenceIds: ["cell:city"] }], completed: true } });
    const { page, port, entry, fake } = await launch({ script: [coachJson(toolRequest()), coachJson(markupFinal)] });
    await playRound(page, port, entry, { country: "Srbija" }, {}, "Bot");
    await page.getByRole("button", { name: "Analyze my round" }).click();
    await page.getByText("The final review could not be validated.").waitFor({ timeout: 10_000 });
    const dom = await domSafety(page);
    expect(fake.calls).toHaveLength(2);
    expect(dom.marker).toBeUndefined();
    expect(dom.imgWithHandler + dom.injectedImgs).toBe(0);
    expect(dom.text).not.toContain("onerror");
  });

  it("T15: tampered localStorage cannot inject markup, change the theme to garbage, or grant anything", async () => {
    const { page, port, entry, log } = await launch({
      init: () => {
        localStorage.setItem("zg-language", '<img src=x onerror="__w08=1">');
        localStorage.setItem("zg-theme", '"><svg onload=__w08=1>');
        localStorage.setItem("zg-score", "999999");
        localStorage.setItem("zg-role", "admin");
      },
    });
    const state = await page.evaluate(() => ({ lang: document.documentElement.lang, theme: document.documentElement.getAttribute("data-theme"), marker: (window as unknown as { __w08?: unknown }).__w08 }));
    expect(state.marker).toBeUndefined();
    expect(state.theme).toBeNull();
    // The app still works and the coach runs under the server's own policy.
    await playRound(page, port, entry, { country: "Srbija" }, {}, "Bot");
    await page.getByRole("button", { name: "Analyze my round" }).click();
    await page.getByText("The round review is complete.").waitFor({ timeout: 10_000 });
    expect(log.events()).toEqual([expect.objectContaining({ outcome: "allowed", providerAttempts: 2, executedToolCalls: 1 })]);
    expect((await domSafety(page)).marker).toBeUndefined();
  });

  it("T16 control (no headers): the same build WOULD run an inline script and a script from another local origin", async () => {
    const { page, headers } = await launch({ securityHeaders: false });
    expect(headers["content-security-policy"]).toBeUndefined();
    await injectScripts(page);
    const ran = await page.evaluate(() => ({ inline: (window as unknown as { __w08Inline?: boolean }).__w08Inline, external: (window as unknown as { __w08ExternalScript?: boolean }).__w08ExternalScript }));
    expect(ran).toEqual({ inline: true, external: true });
  });

  it("T16/I8: with the real headers the game and AI flow work with zero CSP violations, and the same scripts are blocked by script-src", async () => {
    const { page, port, entry, headers } = await launch();
    expect(headers["content-security-policy"]).toBe(CONTENT_SECURITY_POLICY);
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("no-referrer");

    // Smoke: lobby -> round -> results -> coach, under the policy.
    await playRound(page, port, entry, { country: "Srbija" }, {}, "Bot");
    await page.getByRole("button", { name: "Analyze my round" }).click();
    await page.getByText("The round review is complete.").waitFor({ timeout: 10_000 });
    const sheetsLoaded = await page.evaluate(() => document.styleSheets.length);
    expect(sheetsLoaded).toBeGreaterThan(0);
    expect(await page.evaluate(() => (window as unknown as { __cspViolations: unknown[] }).__cspViolations)).toEqual([]);

    await injectScripts(page);
    const ran = await page.evaluate(() => ({ inline: (window as unknown as { __w08Inline?: boolean }).__w08Inline, external: (window as unknown as { __w08ExternalScript?: boolean }).__w08ExternalScript }));
    expect(ran).toEqual({ inline: undefined, external: undefined });
    const violations = await page.evaluate(() => (window as unknown as { __cspViolations: Array<{ directive: string; blocked: string }> }).__cspViolations);
    expect(violations).toEqual(expect.arrayContaining([
      { directive: "script-src-elem", blocked: "inline" },
      { directive: "script-src-elem", blocked: `${evilOrigin}/evil.js` },
    ]));
  });
});

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
