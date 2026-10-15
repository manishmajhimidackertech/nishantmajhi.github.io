"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { load, readSource, createContext } = require("./harness");

/* engine.js, as the page loads it. */
function engine() {
  return load("termlink-trials/engine.js");
}

/*
 * The same engine as it was before this pass: a stretch of the original
 * script.js, which kept it private inside one IIFE. The stretch runs from the
 * emulator's first declaration to the game state; the renderer and codex in
 * between are defined but never called.
 */
function originalEngine() {
  const src = readSource("termlink-trials/script.js", "original");
  const from = src.indexOf("  const ROWS = 9,");
  const to = src.indexOf("  /* =====================================================================\n     STATE");
  assert.ok(from > 0 && to > from, "the original's engine section is where it was");
  const ctx = createContext();
  vm.runInContext(src.slice(from, to), ctx);
  return ctx;
}

/* What the grid shows, as text plus each cell's style, compactly. */
function screen(ctx, seed, input) {
  return ctx.$run(`JSON.stringify(runVT(${JSON.stringify(seed)}, ${JSON.stringify(input)}))`);
}

/* Each mission's input as the hint describes it, and a near miss. */
const ANSWERS = [
  ["\\x1b[32mHELLO\\x1b[0m", "\\x1b[31mHELLO"],
  ["\\x1b[31mACCESS", "\\x1b[32mACCESS"],
  ["\\x1b[43mDANGER", "\\x1b[33mDANGER"],
  ["\\x1b[1;4mOVERRIDE", "\\x1b[1mOVERRIDE"],
  ["\\x1b[36mCLASSIFIED\\x1b[0m SAFE", "\\x1b[36mCLASSIFIED SAFE"],
  ["\\x1b[5;20HK", "\\x1b[20;5HK"],
  ["\\x1b[2J\\x1b[HWIPED", "WIPED"],
  ["\\x1b[38;5;208mORANGE", "\\x1b[38;5;21mORANGE"],
  ["\\x1b[38;2;127;90;240mGHOST", "\\x1b[38;2;127;90;241mGHOST"],
];

/* Inputs whose rendering the extraction must not change. */
const CORPUS = [
  "",
  "plain text",
  "\\x1b[31mred\\x1b[0m normal",
  "\\033[1;4;33mbold underline yellow",
  "\\u001b[7mreverse\\x1b[27m back",
  "^[[92mbright green^[[0m",
  "\\x1b[3;5Hplaced\\x1b[1Aup\\x1b[2Bdown\\x1b[4Cright\\x1b[3Dleft",
  "line one\\nline two\\rCR\\ttab",
  "\\x1b[2Jcleared",
  "abc\\x1b[1Jdef",
  "abcdef\\x1b[3D\\x1b[Kgh",
  "\\x1b[38;5;196mindexed\\x1b[48;5;21mbg\\x1b[39;49mreset",
  "\\x1b[38;2;10;20;30mtrue\\x1b[48;2;200;100;50mtruebg",
  "\\x1b[100;97mbright bg",
  "x".repeat(500),
  "\\n".repeat(20) + "scrolled",
  ...ANSWERS.flat(),
];

test("the page loads engine.js before script.js", () => {
  const html = readSource("termlink-trials/index.html");
  const engineAt = html.indexOf('<script src="engine.js"></script>');
  assert.ok(engineAt > 0 && engineAt < html.indexOf('<script src="script.js"></script>'));
});

test("the emulator renders the corpus exactly as the original did", () => {
  const now = engine();
  const then = originalEngine();
  const seed = [{ row: 0, col: 0, text: "LOG7734::BREACH_DETECTED_UNIT-9" }];
  for (const input of CORPUS) {
    for (const s of [null, seed]) assert.equal(screen(now, s, input), screen(then, s, input), JSON.stringify(input));
    const explain = (ctx) => ctx.$run(`JSON.stringify(explainInput(${JSON.stringify(input)}))`);
    assert.equal(explain(now), explain(then), JSON.stringify(input));
  }
});

test("the missions are the original's missions", () => {
  const now = engine();
  const then = originalEngine();
  const fields = "MISSIONS.map((m) => [m.title, m.objective, m.hint, !!m.calibration, JSON.stringify(m.seed)])";
  assert.equal(JSON.stringify(now.$run(fields)), JSON.stringify(then.$run(fields)));
  assert.equal(now.$run("GRADED_COUNT"), 8);
});

/* Grade `input` against mission `i` as EXECUTE does. */
function grade(ctx, i, input) {
  return ctx.$run(`MISSIONS[${i}].check(runVT(MISSIONS[${i}].seed, ${JSON.stringify(input)}).grid).pass`);
}

test("every mission passes with the answer its hint describes, and fails a near miss", () => {
  const ctx = engine();
  ANSWERS.forEach(([right, wrong], i) => {
    assert.equal(grade(ctx, i, right), true, `mission ${i} with ${right}`);
    assert.equal(grade(ctx, i, wrong), false, `mission ${i} with ${wrong}`);
  });
});

test("the bright variants of a colour count as that colour", () => {
  const ctx = engine();
  assert.equal(grade(ctx, 1, "\\x1b[91mACCESS"), true);
  assert.equal(grade(ctx, 2, "\\x1b[103mDANGER"), true);
  assert.equal(grade(ctx, 4, "\\x1b[96mCLASSIFIED\\x1b[0mSAFE"), true);
});

test("the escape can be typed in any of the spellings the codex teaches", () => {
  const ctx = engine();
  for (const esc of ["\\x1b", "\\x1B", "\\033", "\\u001b", "^["]) {
    assert.equal(grade(ctx, 1, `${esc}[31mACCESS`), true, esc);
  }
});

test("purging the logs needs the erase to come before the text", () => {
  const ctx = engine();
  assert.equal(grade(ctx, 6, "WIPED\\x1b[2J"), false);
  assert.equal(grade(ctx, 6, "\\x1b[HWIPED"), false, "overwriting is not clearing");
});

test("256-colour indices map onto the xterm palette", () => {
  const ctx = engine();
  assert.equal(ctx.idx256(16), "#000000");
  assert.equal(ctx.idx256(208), "#ff8700");
  assert.equal(ctx.idx256(231), "#ffffff");
  assert.equal(ctx.idx256(232), "#080808");
  assert.equal(ctx.idx256(255), "#eeeeee");
  assert.equal(ctx.classify(ctx.idx256(208)), "orange");
});

test("the breakdown names each sequence it sees", () => {
  const ctx = engine();
  const parts = JSON.parse(ctx.$run(`JSON.stringify(explainInput("\\\\x1b[1;31mHI\\\\x1b[5;20H\\\\x1b[2J"))`));
  assert.deepEqual(
    parts.map((p) => p.desc || p.value),
    ["bold on, foreground → red", "HI", "move cursor → row 5, column 20", "erase entire screen"],
  );
});

/* Where `ch` landed, 1-based, and the style of that cell. */
function find(ctx, input, ch) {
  return JSON.parse(
    ctx.$run(`(() => {
      const { grid } = runVT(null, ${JSON.stringify(input)});
      for (let r = 0; r < grid.length; r++)
        for (let c = 0; c < grid[r].length; c++)
          if (grid[r][c].ch === ${JSON.stringify(ch)}) return JSON.stringify({ row: r + 1, col: c + 1, ...grid[r][c] });
      return "null";
    })()`),
  );
}

test("regression: an empty first parameter takes its default instead of shifting the rest", () => {
  // \x1b[;20H is row 1 (the default), column 20 -- not row 20 clamped to 9.
  assert.deepEqual(
    (({ row, col }) => ({ row, col }))(find(engine(), "\x1b[;20HX", "X")),
    { row: 1, col: 20 },
  );
  assert.deepEqual(
    (({ row, col }) => ({ row, col }))(find(originalEngine(), "\x1b[;20HX", "X")),
    { row: 9, col: 1 },
  );
});

test("an empty last parameter takes its default too", () => {
  const { row, col } = find(engine(), "\x1b[5;HX", "X");
  assert.deepEqual({ row, col }, { row: 5, col: 1 });
});

test("regression: an empty SGR parameter is a reset, as 0 would be", () => {
  // \x1b[1;;4m is bold, reset, underline: underlined but not bold.
  const now = find(engine(), "\x1b[1;;4mX", "X");
  assert.equal(now.bold, false);
  assert.equal(now.underline, true);
  const then = find(originalEngine(), "\x1b[1;;4mX", "X");
  assert.equal(then.bold, true, "the original dropped the empty parameter");
});

test("regression: 38;5 with no colour index leaves the colour alone", () => {
  // The original set the colour to "#NaNNaNNaN", which the grader's
  // classifier calls red -- so this passed mission 01 without a red code.
  const ctx = engine();
  assert.equal(find(ctx, "\x1b[38;5mX", "X").fg, null);
  assert.equal(find(ctx, "\x1b[48;5mX", "X").bg, null);
  assert.equal(grade(ctx, 1, "\x1b[38;5mACCESS"), false);
  assert.equal(find(originalEngine(), "\x1b[38;5mX", "X").fg, "#NaNNaNNaN");
  assert.equal(grade(originalEngine(), 1, "\x1b[38;5mACCESS"), true);
});

test("regression: 38;2 with missing components leaves the colour alone", () => {
  const ctx = engine();
  assert.equal(find(ctx, "\x1b[38;2;127;90mX", "X").fg, null);
  assert.equal(grade(ctx, 8, "\x1b[38;2mGHOST"), false);
  assert.match(find(originalEngine(), "\x1b[38;2;127;90mX", "X").fg, /NaN/);
});

test("a colour already set survives an incomplete extended colour after it", () => {
  assert.equal(find(engine(), "\x1b[31;38;5mX", "X").fg, "#ff5c57");
});

test("a private-mode sequence is consumed and ignored", () => {
  const { row, col, fg } = find(engine(), "\x1b[?25lX", "X");
  assert.deepEqual({ row, col, fg }, { row: 1, col: 1, fg: null });
});

test("the breakdown reads empty parameters the way the screen does", () => {
  const ctx = engine();
  const desc = (input) => JSON.parse(ctx.$run(`JSON.stringify(explainInput(${JSON.stringify(input)}))`))[0].desc;
  assert.equal(desc("\x1b[;20H"), "move cursor → row 1, column 20");
  assert.equal(desc("\x1b[1;;4m"), "bold on, reset all attributes, underline on");
  assert.equal(desc("\x1b[m"), "reset all attributes");
  assert.equal(desc("\x1b[38;5m"), "foreground → 256-color index missing (ignored)");
  assert.equal(desc("\x1b[3J"), "erase entire screen");
});

test("mergeProgress keeps what either copy of the same run completed", () => {
  const ctx = engine();
  const merge = (stored, mine) => JSON.parse(ctx.$run(`JSON.stringify(mergeProgress(${JSON.stringify(stored)}, ${JSON.stringify(mine)}))`));
  const run = { callsign: "ivy", startTime: 1000, settings: { reducedMotion: false } };
  const stored = { ...run, current: 4, completed: [1, 1, 1, 1, 0].map(Boolean), attempts: [1, 2, 1, 3, 0], highestReached: 4 };
  const mine = { ...run, current: 2, completed: [1, 1, 0, 0, 1].map(Boolean), attempts: [1, 1, 4, 0, 1], highestReached: 2, settings: { reducedMotion: true } };
  assert.deepEqual(merge(stored, mine), {
    ...mine,
    completed: [true, true, true, true, true],
    attempts: [1, 2, 4, 3, 1],
    highestReached: 4,
  });
});

test("mergeProgress lets a different run replace what is stored", () => {
  const ctx = engine();
  const merge = (stored, mine) => JSON.parse(ctx.$run(`JSON.stringify(mergeProgress(${JSON.stringify(stored)}, ${JSON.stringify(mine)}))`));
  const old = { callsign: "ivy", startTime: 1000, current: 5, completed: [true, true], attempts: [3, 3], highestReached: 5 };
  const restarted = { callsign: "ivy", startTime: 2000, current: 0, completed: [false, false], attempts: [0, 0], highestReached: 0 };
  assert.deepEqual(merge(old, restarted), restarted);
  const newOperator = { ...restarted, callsign: "hal", startTime: 1000 };
  assert.deepEqual(merge(old, newOperator), newOperator);
  assert.deepEqual(merge(null, restarted), restarted);
});
