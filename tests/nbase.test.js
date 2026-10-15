"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load, fakeDocument, FakeElement, readSource } = require("./harness");

/*
 * nBase's real script on a fake copy of its page: three sections, each with a
 * base <select> and (for the two numbers) an <input>, four operator buttons
 * and an <output>. DOMContentLoaded is fired, which is where the script wires
 * everything up.
 */
function nbase(rev) {
  const section = (withInput) => {
    const el = new FakeElement("section");
    const select = new FakeElement("select", { value: "10" });
    const input = withInput ? new FakeElement("input", { value: "" }) : null;
    el.querySelector = (sel) => ({ select, input })[sel];
    return { el, select, input };
  };
  const first = section(true);
  const second = section(true);
  const ops = section(false);
  const buttons = ["+", "-", "*", "/"].map((op) => {
    const b = new FakeElement("button");
    b.setAttribute("data-operator", op);
    return b;
  });
  ops.el.querySelectorAll = () => buttons;
  const output = new FakeElement("output");

  const document = fakeDocument();
  document.getElementById = (id) => ({ first_num: first.el, second_num: second.el, operations: ops.el })[id];
  document.querySelector = (sel) => (sel === "output" ? output : null);
  const ctx = load("nBase/script.js", { rev, globals: { document } });
  document.dispatch("DOMContentLoaded");

  const setBase = (s, base) => {
    s.select.value = String(base);
    s.select.dispatch("change");
  };
  /* Type two numbers in their bases, pick a result base, press an operator. */
  const calc = (a, baseA, b, baseB, op, resultBase = 10) => {
    first.input.value = a;
    second.input.value = b;
    setBase(first, baseA);
    setBase(second, baseB);
    setBase(ops, resultBase);
    buttons.find((x) => x.getAttribute("data-operator") === op).click();
    return output.innerHTML || output.textContent;
  };
  return { ctx, calc, output, first, second, ops, setBase, buttons };
}

const eq = (a, baseA, op, b, baseB, result, resultBase) =>
  `(${a})<sub>${baseA}</sub>&nbsp;${op}&nbsp;(${b})<sub>${baseB}</sub>&nbsp;=&nbsp;(${result})<sub>${resultBase}</sub>`;

test("adds, subtracts and multiplies across bases", () => {
  const { calc } = nbase("working");
  assert.equal(calc("101", 2, "11", 2, "+"), eq("101", 2, "+", "11", 2, "8", 10));
  assert.equal(calc("ff", 16, "1", 10, "+", 2), eq("ff", 16, "+", "1", 10, "100000000", 2));
  assert.equal(calc("17", 8, "20", 10, "-", 10), eq("17", 8, "-", "20", 10, "-5", 10));
  assert.equal(calc("44", 5, "3", 10, "*", 16), eq("44", 5, "×", "3", 10, "48", 16));
});

test("division gives a quotient and a remainder in the result base", () => {
  const { calc, output } = nbase("working");
  calc("100", 10, "7", 10, "/", 2);
  assert.match(output.innerHTML, /Quotient&nbsp;=&nbsp;\(1110\)<sub>2<\/sub>/);
  assert.match(output.innerHTML, /Remainder&nbsp;=&nbsp;\(10\)<sub>2<\/sub>/);
});

test("division by zero says so", () => {
  const { calc, output } = nbase("working");
  calc("5", 10, "0", 10, "/");
  assert.equal(output.textContent, "Division by zero!");
});

test("an empty number is invalid", () => {
  const { calc, output } = nbase("working");
  calc("", 10, "5", 10, "+");
  assert.equal(output.textContent, "Invalid input!");
});

test("changing the result base redoes the last calculation", () => {
  const page = nbase("working");
  page.calc("255", 10, "0", 10, "+", 10);
  page.setBase(page.ops, 16);
  assert.equal(page.output.innerHTML, eq("255", 10, "+", "0", 10, "ff", 16));
});

test("hex digits may be typed in either case", () => {
  const { calc } = nbase("working");
  assert.equal(calc("FF", 16, "ff", 16, "-"), eq("FF", 16, "-", "ff", 16, "0", 10));
});

/* A number that is not written in its base must be refused, not half-read. */
for (const [label, a, base] of [
  ["a 9 in a binary number", "19", 2],
  ["letters after decimal digits", "12abc", 10],
  ["a 5 in a quinary number", "45", 5],
  ["an 8 in an octal number", "78", 8],
  ["a 0x prefix on a hex number", "0x1F", 16],
  ["a minus sign the pattern does not allow", "-5", 10],
  ["a decimal point", "1.5", 10],
]) {
  test(`regression: ${label} is invalid input`, () => {
    const working = nbase("working");
    assert.equal(working.calc(a, base, "1", 10, "+"), "Invalid input!");
    const original = nbase("original");
    assert.notEqual(original.calc(a, base, "1", 10, "+"), "Invalid input!", "the original read a prefix of it");
  });
}

test("regression: markup typed into a number is not rendered", () => {
  const working = nbase("working");
  assert.equal(working.calc("1<img src=x>", 10, "1", 10, "+"), "Invalid input!");
  const original = nbase("original");
  assert.match(original.calc("1<img src=x>", 10, "1", 10, "+"), /<img src=x>/);
});

test("regression: numbers past 2^53 come out exact", () => {
  // 2^53 + 1 cannot be held in a double; the original printed 2^53.
  const working = nbase("working");
  assert.equal(
    working.calc("9007199254740993", 10, "0", 10, "+"),
    eq("9007199254740993", 10, "+", "0", 10, "9007199254740993", 10),
  );
  const original = nbase("original");
  assert.equal(
    original.calc("9007199254740993", 10, "0", 10, "+"),
    eq("9007199254740993", 10, "+", "0", 10, "9007199254740992", 10),
  );
});

test("regression: a 24-digit multiplication is exact", () => {
  const a = "ffffffffffffffffffffffff";
  const b = "999999999999999999999999";
  const want = (BigInt("0x" + a) * BigInt(b)).toString(16);
  assert.equal(nbase("working").calc(a, 16, b, 10, "*", 16), eq(a, 16, "×", b, 10, want, 16));
  assert.notEqual(nbase("original").calc(a, 16, b, 10, "*", 16), eq(a, 16, "×", b, 10, want, 16));
});

test("agrees with BigInt on a thousand random sums, differences, products and divisions", () => {
  const { calc, output } = nbase("working");
  const bases = [2, 5, 8, 10, 16];
  let seed = 12345;
  const rand = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
  for (let i = 0; i < 1000; i++) {
    const [ba, bb, br] = [bases[rand(5)], bases[rand(5)], bases[rand(5)]];
    const x = BigInt(rand(2 ** 30)) * BigInt(rand(2 ** 30)) + BigInt(rand(1000));
    const y = BigInt(rand(2 ** 30)) + 1n;
    const op = "+-*/"[rand(4)];
    calc(x.toString(ba), ba, y.toString(bb), bb, op, br);
    if (op === "/") {
      assert.ok(output.innerHTML.includes(`Quotient&nbsp;=&nbsp;(${(x / y).toString(br)})`));
      assert.ok(output.innerHTML.includes(`Remainder&nbsp;=&nbsp;(${(x % y).toString(br)})`));
    } else {
      const r = op === "+" ? x + y : op === "-" ? x - y : x * y;
      assert.ok(output.innerHTML.endsWith(`=&nbsp;(${r.toString(br)})<sub>${br}</sub>`), `${x} ${op} ${y}`);
    }
  }
});

test("parseInBase accepts exactly the digits each input's pattern allows", () => {
  const { ctx } = nbase("working");
  const html = readSource("nBase/index.html");
  // The bases on offer are the ones the selects list.
  const offered = [...new Set([...html.matchAll(/<option value="(\d+)"/g)].map((m) => Number(m[1])))];
  assert.deepEqual(offered, [2, 5, 8, 10, 16]);
  for (const base of offered) {
    const digits = "0123456789abcdef".slice(0, base);
    for (const ch of "0123456789abcdefg") {
      const ok = ctx.parseInBase(ch, base) !== null;
      assert.equal(ok, digits.includes(ch), `${ch} in base ${base}`);
    }
  }
  assert.equal(ctx.parseInBase("  101  ", 2), 5n, "surrounding spaces are trimmed, as before");
  assert.equal(ctx.parseInBase("007", 8), 7n);
});
