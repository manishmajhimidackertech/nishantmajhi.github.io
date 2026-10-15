"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load, fakeDocument, readSource } = require("./harness");

/* BetterHome's real script with a query typed and an engine picked. */
function searchFor(rev, query, engine = "brave") {
  const document = fakeDocument({ query_string: { value: query } });
  document.querySelector = (sel) => (sel === 'input[name="company"]:checked' ? { value: engine } : null);
  const window = { location: { href: "about:home" } };
  const ctx = load("BetterHome/script.js", { rev, globals: { document, window } });
  ctx.search();
  return window.location.href;
}

test("each engine on the page gets the query in its own URL", () => {
  assert.equal(searchFor("working", "nepal weather"), "https://search.brave.com/search?q=nepal%20weather");
  assert.equal(searchFor("working", "nepal weather", "duckduckgo"), "https://duckduckgo.com/?q=nepal%20weather");
  assert.equal(searchFor("working", "nepal weather", "mojeek"), "https://www.mojeek.com/search?q=nepal%20weather");
});

test("the engines searched are exactly the radio buttons on the page", () => {
  const html = readSource("BetterHome/index.html");
  const values = [...html.matchAll(/name="company" value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(values, ["brave", "duckduckgo", "mojeek"]);
  for (const v of values) assert.notEqual(searchFor("working", "x", v), "about:home", v);
});

test("characters that mean something in a URL are encoded", () => {
  assert.equal(
    searchFor("working", "a&b=c #d?e/f+g"),
    "https://search.brave.com/search?q=a%26b%3Dc%20%23d%3Fe%2Ff%2Bg",
  );
  assert.equal(searchFor("working", "काठमाडौं"), "https://search.brave.com/search?q=" + encodeURIComponent("काठमाडौं"));
});

test("an empty query goes nowhere", () => {
  assert.equal(searchFor("working", ""), "about:home");
});

test("regression: a query of only spaces goes nowhere either", () => {
  assert.equal(searchFor("working", "   "), "about:home");
  assert.equal(searchFor("original", "   "), "https://search.brave.com/search?q=%20%20%20");
});
