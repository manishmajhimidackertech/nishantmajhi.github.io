/*
 * Loads the site's classic scripts into a node:vm context, so the node suite
 * tests the real files rather than copies of them.
 *
 * Each sub-site is a plain page with plain <script> tags, written for a
 * browser. Most of them also do some DOM work at the top level -- look up an
 * element, register a listener -- which would throw in node. `inert()` is a
 * stand-in for anything the browser would provide: every property is another
 * inert value and every call returns one, so `document.getElementById("x")
 * .addEventListener(...)` quietly does nothing and the script's functions
 * become callable.
 *
 * Top-level function declarations become properties of the context. Top-level
 * `const`s and `let`s do not -- they live in the context's lexical scope -- so
 * read those by evaluating an expression (`ctx.$run("MISSIONS.length")`).
 *
 * `rev: "original"` reads a file from the commit this pass started from
 * instead of the working tree. Tests whose names start with "regression:" run
 * a scenario against both and assert the original gets it wrong, so a check
 * that stops exercising its defect fails here rather than passing quietly.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");

/*
 * The last commit on main before this pass. Looked up by subject, so that a
 * rewritten history fails loudly instead of quietly testing the wrong bytes.
 */
const BASELINE_SUBJECT = "used flex instead of grid";

let cachedBaseline = null;
function baselineSha() {
  if (cachedBaseline) return cachedBaseline;
  const out = execFileSync(
    "git",
    ["log", "--all", "--format=%H", "--grep=^" + BASELINE_SUBJECT + "$", "--max-count=1"],
    { cwd: ROOT, encoding: "utf8" },
  ).trim();
  if (!out) throw new Error(`no commit with the subject "${BASELINE_SUBJECT}"`);
  cachedBaseline = out;
  return out;
}

function readSource(file, rev = "working") {
  if (rev === "working") return fs.readFileSync(path.join(ROOT, file), "utf8");
  if (rev === "original") {
    return execFileSync("git", ["show", `${baselineSha()}:${file}`], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  }
  throw new Error(`unknown rev ${rev}`);
}

/* A value that absorbs any property access, assignment or call. */
function inert() {
  const store = new Map();
  return new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === Symbol.toPrimitive) return () => "";
      if (prop === Symbol.iterator) return function* () {};
      if (prop === "then") return undefined; // never look like a promise
      if (prop === "length") return 0;
      if (!store.has(prop)) store.set(prop, inert());
      return store.get(prop);
    },
    set(_target, prop, value) {
      store.set(prop, value);
      return true;
    },
    apply() {
      return inert();
    },
    construct() {
      return inert();
    },
  });
}

/*
 * A document whose elements spring into existence when asked for by id, and
 * remember what is written to them. Enough for a script that reads values out
 * of inputs and writes text into cells; not a DOM. `ids` presets values:
 * `fakeDocument({ loanAmt: { value: "500000" } })`.
 */
class FakeElement {
  constructor(tag = "div", props = {}) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.value = "";
    this.textContent = "";
    this.innerHTML = "";
    this.className = "";
    this.disabled = false;
    this.checked = false;
    this.hidden = false;
    this.style = {
      setProperty(name, value) {
        this[name] = String(value);
      },
    };
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    const classes = new Set();
    this.classList = {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      toggle: (c, on = !classes.has(c)) => (on ? classes.add(c) : classes.delete(c), on),
      contains: (c) => classes.has(c),
    };
    Object.assign(this, props);
  }
  /* Setting markup replaces the element's contents, as it does on a page. */
  get innerHTML() {
    return this._html;
  }
  set innerHTML(html) {
    this._html = String(html);
    this.children = [];
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return name in this.attributes ? this.attributes[name] : null;
  }
  removeAttribute(name) {
    delete this.attributes[name];
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  insertBefore(child) {
    this.children.push(child);
    return child;
  }
  remove() {
    this.removed = true;
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
  }
  dispatch(type, event = {}) {
    const ev = { type, target: this, preventDefault() {}, ...event };
    for (const fn of this.listeners[type] || []) fn.call(this, ev);
  }
  click() {
    this.dispatch("click");
  }
  focus() {}
  select() {}
  querySelector() {
    return null;
  }
  querySelectorAll() {
    return [];
  }
}

function fakeDocument(ids = {}) {
  const byId = new Map();
  const doc = new FakeElement("#document");
  doc.documentElement = new FakeElement("html");
  doc.body = new FakeElement("body");
  doc.getElementById = (id) => {
    if (!byId.has(id)) byId.set(id, new FakeElement("div", { id }));
    return byId.get(id);
  };
  doc.createElement = (tag) => new FakeElement(tag);
  doc.createDocumentFragment = () => new FakeElement("#fragment");
  for (const [id, props] of Object.entries(ids)) Object.assign(doc.getElementById(id), props);
  return doc;
}

/*
 * A fresh context. `globals` are copied onto it; `document` and `window`
 * default to inert values, and `window` can be pointed at the context itself
 * with `window: "self"` for scripts that publish through it.
 */
function createContext(globals = {}) {
  const ctx = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    document: inert(),
    window: inert(),
    localStorage: inert(),
    requestAnimationFrame: () => 0,
    ...globals,
  };
  if (ctx.window === "self") ctx.window = ctx;
  vm.createContext(ctx);
  // Not `run`: TrigEqK's page declares a global run(), which would replace it.
  ctx.$run = (code) => vm.runInContext(code, ctx);
  return ctx;
}

/* Run each file, in order, in one context, as the page's <script> tags would. */
function load(files, { rev = "working", globals = {} } = {}) {
  const ctx = createContext(globals);
  for (const file of [].concat(files)) {
    vm.runInContext(readSource(file, rev), ctx, { filename: `${rev}:${file}` });
  }
  return ctx;
}

/* The bodies of every inline <script> (one with no src) in an HTML file. */
function inlineScripts(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

/*
 * The source of `function name(...) { ... }` within `src`, found by matching
 * braces from the declaration. Used to lift a pure function out of an original
 * script whose top level cannot run without a page around it. Template
 * literals in these files only ever contain balanced `${...}`, which is all
 * brace counting needs.
 */
function extractFunction(src, name) {
  const start = src.search(new RegExp(`function\\s+${name}\\s*\\(`));
  if (start < 0) throw new Error(`no function ${name} in source`);
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces after function ${name}`);
}

module.exports = {
  ROOT,
  baselineSha,
  readSource,
  inert,
  FakeElement,
  fakeDocument,
  createContext,
  load,
  inlineScripts,
  extractFunction,
};
