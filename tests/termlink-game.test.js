"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { readSource, createContext, fakeDocument } = require("./harness");

/* A localStorage. Give the same one to two games for two tabs. */
function storage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    map,
  };
}

/*
 * The whole game -- engine.js and script.js, or the original's single
 * script.js -- on a fake page, with timers the test runs by hand. Booting
 * waits for the saved progress to load and the boot text to finish typing.
 */
async function game(rev, store = storage()) {
  const timers = [];
  const schedule = (fn, ms, repeat) => timers.push({ fn, repeat, live: true }) && timers.length;
  const clear = (id) => id && timers[id - 1] && (timers[id - 1].live = false);
  const document = fakeDocument();
  const ctx = createContext({
    document,
    window: "self",
    localStorage: store,
    setTimeout: (fn, ms) => schedule(fn, ms, false),
    setInterval: (fn, ms) => schedule(fn, ms, true),
    clearTimeout: clear,
    clearInterval: clear,
  });
  const html = readSource("termlink-trials/index.html", rev);
  for (const src of [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1])) {
    vm.runInContext(readSource(`termlink-trials/${src}`, rev), ctx, { filename: `${rev}:${src}` });
  }
  /* Run every timer until none is left: typing finishes, messages clear. */
  const settle = async () => {
    for (let guard = 0; guard < 100000; guard++) {
      await new Promise((r) => setImmediate(r));
      const t = timers.find((x) => x.live);
      if (!t) return;
      if (!t.repeat) t.live = false;
      t.fn();
    }
    throw new Error("timers never settled");
  };
  await settle();
  const el = (id) => document.getElementById(id);
  const g = {
    document,
    el,
    store,
    settle,
    /* Enter a callsign at the boot prompt. */
    async signIn(name) {
      el("callsignInput").value = name;
      document.dispatch("keydown", { key: "Enter" });
      await settle();
    },
    async continueGame() {
      el("continueBtn").onclick();
      await settle();
    },
    /* Type into the terminal and press EXECUTE. */
    async execute(input) {
      el("codeInput").value = input;
      el("executeBtn").click();
      await settle();
    },
    async next() {
      el("nextBtn").click();
      await settle();
    },
    objective: () => el("objectiveBox").textContent,
    saved: () => JSON.parse(store.getItem("termlink:progress")),
  };
  return g;
}

const ANSWERS = [
  "\\x1b[32mHELLO\\x1b[0m",
  "\\x1b[31mACCESS",
  "\\x1b[43mDANGER",
  "\\x1b[1;4mOVERRIDE",
  "\\x1b[36mCLASSIFIED\\x1b[0m SAFE",
  "\\x1b[5;20HK",
  "\\x1b[2J\\x1b[HWIPED",
  "\\x1b[38;5;208mORANGE",
  "\\x1b[38;2;127;90;240mGHOST",
];

/* Play missions 0..n-1, pressing NEXT after each. */
async function play(g, n) {
  for (let i = 0; i < n; i++) {
    await g.execute(ANSWERS[i]);
    assert.equal(g.el("feedback").className, "granted", `mission ${i}`);
    await g.next();
  }
}

test("a new operator starts at calibration and can play through to the certificate", async () => {
  const g = await game("working");
  await g.signIn("alice");
  assert.equal(g.el("hudCallsign").textContent, "ALICE");
  assert.match(g.objective(), /Type exactly: \\x1b\[32mHELLO/);
  await play(g, ANSWERS.length);
  assert.equal(g.el("certScreen").style.display, "block");
  assert.equal(g.el("certName").textContent, "ALICE");
  assert.equal(g.el("hudProgress").textContent, "8/8");
});

test("a wrong answer is denied, and the hint appears after the second", async () => {
  const g = await game("working");
  await g.signIn("bob");
  await g.next(); // calibration is already unlocked; NEXT is disabled, so this does nothing
  await g.execute("\\x1b[31mHELLO");
  assert.equal(g.el("feedback").className, "denied");
  assert.notEqual(g.el("hintText").style.display, "block");
  await g.execute("\\x1b[31mHELLO");
  assert.equal(g.el("hintText").style.display, "block");
});

test("regression: typed text in the breakdown is shown, not rendered", async () => {
  for (const rev of ["working", "original"]) {
    const g = await game(rev);
    await g.signIn("carol");
    await g.execute("\\x1b[32m<b>HELLO</b>");
    const html = g.el("breakdown").innerHTML;
    if (rev === "working") {
      assert.doesNotMatch(html, /<b>HELLO/);
      assert.match(html, /&lt;b&gt;HELLO&lt;\/b&gt;/);
    } else {
      assert.match(html, /"<b>HELLO<\/b>"/, "the original put the typed text into innerHTML");
    }
  }
});

test("regression: typed text in the colour-safe labels is shown, not rendered", async () => {
  for (const rev of ["working", "original"]) {
    const g = await game(rev);
    await g.signIn("dave");
    g.el("colorSafeToggle").checked = true;
    g.el("colorSafeToggle").dispatch("change", { target: g.el("colorSafeToggle") });
    g.el("codeInput").value = "\\x1b[31m<i>A</i>";
    g.el("codeInput").dispatch("input");
    const html = g.el("colorLegend").innerHTML;
    if (rev === "working") assert.match(html, /&lt;i&gt;A&lt;\/i&gt;/);
    else assert.match(html, /"<i>A<\/i>"/);
  }
});

test("regression: Continue picks up at the mission the player had reached", async () => {
  for (const rev of ["working", "original"]) {
    const store = storage();
    const first = await game(rev, store);
    await first.signIn("erin");
    await play(first, 4);
    assert.match(first.objective(), /CLASSIFIED/, "mission 04 is on screen");

    const again = await game(rev, store);
    assert.equal(again.el("continueRow").style.display, "flex");
    assert.equal(again.el("continueBtn").textContent, "CONTINUE AS ERIN");
    await again.continueGame();
    if (rev === "working") {
      assert.match(again.objective(), /CLASSIFIED/);
      assert.equal(again.saved().current, 4);
    } else {
      assert.match(again.objective(), /HELLO/, "the original went back to calibration");
      assert.equal(again.saved().current, 0, "and saved that over the player's place");
    }
    assert.equal(again.el("hudProgress").textContent, "3/8", "completed missions are kept either way");
  }
});

test("Continue after finishing every mission shows the certificate", async () => {
  const store = storage();
  const first = await game("working", store);
  await first.signIn("frank");
  await play(first, ANSWERS.length);
  const again = await game("working", store);
  await again.continueGame();
  assert.equal(again.el("certScreen").style.display, "block");
});

test("a new operator on a saved game starts from scratch", async () => {
  const store = storage();
  const first = await game("working", store);
  await first.signIn("gina");
  await play(first, 3);
  const again = await game("working", store);
  again.el("newOpBtn").onclick();
  await again.signIn("hal");
  assert.match(again.objective(), /HELLO/);
  assert.equal(again.el("hudProgress").textContent, "0/8");
  assert.equal(again.saved().callsign, "hal");
});

const gradedDone = (saved) => saved.completed.slice(1).filter(Boolean).length;

test("regression: a second tab saving does not undo the first tab's progress", async () => {
  for (const rev of ["working", "original"]) {
    // Tab A has been open all along; tab B is opened on the same save. (B goes
    // through CONTINUE, which in the original lands on calibration -- a bug
    // of its own, fixed separately -- so A is the tab that plays on.)
    const store = storage();
    const a = await game(rev, store);
    await a.signIn("ivy");
    await play(a, 2); // calibration and mission 01 done, on mission 02

    const b = await game(rev, store);
    await b.continueGame();

    await a.execute(ANSWERS[2]);
    await a.next();
    await a.execute(ANSWERS[3]); // tab A has now done 01, 02 and 03
    assert.equal(gradedDone(a.saved()), 3);

    // Tab B, still holding the progress it loaded, changes a setting.
    b.el("reducedMotionToggle").checked = true;
    b.el("reducedMotionToggle").dispatch("change", { target: b.el("reducedMotionToggle") });

    if (rev === "working") {
      assert.equal(gradedDone(b.saved()), 3, "A's missions survive B's save");
      assert.equal(b.saved().settings.reducedMotion, true, "and B's setting is saved");
    } else {
      assert.equal(gradedDone(b.saved()), 1, "the original let B's stale copy win");
    }
  }
});

test("a restart in one tab is not merged back into the old run", async () => {
  const store = storage();
  const g = await game("working", store);
  await g.signIn("jo");
  await play(g, 3);
  // Finish, then restart from the certificate screen.
  for (let i = 3; i < ANSWERS.length; i++) {
    await g.execute(ANSWERS[i]);
    await g.next();
  }
  g.el("restartBtn").click();
  await g.settle();
  assert.equal(gradedDone(g.saved()), 0);
  assert.match(g.objective(), /HELLO/);
});
