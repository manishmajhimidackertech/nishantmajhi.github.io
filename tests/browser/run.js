#!/usr/bin/env node
/*
 * The sub-sites, in a real Chrome.
 *
 * The node suite tests each page's script on a fake page. This opens the real
 * pages, served over loopback, in headless Chrome, and works them through the
 * DevTools protocol the way a person would -- typing, clicking, reloading --
 * to check that what the node suite proves of the scripts is what the page
 * actually shows.
 *
 *   node tests/browser/run.js              the working copy
 *   node tests/browser/run.js --original    the code this pass started from
 *
 * In --original mode every check named "regression:" must fail and every
 * other check must pass. A regression check that passes against the original
 * is not testing the defect it names.
 *
 * Nothing leaves the machine. Every request that is not to the local server
 * is intercepted: Taboo's Chart.js from cdnjs is answered with the identical
 * 4.4.1 build SimLoan vendors, the GitHub API with whatever the check says,
 * and everything else -- web fonts, search engines -- is refused, and
 * recorded so a check can assert on it.
 *
 * The project index (index.html) is a Jekyll template. It is checked on a
 * stand-in page with the same elements, carrying index.html's own script with
 * its Liquid filled in from _config.yml (tests/site.js).
 *
 * No dependency: the server is Node's http module, and Chrome is driven with
 * Node's own WebSocket and fetch. It prints SKIP and exits 0 if no Chrome is
 * found, which is why it is not part of `npm test` -- a skip there would read
 * as a pass.
 */

"use strict";

const { spawn, execFileSync } = require("node:child_process");
const { createServer } = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { renderedInlineScript } = require("../site");

const ROOT = path.resolve(__dirname, "..", "..");
const ORIGINAL = process.argv.includes("--original");
const REV = ORIGINAL ? "original" : "working";
const BASELINE_SUBJECT = "used flex instead of grid";

const CHROME_CANDIDATES = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------- the source --- */

/* The site's files at the baseline commit, written to a temporary directory. */
function extractOriginal() {
  const sha = execFileSync("git", ["log", "--all", "--format=%H", `--grep=^${BASELINE_SUBJECT}$`, "--max-count=1"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  if (!sha) throw new Error(`no commit with the subject "${BASELINE_SUBJECT}"`);
  const files = execFileSync("git", ["ls-tree", "-r", "--name-only", sha], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nishantmajhi-original-"));
  for (const file of files) {
    const bytes = execFileSync("git", ["show", `${sha}:${file}`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), bytes);
  }
  return { sha, dir };
}

/* A stand-in for the rendered project index: its elements and its script. */
function indexStandIn(dir) {
  const external = fs.existsSync(path.join(dir, "assets/js/repo-index.js"))
    ? '<script src="/assets/js/repo-index.js"></script>'
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>index stand-in</title></head>
<body>
<div class="stats">
  <div class="stat"><div class="val" id="repo-count">−</div><div class="lbl">Repos</div></div>
  <div class="stat"><div class="val" id="lang-count">−</div><div class="lbl">Languages</div></div>
</div>
<nav id="repo-nav">
  <div id="repo-list">
    <div id="loading-msg">Loading GitHub repos…</div>
  </div>
</nav>
<script>${renderedInlineScript(REV)}</script>
${external}
</body></html>`;
}

/* --------------------------------------------------------------- serving --- */

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

class SiteServer {
  constructor(dir) {
    this.dir = dir;
    this.port = 0;
  }

  handle(req, res) {
    const url = new URL(req.url, "http://localhost");
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (rel === "__index.html") {
      res.writeHead(200, { "content-type": TYPES[".html"], "cache-control": "no-store" }).end(indexStandIn(this.dir));
      return;
    }
    if (rel === "" || rel.endsWith("/")) rel += "index.html";
    const file = path.resolve(this.dir, rel);
    if (!file.startsWith(path.resolve(this.dir) + path.sep)) {
      res.writeHead(403).end("no");
      return;
    }
    try {
      const body = fs.readFileSync(file);
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" }).end(body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    }
  }

  start() {
    this.server = createServer((req, res) => this.handle(req, res));
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", () => {
        this.port = this.server.address().port;
        resolve();
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
      this.server.closeAllConnections();
    });
  }

  url(p = "") {
    return `http://127.0.0.1:${this.port}/${p}`;
  }
}

/* ---------------------------------------------------------------- chrome --- */

function findChrome() {
  return CHROME_CANDIDATES.find((c) => {
    try {
      return fs.existsSync(c);
    } catch {
      return false;
    }
  });
}

async function launchChrome(chrome) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "nishantmajhi-chrome-"));
  const child = spawn(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-component-update",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  child.stderr.resume();

  const portFile = path.join(profile, "DevToolsActivePort");
  let port = 0;
  for (const deadline = Date.now() + 30000; Date.now() < deadline && !port; await sleep(50)) {
    if (child.exitCode !== null) throw new Error(`Chrome exited with ${child.exitCode} before listening`);
    try {
      port = Number(fs.readFileSync(portFile, "utf8").split("\n")[0]) || 0;
    } catch {
      /* not written yet */
    }
  }
  if (!port) throw new Error("Chrome never wrote DevToolsActivePort");

  let wsUrl = null;
  for (const deadline = Date.now() + 30000; Date.now() < deadline && !wsUrl; await sleep(50)) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
  }
  if (!wsUrl) throw new Error("no debuggable page target appeared");

  const page = new Page(wsUrl);
  await page.open();
  return {
    page,
    close() {
      page.close();
      child.kill();
      for (let i = 0; i < 20; i++) {
        try {
          fs.rmSync(profile, { recursive: true, force: true });
          return;
        } catch {
          /* Chrome still holds the profile for a moment after exit */
        }
        const until = Date.now() + 100;
        while (Date.now() < until) {
          /* synchronous back-off; close() is called from a finally */
        }
      }
    },
  };
}

/*
 * A page target driven over the DevTools protocol, with every request routed
 * through `route`: the local server's are let through, the rest answered or
 * refused (see the top of this file).
 */
class Page {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.exceptions = [];
    this.refused = [];
    this.github = () => ({ status: 403, body: { message: "API rate limit exceeded" } });
  }

  open() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.addEventListener("open", async () => {
        try {
          await this.send("Runtime.enable");
          await this.send("Page.enable");
          await this.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      this.ws.addEventListener("error", () => reject(new Error("the DevTools websocket errored")));
      this.ws.addEventListener("message", (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { res, rej } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) rej(new Error(msg.error.message));
          else res(msg.result);
        } else if (msg.method === "Runtime.exceptionThrown") {
          const d = msg.params.exceptionDetails;
          this.exceptions.push(`${d.text} ${(d.exception && d.exception.description) || ""}`.trim());
        } else if (msg.method === "Fetch.requestPaused") {
          this.route(msg.params).catch(() => {
            /* the page navigated away mid-request */
          });
        }
      });
    });
  }

  async route({ requestId, request }) {
    const url = new URL(request.url);
    if (url.hostname === "127.0.0.1") return this.send("Fetch.continueRequest", { requestId });
    if (url.hostname === "cdnjs.cloudflare.com" && url.pathname.endsWith("/Chart.js/4.4.1/chart.umd.js")) {
      const body = fs.readFileSync(path.join(ROOT, "SimLoan/chart.umd.min.js")).toString("base64");
      return this.send("Fetch.fulfillRequest", {
        requestId,
        responseCode: 200,
        responseHeaders: [{ name: "Content-Type", value: "text/javascript" }],
        body,
      });
    }
    if (url.hostname === "api.github.com") {
      const { status, body } = this.github(url);
      return this.send("Fetch.fulfillRequest", {
        requestId,
        responseCode: status,
        responseHeaders: [
          { name: "Content-Type", value: "application/json" },
          { name: "Access-Control-Allow-Origin", value: "*" },
        ],
        body: Buffer.from(JSON.stringify(body)).toString("base64"),
      });
    }
    this.refused.push(request.url);
    return this.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
  }

  send(method, params = {}) {
    return new Promise((res, rej) => {
      const id = this.nextId++;
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /* Evaluate an expression in the page and return its value (awaiting a promise). */
  async eval(expression) {
    const out = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (out.exceptionDetails) {
      const d = out.exceptionDetails;
      throw new Error(`in page: ${(d.exception && d.exception.description) || d.text}`);
    }
    return out.result.value;
  }

  /* Navigate, and wait until the document has finished loading. */
  async goto(url) {
    await this.send("Page.navigate", { url });
    await this.waitFor(`document.readyState === 'complete' && location.href === ${JSON.stringify(url)}`);
  }

  async reload() {
    const before = await this.eval("performance.timeOrigin");
    await this.send("Page.reload", { ignoreCache: true });
    await this.waitFor(`performance.timeOrigin !== ${before} && document.readyState === 'complete'`);
  }

  async waitFor(expression, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    let last = null;
    while (Date.now() < deadline) {
      try {
        if (await this.eval(expression)) return;
      } catch (e) {
        last = e; // mid-navigation, the context can vanish under an evaluate
      }
      await sleep(50);
    }
    throw new Error(`timed out waiting for: ${expression}${last ? ` (last error: ${last.message})` : ""}`);
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* already closed */
    }
  }
}

/* --------------------------------------------------------- page helpers --- */

const js = JSON.stringify;
const $ = (sel) => `document.querySelector(${js(sel)})`;
/* Set a field's value and fire the event the page listens for. */
const setValue = (sel, value, event = "input") =>
  `(() => { const el = ${$(sel)}; if (!el) throw new Error("no " + ${js(sel)});
     el.value = ${js(value)}; el.dispatchEvent(new Event(${js(event)}, { bubbles: true })); return true; })()`;
const click = (sel) =>
  `(() => { const el = ${$(sel)}; if (!el) throw new Error("no " + ${js(sel)}); el.click(); return true; })()`;
const textOf = (sel) => `(() => { const el = ${$(sel)}; return el ? el.textContent.trim() : null; })()`;
const key = (sel, k, type = "keydown") =>
  `(() => { ${$(sel)}.dispatchEvent(new KeyboardEvent(${js(type)}, { key: ${js(k)}, bubbles: true })); return true; })()`;

function expectEqual(actual, expected, what) {
  if (actual !== expected) throw new Error(`${what}: expected ${js(expected)}, got ${js(actual)}`);
}

/* Open a page fresh: no saved state, no exceptions carried over. */
async function open(page, server, p) {
  await page.goto(server.url("__blank"));
  await page.eval("localStorage.clear(), true");
  page.exceptions.length = 0;
  page.refused.length = 0;
  await page.goto(server.url(p));
}

/* ----------------------------------------------------------------- checks --- */

const checks = [];
const check = (name, fn) => checks.push({ name, fn });

const PAGES = [
  "__index.html",
  "Anticipator/",
  "BankVsRelative/",
  "BetterHome/",
  "ConicSections/",
  "NameCodes/",
  "nBase/",
  "recursion-in-multiplication/",
  "SimLoan/",
  "Taboo/",
  "termlink-trials/",
  "TimePass/",
  "TrigEqK/",
];

for (const p of PAGES) {
  check(`${p} loads with no uncaught exception`, async ({ page, server }) => {
    await open(page, server, p);
    await sleep(400);
    if (page.exceptions.length) throw new Error(page.exceptions.join("\n"));
  });
}

check("nothing a page asks for from another site gets through, apart from what is answered", async ({ page, server }) => {
  await open(page, server, "Taboo/");
  await page.waitFor("typeof Chart === 'function'");
  const refused = page.refused.filter((u) => !/fonts\.(googleapis|gstatic)\.com/.test(u));
  if (refused.length) throw new Error(`unexpected requests: ${refused.join(", ")}`);
});

/* -- Anticipator ------------------------------------------------------------ */

async function gradeSheet(page, server, theory, practical) {
  await open(page, server, "Anticipator/");
  await page.eval(`(() => {
    for (const row of document.querySelectorAll("tbody tr")) {
      for (const [sel, v] of [[".theory > input", ${js(String(theory))}], [".practical > input", ${js(String(practical))}]]) {
        const input = row.querySelector(sel);
        input.value = v;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    return true;
  })()`);
}

check("regression: Anticipator: straight 4.0s give a GPA of 4.00", async ({ page, server }) => {
  await gradeSheet(page, server, 4, 4);
  expectEqual(await page.eval(textOf("#final_gpa")), "4.00", "GPA");
  expectEqual(await page.eval(textOf("#final_grade")), "A+", "grade");
});

check("Anticipator: Random fills every subject and shows a GPA", async ({ page, server }) => {
  await open(page, server, "Anticipator/");
  await page.eval(click("#randomButton"));
  const empty = await page.eval("[...document.querySelectorAll('.grade-point')].filter((c) => !c.textContent).length");
  expectEqual(empty, 0, "subjects without a grade point");
  if (!(Number(await page.eval(textOf("#final_gpa"))) > 0)) throw new Error("no GPA shown");
});

check("regression: Anticipator: Random never shows a GPA above 4", async ({ page, server }) => {
  await open(page, server, "Anticipator/");
  for (let i = 0; i < 20; i++) {
    await page.eval(click("#randomButton"));
    const gpa = Number(await page.eval(textOf("#final_gpa")));
    if (gpa > 4) throw new Error(`GPA ${gpa}`);
  }
});

/* -- SimLoan --------------------------------------------------------------- */

check("regression: SimLoan: the default loan costs 6.50 lakh, not 6.60", async ({ page, server }) => {
  await open(page, server, "SimLoan/");
  await page.waitFor(`${$("#mTotal")}.textContent !== ""`);
  expectEqual(await page.eval(textOf("#mTenure")), "4 yrs 7 mo", "tenure");
  expectEqual(await page.eval(textOf("#mTotal")), "रू 6.50 L", "total payable");
  expectEqual(await page.eval(textOf("#mInt")), "रू 1.50 L", "total interest");
});

check("regression: SimLoan: switching theme keeps the chart of the loan on screen", async ({ page, server }) => {
  await open(page, server, "SimLoan/");
  await page.waitFor("typeof chartInstance !== 'undefined' && chartInstance !== null");
  const before = await page.eval("JSON.stringify(chartInstance.data.datasets.map((d) => d.data))");
  await page.eval(click(".fab-theme"));
  const after = await page.eval("JSON.stringify(chartInstance.data.datasets.map((d) => d.data))");
  if (after !== before) throw new Error("the theme button redrew a different loan");
});

check("SimLoan: Find EMI gives the textbook EMI for 60 months", async ({ page, server }) => {
  await open(page, server, "SimLoan/");
  await page.eval(click("#modeEMI"));
  expectEqual(await page.eval(textOf("#mEMI")), "रू 11,122/mo", "EMI");
  expectEqual(await page.eval(textOf("#rowCount")), "60 payments", "rows");
});

/* -- nBase ------------------------------------------------------------------ */

async function nbase(page, server, a, baseA, b, baseB, op, resultBase = 10) {
  await open(page, server, "nBase/");
  await page.eval(setValue("#first_num select", String(baseA), "change"));
  await page.eval(setValue("#second_num select", String(baseB), "change"));
  await page.eval(setValue("#operations select", String(resultBase), "change"));
  await page.eval(setValue("#first_num input", a));
  await page.eval(setValue("#second_num input", b));
  await page.eval(click(`button[data-operator="${op}"]`));
  return page.eval("document.querySelector('output').textContent.replace(/\\s+/g, ' ').trim()");
}

check("nBase: ff in hex plus 1 is 100000000 in binary", async ({ page, server }) => {
  expectEqual(await nbase(page, server, "ff", 16, "1", 10, "+", 2), "(ff)16 + (1)10 = (100000000)2", "result");
});

check("regression: nBase: a 9 in a binary number is invalid", async ({ page, server }) => {
  expectEqual(await nbase(page, server, "19", 2, "1", 10, "+"), "Invalid input!", "result");
});

check("regression: nBase: 2^53 + 1 comes out exact", async ({ page, server }) => {
  expectEqual(
    await nbase(page, server, "9007199254740993", 10, "0", 10, "+"),
    "(9007199254740993)10 + (0)10 = (9007199254740993)10",
    "result",
  );
});

/* -- TimePass --------------------------------------------------------------- */

check("regression: TimePass: Enter twice on a right answer scores once", async ({ page, server }) => {
  await open(page, server, "TimePass/");
  await page.waitFor("typeof integerAnswer === 'number'");
  await page.eval(setValue("#userAnswer", String(await page.eval("integerAnswer"))));
  await page.eval(key("#userAnswer", "Enter", "keypress"));
  await page.eval(key("#userAnswer", "Enter", "keypress"));
  await sleep(1300);
  expectEqual(await page.eval(textOf("#score")), "Score: 1", "score");
});

check("regression: TimePass: every question's answer is exact", async ({ page, server }) => {
  await open(page, server, "TimePass/");
  const wrong = await page.eval(`(() => {
    for (let i = 0; i < 3000; i++) {
      const p = randomProblem();
      if (Function("return " + p.question)() !== p.answer) return p.question + " = " + p.answer;
    }
    return null;
  })()`);
  if (wrong) throw new Error(`asked ${wrong}`);
});

/* -- TrigEqK ---------------------------------------------------------------- */

async function trig(page, server, equation) {
  await open(page, server, "TrigEqK/");
  await page.eval(setValue("#equation", equation));
  await page.eval(click("#check-btn"));
  return page.eval(textOf("#summary-text"));
}

check("TrigEqK: sin²x + cos²x = 1 passes at every angle", async ({ page, server }) => {
  const summary = await trig(page, server, "sin(x)^2 + cos(x)^2 = 1");
  if (!summary.startsWith("34 / 34")) throw new Error(summary);
});

check("TrigEqK: sin x = cos x fails where it is false", async ({ page, server }) => {
  const summary = await trig(page, server, "sin(x) = cos(x)");
  if (summary.startsWith("34 / 34")) throw new Error(summary);
});

check("regression: TrigEqK: tan 2x = 2tan x / (1 - tan²x) is verified", async ({ page, server }) => {
  const summary = await trig(page, server, "tan(2x) = 2 tan(x)/(1 - tan(x)^2)");
  if (!summary.startsWith("34 / 34")) throw new Error(summary);
});

check("regression: TrigEqK: asec is not mangled into an error", async ({ page, server }) => {
  const summary = await trig(page, server, "asec(2) = acos(1/2)");
  if (!summary.startsWith("34 / 34")) throw new Error(summary);
});

/* -- BankVsRelative --------------------------------------------------------- */

check("BankVsRelative: the defaults show lending ahead", async ({ page, server }) => {
  await open(page, server, "BankVsRelative/");
  const verdict = await page.eval(textOf("#verdictBig"));
  if (!verdict.startsWith("Lending wins by")) throw new Error(verdict);
});

check("regression: BankVsRelative: the solve button finds the break-even rate", async ({ page, server }) => {
  await open(page, server, "BankVsRelative/");
  await page.eval(click("#solveBtn"));
  expectEqual(await page.eval(textOf("#verdictBig")), "Break-even relative rate: 7.61%", "verdict");
  expectEqual(await page.eval("document.getElementById('rrel').value"), "7.5", "slider, at its nearest step");
  expectEqual(await page.eval("document.getElementById('linkToggle').getAttribute('aria-checked')"), "false", "link");
});

/* -- NameCodes -------------------------------------------------------------- */

check("NameCodes: Govinda becomes GVND", async ({ page, server }) => {
  await open(page, server, "NameCodes/");
  await page.eval(setValue("#firstName", "Govinda"));
  expectEqual(await page.eval(textOf(".code-card.is-primary .code")), "GVND", "code");
});

check("regression: NameCodes: a registered code is shown as typed", async ({ page, server }) => {
  await open(page, server, "NameCodes/");
  await page.eval(setValue("#dirInput", "<b>x</b>"));
  await page.eval(click("#dirAdd"));
  expectEqual(await page.eval("document.querySelector('#chips .chip span').textContent"), "<B>X</B>", "chip");
});

/* -- recursion-in-multiplication -------------------------------------------- */

async function multiply(page, server, a, b) {
  await open(page, server, "recursion-in-multiplication/");
  await page.eval(setValue("#inA", String(a), "change"));
  await page.eval(setValue("#inB", String(b), "change"));
  await page.eval(click("#bRun"));
  return page.eval(textOf("#mProd"));
}

check("recursion: 726 x 25 is 18150", async ({ page, server }) => {
  expectEqual(await multiply(page, server, 726, 25), "18150", "product");
});

check("regression: recursion: Run finishes with a zero multiplier", async ({ page, server }) => {
  expectEqual(await multiply(page, server, 8, 0), "0", "product");
});

/* -- TERMLINK --------------------------------------------------------------- */

async function termlink(page, server) {
  await open(page, server, "termlink-trials/");
  await page.waitFor(`${$("#callsignRow")}.style.display === "flex"`);
  await page.eval(setValue("#callsignInput", "tester"));
  await page.eval(key("body", "Enter"));
  await page.waitFor(`${$("#gameScreen")}.style.display === "block"`);
  await page.eval(click("#onboardDismiss"));
}

async function execute(page, input) {
  await page.eval(setValue("#codeInput", input));
  await page.eval(click("#executeBtn"));
}

check("TERMLINK: calibration passes with the answer it gives", async ({ page, server }) => {
  await termlink(page, server);
  await execute(page, "\\x1b[32mHELLO\\x1b[0m");
  expectEqual(await page.eval("document.getElementById('feedback').className"), "granted", "feedback");
});

check("regression: TERMLINK: \\x1b[;20H goes to row 1, column 20", async ({ page, server }) => {
  await termlink(page, server);
  await page.eval(setValue("#codeInput", "\\x1b[;20HX"));
  const rows = await page.eval("[...document.querySelectorAll('#termGrid .term-row')].map((r) => r.textContent)");
  expectEqual(rows[0].indexOf("X"), 19, "column of X on row 1");
});

check("regression: TERMLINK: the breakdown shows typed markup as text", async ({ page, server }) => {
  await termlink(page, server);
  await execute(page, "\\x1b[32m<b>HELLO</b>");
  const text = await page.eval(textOf("#breakdown"));
  if (!text.includes('"<b>HELLO</b>"')) throw new Error(text);
});

check("regression: TERMLINK: CONTINUE resumes at the saved mission", async ({ page, server }) => {
  await open(page, server, "termlink-trials/");
  await page.eval(`localStorage.setItem("termlink:progress", JSON.stringify({
    callsign: "tester", current: 4, highestReached: 4, startTime: Date.now(),
    completed: [true, true, true, true, false, false, false, false, false],
    attempts: [1, 1, 1, 1, 0, 0, 0, 0, 0],
    settings: { reducedMotion: false, colorSafe: false, fontScale: 1 }, onboarded: true,
  })), true`);
  await page.reload();
  await page.waitFor(`${$("#continueRow")}.style.display === "flex"`);
  await page.eval(click("#continueBtn"));
  const objective = await page.eval(textOf("#objectiveBox"));
  if (!objective.includes("CLASSIFIED")) throw new Error(objective);
});

/* -- BetterHome ------------------------------------------------------------- */

check("BetterHome: a query goes to the engine picked", async ({ page, server }) => {
  await open(page, server, "BetterHome/");
  await page.eval(click('input[value="duckduckgo"]'));
  await page.eval(setValue("#query_string", "nepal"));
  await page.eval(click("#search-button"));
  await sleep(300);
  if (!page.refused.some((u) => u.startsWith("https://duckduckgo.com/?q=nepal"))) {
    throw new Error(`no search request: ${page.refused.join(", ")}`);
  }
});

check("regression: BetterHome: a query of spaces goes nowhere", async ({ page, server }) => {
  await open(page, server, "BetterHome/");
  await page.eval(setValue("#query_string", "   "));
  await page.eval(click("#search-button"));
  await sleep(300);
  const searched = page.refused.filter((u) => /brave|duckduckgo|mojeek/.test(u));
  if (searched.length) throw new Error(`searched for spaces: ${searched.join(", ")}`);
});

/* -- the project index ------------------------------------------------------ */

const REPOS = [
  { name: "Kiln", description: "Office files from code", language: "JavaScript", fork: false, html_url: "https://github.com/x/Kiln" },
  { name: "Lipi", description: null, language: "Java", fork: false, html_url: "https://github.com/x/Lipi" },
  { name: "nishantmajhi.github.io", description: null, language: "HTML", fork: false, html_url: "https://github.com/x/site" },
];

const groups = "[...document.querySelectorAll('#repo-list .lang-group h4')].map((h) => h.textContent)";

check("index: the GitHub list is grouped by language", async ({ page, server }) => {
  page.github = () => ({ status: 200, body: REPOS });
  try {
    await open(page, server, "__index.html");
    await page.waitFor(`!document.getElementById("loading-msg")`);
    expectEqual(js(await page.eval(groups)), js(["JavaScript / HTML / CSS", "Java"]), "groups");
    expectEqual(await page.eval(textOf("#repo-count")), "2", "repo count");
  } finally {
    page.github = () => ({ status: 403, body: {} });
  }
});

check("index: refused with nothing remembered, it says so", async ({ page, server }) => {
  await open(page, server, "__index.html");
  await page.waitFor(`${$("#loading-msg")}.textContent.startsWith("Could not")`);
});

check("regression: index: refused after a visit that loaded, it shows that list", async ({ page, server }) => {
  page.github = () => ({ status: 200, body: REPOS });
  try {
    await open(page, server, "__index.html");
    await page.waitFor(`!document.getElementById("loading-msg")`);
  } finally {
    page.github = () => ({ status: 403, body: {} });
  }
  await page.reload();
  await sleep(500);
  expectEqual(js(await page.eval(groups)), js(["JavaScript / HTML / CSS", "Java"]), "groups");
});

/* ------------------------------------------------------------------- main --- */

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    console.log("SKIP: no Chrome or Edge found. Set CHROME=<path to chrome.exe> to run these checks.");
    return 0;
  }

  let original = null;
  let source = ROOT;
  if (ORIGINAL) {
    original = extractOriginal();
    source = original.dir;
    console.log(`Against ${original.sha.slice(0, 7)} ("${BASELINE_SUBJECT}")`);
  }

  const server = new SiteServer(source);
  await server.start();
  const browser = await launchChrome(chrome);
  const results = [];
  try {
    for (const { name, fn } of checks) {
      try {
        await fn({ page: browser.page, server });
        results.push({ name, ok: true });
      } catch (e) {
        results.push({ name, ok: false, detail: e.message });
      }
    }
  } finally {
    browser.close();
    await server.stop();
    if (original) fs.rmSync(original.dir, { recursive: true, force: true });
  }

  for (const r of results) {
    console.log(`${r.ok ? "ok  " : "FAIL"}  ${r.name}${r.ok ? "" : `\n        ${r.detail}`}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed, ${results.length} checks`);

  if (!ORIGINAL) return failed.length === 0 ? 0 : 1;

  const wrong = results.filter((r) => r.name.startsWith("regression:") === r.ok);
  if (wrong.length) {
    console.error("\nAgainst the original, every regression check must fail and every other check must pass. These did not:");
    for (const r of wrong) console.error(`  - ${r.ok ? "passed" : "failed"}: ${r.name}`);
    return 1;
  }
  console.log(`\nAgainst the original: all ${results.filter((r) => r.name.startsWith("regression:")).length} regression checks fail, as they should.`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err.stack || String(err));
    process.exit(1);
  },
);
