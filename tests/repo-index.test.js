"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { readSource, inlineScripts, createContext, fakeDocument } = require("./harness");
const { readConfig, renderedInlineScript } = require("./site");

/* localStorage, optionally refusing to store or to read. */
function storage({ refuseSet = false, refuseGet = false } = {}) {
  const map = new Map();
  return {
    getItem(k) {
      if (refuseGet) throw new Error("SecurityError");
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      if (refuseSet) throw new Error("QuotaExceededError");
      map.set(k, String(v));
    },
    map,
  };
}

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/*
 * A visit to the index page: the rendered config, then the index script --
 * the working page loads it from assets/js, the original had it inline --
 * with a fetch that answers from `replies` in order.
 */
async function visit(rev, replies, store = storage()) {
  const document = fakeDocument();
  const list = document.getElementById("repo-list");
  const loading = document.getElementById("loading-msg");
  loading.textContent = "Loading GitHub repos…";
  const requests = [];
  const queue = [...replies];
  const fetch = async (url, init) => {
    requests.push({ url, init });
    if (!queue.length) throw new Error("unexpected request " + url);
    const r = queue.shift();
    if (r instanceof Error) throw r;
    return r;
  };
  const ctx = createContext({ document, fetch, localStorage: store });
  vm.runInContext(renderedInlineScript(rev), ctx, { filename: "index.html" });
  if (/repo-index\.js/.test(readSource("index.html", rev))) {
    vm.runInContext(readSource("assets/js/repo-index.js", rev), ctx, { filename: "repo-index.js" });
  }
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  // A sub-heading reads as { sub }, a row as its link's text.
  const groups = list.children.map((g) => ({
    label: g.children[0].textContent,
    rows: g.children
      .slice(1)
      .map((el) => (el.className === "index-sub" ? { sub: el.textContent } : el.children[1].textContent)),
  }));
  return {
    groups,
    requests,
    store,
    loading,
    repoCount: document.getElementById("repo-count").textContent,
    langCount: document.getElementById("lang-count").textContent,
  };
}

/* A handful of repositories as the API returns them, oldest-pushed last. */
const REPOS = [
  { name: "sayar", description: "Expense splitter", language: "TypeScript", fork: false, html_url: "https://github.com/x/sayar", stargazers_count: 3 },
  { name: "Lipi", description: null, language: "Java", fork: false, html_url: "https://github.com/x/Lipi" },
  { name: "ADBS", description: "Nepali calendar", language: "JavaScript", fork: false, html_url: "https://github.com/x/ADBS" },
  { name: "suGen", description: "Subtitles", language: "Go", fork: false, html_url: "https://github.com/x/suGen" },
  { name: "Blog", description: "My blog", language: "HTML", fork: false, html_url: "https://github.com/x/Blog" },
  { name: "nishantmajhi.github.io", description: null, language: "HTML", fork: false, html_url: "https://github.com/x/site" },
  { name: "someone-elses", description: "A fork", language: "C", fork: true, html_url: "https://github.com/x/fork" },
  { name: "Kiln", description: "Office files from code", language: "JavaScript", fork: false, html_url: "https://github.com/x/Kiln" },
  { name: "OfficeMetadataEditor", description: null, language: "C#", fork: false, html_url: "https://github.com/x/ome" },
  { name: "notes", description: "Plain notes", language: null, fork: false, html_url: "https://github.com/x/notes" },
];

/*
 * Filed by folder from _config.yml's repo_categories, folders alphabetically,
 * a sub-folder as a [sub-heading]; Kiln and notes are not filed, so they fall
 * back to their language, after the folders.
 */
const EXPECTED = [
  { label: "Android", rows: ["[React Native]", "Expense splitter↗"] },
  { label: "Browser Extensions", rows: ["Nepali calendar↗"] },
  { label: "Swing", rows: ["Lipi↗"] },
  { label: "Web", rows: ["[Go]", "Subtitles↗"] },
  { label: "WPF", rows: ["OfficeMetadataEditor↗"] },
  { label: "JavaScript / HTML / CSS", rows: ["Office files from code↗"] },
  { label: "Other", rows: ["Plain notes↗"] },
];

/* How the original grouped the same repositories: by language alone. */
const BY_LANGUAGE = [
  { label: "JavaScript / HTML / CSS", rows: ["Expense splitter↗", "Office files from code↗"] },
  { label: "Java", rows: ["Lipi↗"] },
  { label: "Browser Extension", rows: ["Nepali calendar↗"] },
  { label: "Go", rows: ["Subtitles↗"] },
  { label: "C# [.NET]", rows: ["OfficeMetadataEditor↗"] },
  { label: "Other", rows: ["Plain notes↗"] },
];

/* A row's text is the title and the ↗ span; the fake keeps them apart. */
function rowText(page) {
  return page.groups.map((g) => ({
    label: g.label,
    rows: g.rows.map((r) => (typeof r === "string" ? r + "↗" : `[${r.sub}]`)),
  }));
}

test("_config.yml has every setting the index reads", () => {
  const site = readConfig(readSource("_config.yml"));
  for (const key of ["github_username", "hidden_repos", "combined_label", "combine_languages", "language_labels", "repo_language_overrides", "repo_categories"]) {
    assert.ok(site[key] != null, key);
  }
  assert.ok(site.hidden_repos.includes("nishantmajhi.github.io"), "the site's own repository is hidden");
});

test("repositories are filed under their folders, then the rest by language", async () => {
  const page = await visit("working", [reply(200, REPOS)]);
  assert.deepEqual(rowText(page), EXPECTED);
  assert.equal(page.repoCount, 7);
  assert.equal(page.langCount, 7);
  assert.equal(page.loading.removed, true);
});

test("the original grouped them by language alone", async () => {
  const page = await visit("original", [reply(200, REPOS)]);
  assert.deepEqual(rowText(page), BY_LANGUAGE);
});

test("within a folder, its own projects come first, then each sub-folder alphabetically", async () => {
  const web = [
    { name: "PDF-Splice", description: "PDF Splice", language: "Vue", fork: false, html_url: "u1" },
    { name: "eRAS", description: "eRAS", language: "PHP", fork: false, html_url: "u2" },
    { name: "DSA", description: "DSA", language: "HTML", fork: false, html_url: "u3" },
    { name: "cscli", description: "cscli", language: "PHP", fork: false, html_url: "u4" },
    { name: "gtree", description: "gtree", language: "C", fork: false, html_url: "u5" },
    { name: "7Seg", description: "7Seg", language: "C", fork: false, html_url: "u6" },
  ];
  const page = await visit("working", [reply(200, web)]);
  assert.deepEqual(rowText(page), [
    { label: "C", rows: ["gtree↗", "[GTK]", "7Seg↗"] },
    { label: "Web", rows: ["[Frontend / Vanilla]", "DSA↗", "[PHP]", "eRAS↗", "cscli↗", "[Vue]", "PDF Splice↗"] },
  ]);
});

test("every folder in repo_categories is a non-empty path", () => {
  const { repo_categories } = readConfig(readSource("_config.yml"));
  for (const [repo, path] of Object.entries(repo_categories)) {
    assert.match(path, /^[^/]+(\/[^/]+)*$/, repo);
  }
});

test("the request asks for the account's repositories, most recently pushed first", async () => {
  const page = await visit("working", [reply(200, REPOS)]);
  assert.equal(
    page.requests[0].url,
    "https://api.github.com/users/nishantmajhi/repos?per_page=100&page=1&sort=pushed&direction=desc",
  );
});

test("more than a hundred repositories are fetched a page at a time", async () => {
  const many = (n, from) => Array.from({ length: n }, (_, i) => ({ ...REPOS[0], name: `r${from + i}`, description: `r${from + i}` }));
  const page = await visit("working", [reply(200, many(100, 0)), reply(200, many(30, 100))]);
  assert.equal(page.requests.length, 2);
  assert.match(page.requests[1].url, /page=2/);
  assert.equal(page.repoCount, 130);

  const exact = await visit("working", [reply(200, many(100, 0)), reply(200, [])]);
  assert.equal(exact.requests.length, 2);
  assert.equal(exact.repoCount, 100);
});

test("a refused request with nothing remembered says so, in red", async () => {
  const page = await visit("working", [reply(403, { message: "API rate limit exceeded" })]);
  assert.equal(page.loading.textContent, "Could not load GitHub repos: GitHub API responded with 403");
  assert.equal(page.loading.style.color, "#e14747");
  assert.equal(page.groups.length, 0);
});

test("regression: a refused request shows the list that loaded last time", async () => {
  for (const rev of ["working", "original"]) {
    const store = storage();
    await visit(rev, [reply(200, REPOS)], store);
    const later = await visit(rev, [reply(403, { message: "API rate limit exceeded" })], store);
    if (rev === "working") {
      assert.deepEqual(rowText(later), EXPECTED);
      assert.equal(later.repoCount, 7);
      assert.equal(later.loading.removed, true);
    } else {
      assert.equal(later.groups.length, 0, "the original remembered nothing");
      assert.match(later.loading.textContent, /Could not load GitHub repos/);
    }
  }
});

test("a network failure falls back the same way", async () => {
  const store = storage();
  await visit("working", [reply(200, REPOS)], store);
  const offline = await visit("working", [new TypeError("Failed to fetch")], store);
  assert.deepEqual(rowText(offline), EXPECTED);
});

test("a failure on the second page falls back rather than showing half a list", async () => {
  const store = storage();
  await visit("working", [reply(200, REPOS)], store);
  const many = Array.from({ length: 100 }, (_, i) => ({ ...REPOS[0], name: `r${i}`, description: `r${i}` }));
  const page = await visit("working", [reply(200, many), reply(403, {})], store);
  assert.deepEqual(rowText(page), EXPECTED);
});

test("only what the index shows is remembered", async () => {
  const store = storage();
  await visit("working", [reply(200, REPOS)], store);
  const saved = JSON.parse(store.map.get("repo-index:last"));
  assert.deepEqual(Object.keys(saved.repos[0]).sort(), ["description", "fork", "html_url", "language", "name"]);
  assert.equal(saved.repos.length, REPOS.length);
});

test("a newer list replaces the remembered one", async () => {
  const store = storage();
  await visit("working", [reply(200, REPOS)], store);
  await visit("working", [reply(200, REPOS.slice(0, 2))], store);
  const later = await visit("working", [reply(403, {})], store);
  assert.equal(later.repoCount, 2);
});

test("storage that refuses to store still shows the list", async () => {
  const page = await visit("working", [reply(200, REPOS)], storage({ refuseSet: true }));
  assert.deepEqual(rowText(page), EXPECTED);
});

test("storage that refuses to read, or holds garbage, means the error message", async () => {
  const refused = await visit("working", [reply(403, {})], storage({ refuseGet: true }));
  assert.match(refused.loading.textContent, /responded with 403/);
  const store = storage();
  store.map.set("repo-index:last", "{not json");
  const garbage = await visit("working", [reply(403, {})], store);
  assert.match(garbage.loading.textContent, /responded with 403/);
});

test("the page sets the config before it loads the index script", () => {
  const html = readSource("index.html");
  const config = html.indexOf("const REPO_LANGUAGE_OVERRIDE");
  const script = html.indexOf("<script src=\"{{ '/assets/js/repo-index.js' | relative_url }}\"></script>");
  assert.ok(config > 0 && script > config);
  assert.doesNotMatch(inlineScripts(html)[0], /function buildIndex/, "no second copy of the logic");
});
