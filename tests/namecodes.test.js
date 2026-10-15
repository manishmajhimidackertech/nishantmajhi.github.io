"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { readSource, inlineScripts, createContext, fakeDocument } = require("./harness");

/*
 * NameCodes' scripts, in the order the page runs them, on a fake page. The
 * working page loads codes.js and then its inline script; the original had
 * everything inline.
 */
function namecodes(rev) {
  const html = readSource("NameCodes/index.html", rev);
  const document = fakeDocument();
  const ctx = createContext({ document });
  if (/<script src="codes\.js"><\/script>/.test(html)) {
    vm.runInContext(readSource("NameCodes/codes.js", rev), ctx, { filename: "codes.js" });
  }
  for (const script of inlineScripts(html)) vm.runInContext(script, ctx, { filename: "inline" });
  const register = (text) => {
    document.getElementById("dirInput").value = text;
    document.getElementById("dirAdd").click();
  };
  const chips = () => document.getElementById("chips").children;
  return { ctx, document, register, chips };
}

const code = (name) => {
  const { ctx } = namecodes("working");
  const { primary, secondary } = ctx.buildCandidates(name);
  return [primary, secondary];
};

test("the first letter is kept, vowel or consonant", () => {
  assert.equal(code("Anita")[0], "ANTA");
  assert.equal(code("Ram")[0], "RAM", "R anchors it, and the a comes back as its only vowel");
  assert.equal(code("Ishaan")[0].charAt(0), "I");
});

test("every consonant is kept and internal vowels are dropped", () => {
  assert.deepEqual(code("Govinda"), ["GVND", "GVNDA"]);
  // Prakash ends in a consonant, so the safeguard gives back its last vowel.
  assert.deepEqual(code("Prakash"), ["PRKA", "PRKAS"]);
});

test("a final vowel is kept", () => {
  assert.equal(code("Sita")[0], "STA");
});

test("paired letters count as one sound", () => {
  // bh, sh, kh, th, dh, gh, ph, jh, ch, chh, ksh, gy, ny
  assert.equal(code("Bhola")[0], "BLA");
  assert.equal(code("Shyam")[0].charAt(0), "S");
  assert.equal(code("Lakshmi")[0], "LXMI");
  assert.equal(code("Chhaya")[0].charAt(0), "C");
  const { ctx } = namecodes("working");
  const units = ctx.segmentName("Chhetri").map((u) => u.raw);
  assert.deepEqual([...units], ["chh", "e", "t", "r", "i"]);
});

test("a name with no vowel left gets its last dropped vowel back", () => {
  // b-i-m: the i is internal and dropped, which would leave no vowel at all.
  assert.deepEqual(code("Bhim"), ["BIM", null]);
});

test("codes are capped at four letters, with the full code offered as the alternate", () => {
  const [primary, secondary] = code("Krishnamurthy");
  assert.equal(primary.length, 4);
  assert.ok(secondary.startsWith(primary) && secondary.length > 4);
});

test("a short code's alternate restores its first dropped vowel", () => {
  assert.deepEqual(code("Sita"), ["STA", "SITA"]);
});

test("anything that is not a letter is ignored", () => {
  assert.deepEqual(code("  Go-vin da 2 "), code("Govinda"));
  assert.deepEqual(code(""), ["", null]);
});

test("a code already registered is shown as taken", () => {
  const page = namecodes("working");
  page.register("gvnd");
  page.document.getElementById("firstName").value = "Govinda";
  page.ctx.compute();
  const out = page.document.getElementById("output").innerHTML;
  assert.match(out, /<div class="code">GVND<\/div>[\s\S]*Already assigned/);
  assert.match(out, /<div class="code">GVNDA<\/div>[\s\S]*Use this code/);
});

test("several codes can be registered at once, separated by commas or spaces", () => {
  const page = namecodes("working");
  page.register("gvnd, prks  sta");
  assert.equal(page.chips().length, 3);
});

test("regression: a registered code is shown as text, not as markup", () => {
  for (const rev of ["working", "original"]) {
    const page = namecodes(rev);
    page.register("<img src=x onerror=alert(1)>");
    const chip = page.chips()[0];
    if (rev === "working") {
      assert.doesNotMatch(chip.innerHTML, /<IMG/, "nothing typed reaches innerHTML");
      assert.equal(chip.children[0].textContent, "<IMG");
    } else {
      assert.match(chip.innerHTML, /<span><IMG/, "the original wrote the code into innerHTML");
    }
  }
});

test("the page loads codes.js before its own script, and keeps no second copy", () => {
  const html = readSource("NameCodes/index.html");
  const at = html.indexOf('<script src="codes.js"></script>');
  assert.ok(at > 0);
  const [inline] = inlineScripts(html);
  assert.ok(html.indexOf(inline) > at);
  assert.doesNotMatch(inline, /function (segmentName|decideKeep|applySafeguard|codeFrom|buildCandidates)\(/);
});

test("the rules are the original page's rules, moved and unchanged", () => {
  const working = namecodes("working").ctx;
  const original = namecodes("original").ctx;
  const names = ["Govinda", "Anita", "Bhim", "Lakshmi", "Krishnamurthy", "Chhaya", "Shyam", "Gyanendra",
    "Nyima", "Phurba", "Dharmendra", "Jhalak", "Ishaan", "Oo", "A", "Bh", "xyz", "Aeiou", "Prithvi Narayan"];
  for (const name of names) {
    assert.equal(JSON.stringify(working.buildCandidates(name)), JSON.stringify(original.buildCandidates(name)), name);
  }
});
