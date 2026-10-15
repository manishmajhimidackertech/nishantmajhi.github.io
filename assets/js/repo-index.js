/*
 * The Index section: every public repository on the GitHub account, grouped
 * the way the projects are filed on disk, fetched from the GitHub API when the
 * page loads.
 *
 * index.html defines the settings first, from _config.yml through Liquid:
 * USERNAME, HIDDEN_REPOS, COMBINED_LABEL, COMBINE_THESE, LANGUAGE_LABEL,
 * REPO_LANGUAGE_OVERRIDE and REPO_CATEGORY. This file is served as-is; Jekyll
 * does not process it.
 *
 * REPO_CATEGORY maps a repository to its folder path, "Web/Frontend/Vanilla":
 * the first folder is the group's heading, the rest a sub-heading inside it.
 * A repository not in it is grouped by language instead, after the folders.
 *
 * The featured projects above the Index are folders in this repository, which
 * hidden_repos leaves out, so none of them is listed twice.
 */

// The last list that loaded, for when the API will not answer.
const REPO_CACHE_KEY = "repo-index:last";

function labelFor(repo) {
  if (REPO_LANGUAGE_OVERRIDE[repo.name]) return REPO_LANGUAGE_OVERRIDE[repo.name];
  const lang = repo.language;
  if (!lang) return "Other";
  if (COMBINE_THESE.has(lang)) return COMBINED_LABEL;
  return LANGUAGE_LABEL[lang] || lang;
}

async function fetchAllRepos() {
  let repos = [];
  let page = 1;
  while (true) {
    const res = await fetch(
      `https://api.github.com/users/${USERNAME}/repos?per_page=100&page=${page}&sort=pushed&direction=desc`,
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (!res.ok) throw new Error(`GitHub API responded with ${res.status}`);
    const batch = await res.json();
    if (!batch.length) break;
    repos = repos.concat(batch);
    if (batch.length < 100) break;
    page++;
  }
  return repos;
}

/*
 * Keep the last list that loaded, so that a visitor the API turns away -- it
 * allows 60 unauthenticated requests an hour per IP address, shared by
 * everyone behind the same one -- still sees the Index. Only the fields the
 * Index uses are kept. Storage that is full or switched off just means no
 * fallback.
 */
function rememberRepos(repos) {
  try {
    const slim = repos.map(({ name, description, html_url, language, fork }) => ({
      name,
      description,
      html_url,
      language,
      fork,
    }));
    localStorage.setItem(REPO_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), repos: slim }));
  } catch (e) {
    /* no fallback this time */
  }
}

function recalledRepos() {
  try {
    const saved = JSON.parse(localStorage.getItem(REPO_CACHE_KEY));
    return saved && Array.isArray(saved.repos) ? saved.repos : null;
  } catch (e) {
    return null;
  }
}

/*
 * Where a repository goes: its folder from REPO_CATEGORY, split into the
 * heading and the sub-heading under it, or else its language label.
 */
function placeFor(repo) {
  const path = REPO_CATEGORY[repo.name];
  if (path) {
    const [heading, ...rest] = path.split("/");
    return { heading, sub: rest.join(" / "), filed: true };
  }
  return { heading: labelFor(repo), sub: "", filed: false };
}

const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" });

function buildIndex(repos) {
  const list = document.getElementById("repo-list");
  const loadingMsg = document.getElementById("loading-msg");

  // heading -> { filed, subs: Map(sub-heading -> projects) }, the subs in API order
  const sections = new Map();
  for (const repo of repos) {
    if (repo.fork) continue;
    if (HIDDEN_REPOS.has(repo.name)) continue;
    const { heading, sub, filed } = placeFor(repo);
    if (!sections.has(heading)) sections.set(heading, { filed, subs: new Map() });
    const subs = sections.get(heading).subs;
    if (!subs.has(sub)) subs.set(sub, []);
    subs.get(sub).push({
      title: repo.description || repo.name,
      href: repo.html_url,
      external: true,
    });
  }

  // Folders first, alphabetically as a file manager lists them; then the
  // language groups, in the order the API first named them.
  const filed = [...sections.keys()].filter((h) => sections.get(h).filed).sort(byName);
  const unfiled = [...sections.keys()].filter((h) => !sections.get(h).filed);
  const order = [...filed, ...unfiled];

  // repo count stat: total repos listed in the index below
  let repoCount = 0;
  for (const { subs } of sections.values()) for (const projects of subs.values()) repoCount += projects.length;
  const repoCountEl = document.getElementById("repo-count");
  if (repoCountEl) repoCountEl.textContent = repoCount;

  // category count stat: number of headings
  const langCountEl = document.getElementById("lang-count");
  if (langCountEl) langCountEl.textContent = sections.size;

  for (const heading of order) {
    const group = document.createElement("div");
    group.className = "lang-group";

    const h4 = document.createElement("h4");
    h4.textContent = heading;
    group.appendChild(h4);

    // Projects filed directly under the heading first, then each sub-folder.
    const subs = sections.get(heading).subs;
    const subOrder = [...subs.keys()].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : byName(a, b)));

    let n = 0;
    for (const sub of subOrder) {
      if (sub) {
        const label = document.createElement("div");
        label.className = "index-sub";
        label.textContent = sub;
        group.appendChild(label);
      }

      for (const proj of subs.get(sub)) {
        const row = document.createElement("div");
        row.className = "index-row";

        const idx = document.createElement("span");
        idx.className = "idx";
        idx.textContent = ++n;
        row.appendChild(idx);

        const a = document.createElement("a");
        a.href = proj.href;
        if (proj.external) {
          a.target = "_blank";
          a.rel = "noopener noreferrer";
        }
        a.textContent = proj.title;
        if (proj.external) {
          const ext = document.createElement("span");
          ext.className = "ext";
          ext.textContent = "↗";
          a.appendChild(ext);
        }
        row.appendChild(a);

        group.appendChild(row);
      }
    }

    list.insertBefore(group, loadingMsg);
  }

  loadingMsg.remove();
}

function loadIndex() {
  return fetchAllRepos()
    .then((repos) => {
      rememberRepos(repos);
      buildIndex(repos);
    })
    .catch((err) => {
      const remembered = recalledRepos();
      if (remembered) {
        buildIndex(remembered);
        return;
      }
      const msg = document.getElementById("loading-msg");
      msg.textContent = `Could not load GitHub repos: ${err.message}`;
      msg.style.color = "#e14747";
    });
}

loadIndex();
