"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./harness");

/*
 * TrigEqK's vendored math.js and its real script, in one context as the page
 * loads them. Expressions are evaluated inside the context: math.js rejects a
 * scope object made in another realm as "not an Object".
 */
function trig(rev) {
  const ctx = load(["TrigEqK/math.min.js", "TrigEqK/script.js"], { rev });
  /* Pass/fail for `lhs = rhs` at each angle, in degrees. */
  ctx.check = (equation, angles) => {
    const [lhs, rhs] = equation.split("=").map((s) => s.trim());
    return angles.map((a) => ctx.$run(`testExpression(${a}, ${JSON.stringify(lhs)}, ${JSON.stringify(rhs)}).pass`));
  };
  ctx.failsAt = (equation, angles) => angles.filter((a, i) => !ctx.check(equation, angles)[i]);
  return ctx;
}

const STANDARD = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330, 360];
const NEAR_ASYMPTOTES = [0.01, 0.02, 89.98, 89.99, 90.01, 90.02, 179.98, 179.99, 180.01, 269.98, 269.99, 270.01, 359.99];

test("the page's own angles are the ones tested here", () => {
  const src = require("./harness").readSource("TrigEqK/script.js");
  const listed = src.match(/var standardAngles = \[([\s\S]*?)\]/)[1].split(",").map((s) => s.trim()).filter(Boolean).map(Number);
  assert.deepEqual(listed, STANDARD);
});

const IDENTITIES = [
  "sin(x)^2 + cos(x)^2 = 1",
  "sec(x)^2 = 1 + tan(x)^2",
  "csc(x)^2 = 1 + cot(x)^2",
  "cosec(x)^2 = 1 + cot(x)^2",
  "tan(x) = sin(x)/cos(x)",
  "cot(x) = cos(x)/sin(x)",
  "sin(2x) = 2 sin(x) cos(x)",
  "cos(2x) = 1 - 2 sin(x)^2",
  "cos(2x) = cos(x)^2 - sin(x)^2",
  "sin(x + pi/2) = cos(x)",
  "sec(x) = 1/cos(x)",
];

test("textbook identities pass at every standard angle", () => {
  const t = trig("working");
  for (const id of IDENTITIES) assert.deepEqual(t.failsAt(id, STANDARD), [], id);
});

test("regression: an identity whose sides are both undefined at an angle passes there", () => {
  // tan(2x) is undefined at 45 degrees, and so is 2tan(x)/(1 - tan(x)^2). In
  // floating point neither is Infinity -- tan(pi/2) is 1.6e16 and the right
  // side is -9e15 -- so the check for "both undefined" never fired and the
  // identity was reported as failing.
  const id = "tan(2x) = 2 tan(x)/(1 - tan(x)^2)";
  assert.deepEqual(trig("working").failsAt(id, STANDARD), []);
  assert.deepEqual(trig("original").failsAt(id, STANDARD), [45, 135, 225, 315]);
});

test("regression: identities hold at random angles beside an asymptote", () => {
  // At 89.99 degrees sec(x)^2 is about 3.3e7, where one unit in the last
  // place is ~7e-9: more than the old absolute tolerance of 1e-9.
  const id = "sec(x)^2 = 1 + tan(x)^2";
  assert.deepEqual(trig("working").failsAt(id, NEAR_ASYMPTOTES), []);
  assert.ok(trig("original").failsAt(id, NEAR_ASYMPTOTES).length > 0);
  for (const other of IDENTITIES) assert.deepEqual(trig("working").failsAt(other, NEAR_ASYMPTOTES), [], other);
});

test("regression: asec, acsc and acot are evaluated, not mangled", () => {
  // "asec(2)" contains "sec(", which the reciprocal expansion rewrote to
  // "a(1/cos(2))" -- an error at every angle.
  for (const id of ["asec(2) = acos(1/2)", "acsc(2) = asin(1/2)", "acot(1) = atan(1)", "asec(sec(x/4)) = x/4"]) {
    assert.deepEqual(trig("working").failsAt(id, [30, 60, 120]), [], id);
    assert.deepEqual(trig("original").failsAt(id, [30, 60, 120]), [30, 60, 120], id);
  }
});

test("hyperbolic sech, csch and coth reach math.js untouched", () => {
  const t = trig("working");
  assert.deepEqual(t.failsAt("sech(x) = 1/cosh(x)", [30, 200]), []);
  assert.deepEqual(t.failsAt("csch(x) = 1/sinh(x)", [30, 200]), []);
  assert.deepEqual(t.failsAt("coth(x) = cosh(x)/sinh(x)", [30, 200]), []);
});

test("regression: two different complex results do not pass as equal", () => {
  // Both sides are complex everywhere, which the original read as "both
  // undefined" and passed at every angle.
  const id = "sqrt(sin(x) - 2) = sqrt(cos(x) - 5)";
  assert.deepEqual(trig("working").failsAt(id, STANDARD), STANDARD);
  assert.deepEqual(trig("original").failsAt(id, STANDARD), []);
});

test("equal complex results do pass", () => {
  assert.deepEqual(trig("working").failsAt("sqrt(sin(x) - 2) = i sqrt(2 - sin(x))", STANDARD), []);
});

test("regression: two different units do not pass as equal", () => {
  const t = trig("working");
  assert.deepEqual(t.failsAt("5 cm = 3 m", [30]), [30]);
  assert.deepEqual(t.failsAt("50 cm = 0.5 m", [30]), []);
  assert.deepEqual(trig("original").failsAt("5 cm = 3 m", [30]), []);
});

test("an equation that is not an identity fails where it is false", () => {
  const t = trig("working");
  const fails = t.failsAt("sin(x) = cos(x)", STANDARD);
  assert.deepEqual(STANDARD.filter((a) => !fails.includes(a)), [45, 225]);
  assert.deepEqual(t.failsAt("sin(x) = sin(x) + 0.000001", [30]), [30]);
});

test("a side that is undefined where the other is not fails", () => {
  const t = trig("working");
  assert.deepEqual(t.failsAt("tan(x) = 1", [90]), [90]);
  assert.deepEqual(t.failsAt("1/sin(x) = 2", [0, 180]), [0, 180]);
});

test("an expression math.js cannot evaluate is an Error row", () => {
  const t = trig("working");
  const result = JSON.parse(t.$run(`JSON.stringify(testExpression(30, "frobnicate(x)", "1"))`));
  assert.deepEqual(result, { lhs: "Error", rhs: "Error", pass: false });
});

test("cosec is understood wherever it appears, in any case", () => {
  const t = trig("working");
  assert.deepEqual(t.failsAt("COSEC(x) = 1/sin(x)", [30, 60]), []);
  assert.deepEqual(t.failsAt("2 cosec(x/2) = 2/sin(x/2)", [30, 60]), []);
});

test("values are shown to eight significant figures, with infinities named", () => {
  const t = trig("working");
  assert.equal(t.formatValue(1 / 3), "0.33333333");
  assert.equal(t.formatValue(Infinity), "+∞");
  assert.equal(t.formatValue(-Infinity), "−∞");
  assert.equal(t.formatValue("Error"), "Error");
  assert.equal(t.formatAngle(30), "30°");
  assert.equal(t.formatAngle(12.5), "12.50°");
});
