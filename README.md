# nishantmajhi.github.io

The GitHub Pages site at <https://nishantmajhi.github.io>: a page listing
Manish Majhi's projects, and twelve small web projects served from folders of
this same repository.

## What is here

The home page (`index.html`) has two lists:

- **Featured entries** — a card for each project in `_data/projects.yml`,
  linking to its folder here. Jekyll builds these when the site is built.
- **Index** — every public repository on the `nishantmajhi` GitHub account,
  grouped by language. The browser fetches this from the GitHub API each time
  the page opens (`assets/js/repo-index.js`).

The twelve projects, each a self-contained static page in its own folder:

| Folder | What it is |
| --- | --- |
| `recursion-in-multiplication/` | Long multiplication done with only an adder and a lookup table, step by step |
| `ConicSections/` | An illustrated walkthrough of parabolas, ellipses and hyperbolas |
| `termlink-trials/` | A puzzle game that teaches ANSI/VT100 escape sequences (it has its own README) |
| `TrigEqK/` | Checks a trigonometric equation at 34 angles |
| `SimLoan/` | Loan amortisation: EMI from tenure, or tenure from EMI |
| `Taboo/` | Estimates π with polygons and with random darts |
| `nBase/` | Arithmetic between numbers in bases 2, 5, 8, 10 and 16 |
| `BankVsRelative/` | Paying a loan off in full versus lending part of the payment to a relative |
| `NameCodes/` | Turns a name into a short consonant code |
| `Anticipator/` | GPA and grade for the grade IX/X subjects |
| `TimePass/` | A mental-arithmetic quiz |
| `BetterHome/` | A new-tab search page |

`Resume/Manish_Majhi-Resume.pdf` is what the header's "Download Resume" link
serves.

## How the site is put together

| Path | Role |
| --- | --- |
| `_config.yml` | Site title and description, the GitHub username, and how the Index labels and filters repositories |
| `_data/projects.yml` | The Featured cards, in order |
| `_layouts/default.html` | The page shell: navigation, fonts, footer |
| `index.html` | The home page. Its Liquid writes the Featured cards and hands the Index settings from `_config.yml` to the script |
| `assets/js/repo-index.js` | Fetches and draws the Index |
| `assets/css/style.css`, `assets/thumbs/` | The home page's stylesheet and the Featured thumbnails |
| `THIRD_PARTY.md` | The libraries copied in or loaded from CDNs, with versions and licences |
| `tests/` | The test suites (not published) |

Jekyll runs Liquid in the files with front matter, `index.html` and the
layout. GitHub Pages' default plugins also turn every Markdown file into a
page, so `termlink-trials/WIKI.md` is published as `WIKI.html` as well.
Everything else, the project folders included, is copied to the site as it is.

### The Index

`repo-index.js` asks the GitHub API for the account's repositories, 100 at a
time and most recently pushed first. It leaves out forks and anything in
`hidden_repos`, and groups the rest under a heading for each language:

- languages in `combine_languages` share the `combined_label` heading;
- `language_labels` renames the others (`C#` becomes `C# [.NET]`);
- `repo_language_overrides` gives a named repository its own heading
  (`ADBS` is listed as a Browser Extension);
- a repository with no language goes under "Other".

The row text is the repository's description, or its name if it has none.
The "Repos" and "Languages" counts at the top of the page count what the
Index shows.

GitHub allows 60 unauthenticated API requests an hour from each IP address,
shared by everyone behind that address. The script keeps the last list that
loaded in the browser's `localStorage`. When a request is refused, or the
network is down, it shows that list instead. A visitor who has never loaded
it sees "Could not load GitHub repos" and the reason.

`hidden_repos` only hides repositories from this page. The API still lists
them for anyone who asks.

The Featured projects are folders of this repository, not repositories of
their own. That is why none of them also appears in the Index: this
repository is in `hidden_repos`. A project given its own repository later
would appear in both lists.

## Adding a project

1. Put the project in a folder at the top of the repository, with an
   `index.html`. It is served at `/<folder>/`.
2. Add a thumbnail to `assets/thumbs/`.
3. Add an entry to `_data/projects.yml`. Cards appear in the order of the
   file and are numbered from it.

   ```yaml
   - title: "My New Project"
     folder: "my-new-project" # the folder name, exactly
     thumb: "my-new-project.png" # the file in assets/thumbs/
     byline: "html · js"
     desc: "One sentence on what it does."
   ```

The existing entries also have an `index_title`. Nothing reads it.

If the project needs a library, prefer copying it in and recording it in
`THIRD_PARTY.md`.

## Running it locally

The `github-pages` gem pins the same Jekyll and plugins GitHub's builders
use, so a local build matches the published one. It currently needs
**Ruby 3.3.4**; check [GitHub's dependency list](https://pages.github.com/versions/)
before installing, because the required version moves. A newer Ruby fails to
install or run it.

```sh
gem install bundler
bundle install
bundle exec jekyll serve      # http://localhost:4000
```

If you have run `bundle install` here under a different Ruby, delete
`Gemfile.lock` first so Bundler resolves against the one you are using.

On Windows, install "Ruby+Devkit 3.3.4" from the
[RubyInstaller archives](https://rubyinstaller.org/downloads/archives/) and
let it run `ridk install`; several gems compile native extensions. Three
errors come up, in this order:

- **`cannot load such file -- csv`, or `undefined method 'tainted?'`** —
  the gems were installed under a Ruby newer than 3.3. Install 3.3.4, delete
  `Gemfile.lock` and run `bundle install` again. Patching the Gemfile does
  not help.
- **`No such file or directory - make`** — the DevKit toolchain is
  missing. Run `ridk install` and choose the MSYS2 and MINGW toolchain. If
  `ridk` is not recognised, reinstall from the Ruby+Devkit build.
- **`incompatible pointer type` while compiling** — MSYS2's GCC 14 treats
  old C in `http_parser.rb`, `racc`, `bigdecimal` and `prism` as an error.
  Relax it per gem, through Bundler; setting `CFLAGS` is not reliable:

  ```sh
  bundle config set build.http_parser.rb --with-cflags="-Wno-incompatible-pointer-types"
  bundle config set build.racc --with-cflags="-Wno-incompatible-pointer-types"
  bundle config set build.bigdecimal --with-cflags="-Wno-incompatible-pointer-types"
  bundle config set build.prism --with-cflags="-Wno-incompatible-pointer-types"
  ```

  These are kept in `.bundle/config`, which is not committed.

The project folders need no Jekyll at all. Open their `index.html` from any
static server.

## Tests

Node 22 or later. Nothing to install.

```sh
npm test                  # 149 tests of the pages' scripts, in node
npm run test:browser      # 44 checks of the real pages in headless Chrome
npm run test:original     # the same 44 against the code before the 2026-10-01 fixes
```

The node suite loads each page's own script files into a `node:vm` context
with a stand-in document (`tests/harness.js`), and drives them as the page
would. For the home page's Index it reads the real `_config.yml` and fills
in `index.html`'s Liquid the way Jekyll does (`tests/site.js`). Tests named
`regression:` also run their scenario against the code before the fixes,
taken from git, and require it to get the answer wrong. They need the
repository's history, and fail in a shallow clone.

The browser suite needs Chrome or Edge, and prints SKIP without one. It
serves the folder over loopback and answers every outside request itself, so
it runs offline. `CHROME=<path>` picks the browser.

`tests/`, `package.json` and `review.md` are excluded from the published site
in `_config.yml`.

## Publishing

Push to `main`. GitHub Pages builds the site with Jekyll.

## Licence

Free for personal, non-commercial use. You may use, study and modify this
software for yourself, but you may not use it commercially, and you may not
share or publish it, in its original form or modified. See [LICENSE](LICENSE)
for the full terms.

The third-party code keeps its own licences, listed in `THIRD_PARTY.md`.
