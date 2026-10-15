"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { readSource, inlineScripts, createContext, fakeDocument } = require("./harness");

/*
 * The page's own script -- one IIFE that wires itself to the inputs and
 * buttons -- run on a fake page, and driven by pressing its buttons. Nothing
 * is lifted out of it.
 */
function multiplier(a, b, { lazy = true, rev = "working" } = {}) {
  const document = fakeDocument({
    inA: { value: String(a) },
    inB: { value: String(b) },
    lazy: { value: lazy ? "1" : "0" },
  });
  const ctx = createContext({ document });
  for (const script of inlineScripts(readSource("recursion-in-multiplication/index.html", rev))) {
    vm.runInContext(script, ctx);
  }
  // The page assigns some counts as numbers; a real element would hold text.
  const text = (id) => String(document.getElementById(id).textContent);
  const press = (id) => document.getElementById(id).click();
  return { document, text, press };
}

function product(a, b, opts) {
  const page = multiplier(a, b, opts);
  page.press("bRun");
  return page;
}

test("the page's inputs take at most nine digits each", () => {
  const html = readSource("recursion-in-multiplication/index.html");
  for (const id of ["inA", "inB"]) {
    const tag = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))[0];
    assert.match(tag, /maxlength="9"/);
  }
});

test("the page's own example, 726 x 25, comes out at 18150", () => {
  assert.equal(product(726, 25).text("mProd"), "18150");
});

test("every product agrees with BigInt, in both table modes", () => {
  let seed = 99;
  const rand = (n) => ((seed = (seed * 48271) % 2147483647), seed % n);
  for (let i = 0; i < 400; i++) {
    const a = String(rand(10 ** (1 + rand(9))));
    const b = String(rand(10 ** (1 + rand(9))));
    const want = (BigInt(a) * BigInt(b)).toString();
    for (const lazy of [true, false]) {
      assert.equal(product(a, b, { lazy }).text("mProd"), want, `${a} x ${b}, lazy=${lazy}`);
    }
  }
});

test("the largest inputs the page accepts multiply exactly", () => {
  assert.equal(product("999999999", "999999999").text("mProd"), "999999998000000001");
  assert.equal(product("987654321", "123456789").text("mProd"), (987654321n * 123456789n).toString());
});

test("regression: Run finishes when the multiplier is zero", () => {
  // A zero multiplier needs no table entries and places nothing, so the
  // algorithm has no steps. Run looped while steps remained -- none -- and
  // never reached the end: the product stayed "-" and the buttons enabled.
  for (const b of [0, "000"]) {
    const working = product(8, b);
    assert.equal(working.text("mProd"), "0");
    assert.equal(working.text("phase"), "complete");
    assert.equal(working.document.getElementById("bRun").disabled, true);
    const original = product(8, b, { rev: "original" });
    assert.equal(original.text("mProd"), "-");
    assert.equal(original.text("phase"), "idle");
  }
});

test("zeros, ones and leading zeros", () => {
  assert.equal(product(0, 12345).text("mProd"), "0");
  assert.equal(product(12345, 0).text("mProd"), "0");
  assert.equal(product(1, 1).text("mProd"), "1");
  assert.equal(product("000726", "0025").text("mProd"), "18150");
  assert.equal(product(1000000, 1000).text("mProd"), "1000000000");
});

test("anything that is not a digit is ignored", () => {
  assert.equal(product("7,26", " 2 5 ").text("mProd"), "18150");
});

test("Step walks the same algorithm to the same product as Run", () => {
  const page = multiplier(4096, 789);
  for (let i = 0; i < 50 && !page.document.getElementById("bStep").disabled; i++) page.press("bStep");
  assert.equal(page.text("phase"), "complete");
  assert.equal(page.text("mProd"), "3231744");
  assert.equal(page.text("mAdds"), product(4096, 789).text("mAdds"));
});

test("lazy mode builds only the table entries the multiplier's digits need", () => {
  // 25 needs t[2] and t[5]; t[5] = t[1] + t[4] and t[4] = t[2] + t[2].
  const page = product(726, 25);
  const rows = page.document.getElementById("chain").innerHTML.match(/<div class="chainrow[^"]*"><span class="ck">\d/g);
  const built = rows.filter((r) => !r.includes("skip")).map((r) => Number(r.slice(-1)));
  assert.deepEqual(built, [2, 4, 5]);
  const eager = product(726, 25, { lazy: false });
  const all = eager.document.getElementById("chain").innerHTML.match(/chainrow( done)?"><span class="ck">\d/g);
  assert.equal(all.length, 8, "eager mode builds t[2] to t[9]");
});

test("the swapped-order cost is what running the swapped order actually costs", () => {
  for (const [a, b] of [[726, 25], [25, 726], [123456789, 7], [90909, 1001]]) {
    const forward = product(a, b);
    const swapped = product(b, a);
    assert.equal(forward.text("mSwap").replace(/\D/g, ""), swapped.text("mAdds"), `${a} x ${b}`);
  }
});

test("the naive count is repeated addition: the multiplier times the multiplicand's digits", () => {
  assert.equal(product(726, 25).text("mNaive"), "75");
  assert.equal(product(123456789, 1000).text("mNaive"), "9,000");
});

test("no shifts are ever counted, which is the page's point", () => {
  assert.equal(product(987654321, 123456789).text("mShift"), "0");
});
