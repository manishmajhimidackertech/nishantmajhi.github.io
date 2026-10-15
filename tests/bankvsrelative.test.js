"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { load, readSource, inlineScripts, extractFunction, createContext } = require("./harness");

/* The page's defaults, as resetAll() sets them. */
const DEFAULTS = { principal: 1000000, rbank: 0.09, monthly: 50000, nmonths: 6, rrel: 0.36, lent: 25000 };
/* The relative-rate slider's range, which the solver searches. */
const RATE_LO = 0.01;
const RATE_HI = 0.8;

function model() {
  return load("BankVsRelative/model.js");
}

/*
 * The original's simulate() and findBreakeven(), lifted out of the page's
 * inline script: its top level wires up sliders and starts an animation loop,
 * so it cannot simply be run.
 */
function originalModel() {
  const script = inlineScripts(readSource("BankVsRelative/index.html", "original")).join("\n");
  const ctx = createContext();
  vm.runInContext(extractFunction(script, "simulate") + "\n" + extractFunction(script, "findBreakeven"), ctx);
  return ctx;
}

const balanceGap = (m, p, lent) => {
  const { A, B } = m.simulate(p, lent);
  return B[p.nmonths - 1].balance - A[p.nmonths - 1].balance;
};

test("the page's slider ranges are the ones assumed here", () => {
  const html = readSource("BankVsRelative/index.html");
  const slider = (id) => {
    const tag = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))[0];
    return { min: Number(tag.match(/min="([\d.]+)"/)[1]), max: Number(tag.match(/max="([\d.]+)"/)[1]) };
  };
  assert.deepEqual(slider("rrel"), { min: RATE_LO * 100, max: RATE_HI * 100 });
  assert.deepEqual(slider("nmonths"), { min: 1, max: 36 });
});

test("lending more scales the gap between the scenarios in exact proportion", () => {
  // This is why there is no break-even *amount*: the gap is k * amount.
  const m = model();
  for (const nmonths of [1, 2, 6, 12, 36]) {
    for (const rrel of [0.01, 0.05, 0.09, 0.36, 0.8]) {
      const p = { ...DEFAULTS, nmonths, rrel };
      const unit = balanceGap(m, p, 1000);
      for (const lent of [5000, 25000, 50000]) {
        const g = balanceGap(m, p, lent);
        assert.ok(Math.abs(g - (unit * lent) / 1000) < 1e-6, `n=${nmonths} r=${rrel} lent=${lent}`);
      }
    }
  }
});

test("regression: the original's break-even search never finds an amount", () => {
  const orig = originalModel();
  for (const nmonths of [1, 2, 3, 6, 12, 24, 36]) {
    for (const rrel of [0.01, 0.05, 0.075, 0.09, 0.2, 0.36, 0.8]) {
      for (const rbank of [0.01, 0.09, 0.24]) {
        const p = { ...DEFAULTS, nmonths, rrel, rbank };
        assert.equal(orig.findBreakeven(p), null, `n=${nmonths} rrel=${rrel} rbank=${rbank}`);
      }
    }
  }
});

test("regression: on the page's defaults there is a break-even rate, and it is found", () => {
  const { rate } = model().findBreakevenRate(DEFAULTS, DEFAULTS.lent, RATE_LO, RATE_HI);
  assert.ok(rate > RATE_LO && rate < RATE_HI, `rate ${rate}`);
  assert.equal(originalModel().findBreakeven(DEFAULTS), null);
});

test("the break-even rate is the closed form ((1 + i)^(N-1) - 1) * 12 / N", () => {
  // Lent in month 1 at the bank's monthly rate i, the shortfall compounds for
  // N-1 months; the relative pays simple interest for N months. (A loan big
  // enough not to be cleared within 36 months, which would end the
  // compounding early.)
  const m = model();
  for (const nmonths of [2, 3, 6, 12, 24, 36]) {
    for (const rbank of [0.01, 0.09, 0.15, 0.24]) {
      const p = { ...DEFAULTS, principal: 1e8, nmonths, rbank };
      const want = ((1 + rbank / 12) ** (nmonths - 1) - 1) * (12 / nmonths);
      const { rate } = m.findBreakevenRate(p, DEFAULTS.lent, 0, RATE_HI);
      assert.ok(Math.abs(rate - want) < 1e-9, `n=${nmonths} bank=${rbank}: ${rate} vs ${want}`);
    }
  }
});

test("at the rate found, both scenarios end month N owing the same", () => {
  const m = model();
  for (const nmonths of [2, 6, 12, 36]) {
    const p = { ...DEFAULTS, nmonths };
    const { rate } = m.findBreakevenRate(p, DEFAULTS.lent, RATE_LO, RATE_HI);
    if (rate === null) continue;
    assert.ok(Math.abs(balanceGap(m, { ...p, rrel: rate }, DEFAULTS.lent)) < 0.01, `n=${nmonths}`);
  }
});

test("the rate does not depend on how much is lent", () => {
  const m = model();
  const rates = [1000, 25000, 50000].map((lent) => m.findBreakevenRate(DEFAULTS, lent, RATE_LO, RATE_HI).rate);
  for (const r of rates) assert.ok(Math.abs(r - rates[0]) < 1e-9);
});

test("above the break-even rate lending wins, below it paying the bank does", () => {
  const m = model();
  const { rate } = m.findBreakevenRate(DEFAULTS, DEFAULTS.lent, RATE_LO, RATE_HI);
  assert.ok(balanceGap(m, { ...DEFAULTS, rrel: rate + 0.01 }, DEFAULTS.lent) < 0, "lending ends lower");
  assert.ok(balanceGap(m, { ...DEFAULTS, rrel: rate - 0.01 }, DEFAULTS.lent) > 0, "paying the bank ends lower");
});

test("held for one month, lending wins at any rate, and the solver says so", () => {
  // Lent and repaid in month 1: the bank never misses the money.
  const result = model().findBreakevenRate({ ...DEFAULTS, nmonths: 1 }, DEFAULTS.lent, RATE_LO, RATE_HI);
  assert.deepEqual({ ...result }, { rate: null, winner: "lend" });
});

test("when even the highest rate cannot cover the bank's interest, the bank wins", () => {
  const p = { ...DEFAULTS, principal: 1e8, rbank: 0.24, nmonths: 36 };
  const result = model().findBreakevenRate(p, DEFAULTS.lent, RATE_LO, 0.05);
  assert.deepEqual({ ...result }, { rate: null, winner: "bank" });
});

test("when the loan is cleared before month N either way, no rate matters", () => {
  const p = { ...DEFAULTS, principal: 60000, nmonths: 6 };
  const result = model().findBreakevenRate(p, DEFAULTS.lent, RATE_LO, RATE_HI);
  assert.deepEqual({ ...result }, { rate: null, winner: "neither" });
});

test("simulate is the page's original simulate, moved and unchanged", () => {
  const m = model();
  const orig = originalModel();
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647), seed / 2147483647);
  for (let i = 0; i < 500; i++) {
    const p = {
      principal: Math.round(rand() * 5e6),
      rbank: (1 + rand() * 23) / 100,
      monthly: Math.round(rand() * 2e5),
      nmonths: 1 + Math.floor(rand() * 36),
      rrel: (1 + rand() * 79) / 100,
    };
    const lent = Math.round(rand() * p.monthly);
    assert.equal(JSON.stringify(m.simulate(p, lent)), JSON.stringify(orig.simulate(p, lent)));
  }
});

test("the page loads the model before its own script, and keeps no second copy", () => {
  const html = readSource("BankVsRelative/index.html");
  const at = html.indexOf('<script src="model.js"></script>');
  assert.ok(at > 0, "model.js is loaded");
  const inline = inlineScripts(html);
  assert.equal(inline.length, 1);
  assert.ok(html.indexOf(inline[0]) > at, "model.js comes first");
  assert.doesNotMatch(inline[0], /function simulate\(|function findBreakeven/);
});
