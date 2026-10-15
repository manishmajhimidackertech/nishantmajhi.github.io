"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load, fakeDocument } = require("./harness");

/*
 * SimLoan's real script on a fake page: the three inputs preset, a Chart that
 * records what it was asked to draw, and DOMContentLoaded fired, which is what
 * runs the first compute() in "Find Tenure" mode.
 */
function simloan(rev, { principal = "500000", rate = "12", emi = "12000" } = {}) {
  const charts = [];
  class Chart {
    constructor(_el, config) {
      this.config = config;
      charts.push(this);
    }
    destroy() {
      this.destroyed = true;
    }
  }
  const document = fakeDocument({
    loanAmt: { value: principal },
    rateSlider: { value: rate },
    emiAmt: { value: emi },
  });
  const storage = new Map();
  const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
  };
  const window = { matchMedia: () => ({ matches: false }) };
  const ctx = load("SimLoan/script.js", { rev, globals: { document, window, Chart, localStorage } });
  document.dispatch("DOMContentLoaded");
  const text = (id) => document.getElementById(id).textContent;
  const lastChart = () => charts[charts.length - 1];
  const rows = () => document.getElementById("schedBody").children[0].children.map((tr) => tr.innerHTML);
  return { ctx, document, charts, text, lastChart, rows };
}

/* An amortisation worked month by month, independent of the code under test. */
function amortise(principal, annualRate, emi) {
  const r = annualRate / 1200;
  let balance = principal;
  const payments = [];
  while (balance > 1e-6) {
    const interest = balance * r;
    const payment = Math.min(emi, balance + interest);
    payments.push(payment);
    balance = balance + interest - payment;
  }
  const total = payments.reduce((a, b) => a + b, 0);
  return { months: payments.length, total, interest: total - principal, last: payments[payments.length - 1] };
}

const lakh = (n) => "रू " + (n / 100000).toFixed(2) + " L";

test("the independent amortisation agrees with the textbook EMI", () => {
  // 5 lakh at 12% over 60 months is an EMI of 11,122.22; paying exactly that
  // clears the loan in 60 months.
  const { ctx } = simloan("working");
  const { emi } = ctx.calcEMI(500000, 12, 60);
  assert.ok(Math.abs(emi - 11122.22) < 0.01, `EMI ${emi}`);
  assert.equal(amortise(500000, 12, emi + 1e-9).months, 60);
});

test("regression: Find Tenure charges a part payment in the last month, not a full EMI", () => {
  const expected = amortise(500000, 12, 12000);
  assert.equal(expected.months, 55);
  assert.ok(expected.last < 12000 / 2, "the last month is well short of an EMI");

  const working = simloan("working");
  assert.equal(working.text("mTenure"), "4 yrs 7 mo");
  assert.equal(working.text("mTotal"), lakh(expected.total));
  assert.equal(working.text("mInt"), lakh(expected.interest));

  const original = simloan("original");
  assert.equal(original.text("mTenure"), "4 yrs 7 mo");
  assert.equal(original.text("mTotal"), "रू 6.60 L", "55 full EMIs of 12,000");
  assert.notEqual(original.text("mTotal"), lakh(expected.total));
});

test("regression: the interest ratio is worked from the interest actually paid", () => {
  const expected = amortise(500000, 12, 12000);
  const ratio = ((expected.interest / 500000) * 100).toFixed(1) + "%";
  assert.equal(simloan("working").text("mRatio"), ratio);
  assert.notEqual(simloan("original").text("mRatio"), ratio);
});

test("regression: the schedule's last row pays off what is left and no more", () => {
  const expected = amortise(500000, 12, 12000);
  for (const rev of ["working", "original"]) {
    const { ctx } = simloan(rev);
    const rows = ctx.buildSchedule(500000, 12, 55, 12000);
    const paid = rows.reduce((s, r) => s + r.principal, 0);
    const last = rows[rows.length - 1];
    if (rev === "working") {
      assert.ok(Math.abs(paid - 500000) < 1e-6, `principal repaid ${paid}`);
      assert.ok(Math.abs(last.emi - expected.last) < 1e-6, `last payment ${last.emi}`);
      assert.ok(Math.abs(last.balance) < 1e-6);
      assert.equal(last.pctPaid, 100);
    } else {
      assert.ok(paid > 500000 + 1000, "the original repaid more principal than was borrowed");
    }
  }
});

test("the table shows the part payment in its last row", () => {
  const expected = amortise(500000, 12, 12000);
  const { rows } = simloan("working");
  const all = rows();
  assert.equal(all.length, 55);
  assert.match(all[54], new RegExp(`<td>रू ${Math.round(expected.last).toLocaleString("en-IN")}</td>`));
  assert.match(all[53], /<td>रू 12,000<\/td>/);
});

test("regression: switching theme in Find Tenure mode redraws the schedule that is on screen", () => {
  for (const rev of ["working", "original"]) {
    const page = simloan(rev);
    const before = page.lastChart().config.data;
    page.ctx.toggleTheme();
    const after = page.lastChart().config.data;
    const same =
      JSON.stringify(after.labels) === JSON.stringify(before.labels) &&
      JSON.stringify(after.datasets.map((d) => d.data)) === JSON.stringify(before.datasets.map((d) => d.data));
    if (rev === "working") assert.ok(same, "the redrawn chart is a different loan");
    else assert.ok(!same, "the original redrew the 60-month dial's loan instead");
  }
});

test("switching theme in Find EMI mode redraws the same schedule too", () => {
  const page = simloan("working");
  page.ctx.setMode("emi");
  const before = JSON.stringify(page.lastChart().config.data.datasets.map((d) => d.data));
  page.ctx.toggleTheme();
  assert.equal(JSON.stringify(page.lastChart().config.data.datasets.map((d) => d.data)), before);
});

test("Find EMI mode charges the textbook EMI for the dial's tenure", () => {
  const page = simloan("working");
  page.ctx.setMode("emi");
  const { emi } = page.ctx.calcEMI(500000, 12, 60);
  assert.equal(page.text("mEMI"), "रू " + Math.round(emi).toLocaleString("en-IN") + "/mo");
  assert.equal(page.text("mTotal"), lakh(emi * 60));
  assert.equal(page.rows().length, 60);
});

test("every schedule ends with nothing owed, in either mode", () => {
  const { ctx } = simloan("working");
  for (const [p, rate, months] of [[500000, 12, 60], [1000, 1, 1], [5000000, 36, 360], [250000, 7.5, 13]]) {
    const { emi } = ctx.calcEMI(p, rate, months);
    const rows = ctx.buildSchedule(p, rate, months, emi);
    assert.equal(rows.length, months);
    assert.ok(Math.abs(rows[months - 1].balance) < 1e-6);
  }
  for (const [p, rate, emi] of [[500000, 12, 12000], [100000, 18, 1600], [5000000, 1, 50000]]) {
    const months = ctx.calcTenure(p, rate, emi);
    const rows = ctx.buildSchedule(p, rate, months, emi);
    assert.equal(months, amortise(p, rate, emi).months);
    assert.ok(Math.abs(rows[months - 1].balance) < 1e-6);
    assert.ok(rows.every((r) => r.emi <= emi + 1e-9), "no month pays more than the EMI");
  }
});

test("an EMI that exactly fits a whole number of months is not given an extra one", () => {
  const { ctx } = simloan("working");
  for (const months of [12, 60, 120, 360]) {
    const { emi } = ctx.calcEMI(500000, 12, months);
    assert.equal(ctx.calcTenure(500000, 12, emi), months);
  }
});

test("an EMI that does not cover the first month's interest says so", () => {
  // 1% a month on 5 lakh is 5,000.
  const page = simloan("working", { emi: "5000" });
  assert.equal(page.ctx.calcTenure(500000, 12, 5000), null);
  assert.equal(page.text("emiHint"), "EMI must be above रू 5,000 to cover monthly interest.");
  for (const id of ["mInt", "mTotal", "mRatio", "mTenure"]) assert.equal(page.text(id), "-");
});

test("tenure is labelled in years and months", () => {
  const cases = [[12, "1 yr"], [13, "1 yr 1 mo"], [24, "2 yrs"], [11, "11 mo"], [55, "4 yrs 7 mo"]];
  for (const [months, label] of cases) {
    const { ctx } = simloan("working");
    const emi = ctx.calcEMI(500000, 12, months).emi;
    const page = simloan("working", { emi: String(emi) });
    assert.equal(page.text("mTenure"), label, `${months} months`);
  }
});

test("amounts are written in lakh and crore", () => {
  const { ctx } = simloan("working");
  assert.equal(ctx.fmt(99999), "रू 99,999");
  assert.equal(ctx.fmt(150000, true), "रू 1.50 L");
  assert.equal(ctx.fmt(25000000, true), "रू 2.50 Cr");
  assert.equal(ctx.fmtS(150000), "रू 1.5L");
  assert.equal(ctx.fmtS(12345678), "रू 1.2Cr");
});
