# Review — nishantmajhi.github.io

First reviewed 2026-09-04. Remediated 2026-10-01 on `cleanup/2026-10-01`,
not pushed. This file is now the record of that pass. The first review's
checklist is at the bottom, marked off.

## Corrections to the first review

The first review read `_config.yml`, `_data/projects.yml`, the layout and
`index.html`, and called the twelve project folders "standalone sites". It
did not read their code. That is where nearly everything was: twenty-two
defects in ten of the twelve folders, set out below, all reproduced against
the original code by tests that run it from git. Only Taboo and
ConicSections came through clean.

It was also wrong, or out of date, on six things it did read:

1. **"Silent failure. Confirm there is a visible message when the request
   fails."** There was one. A failed request already replaced "Loading GitHub
   repos…" with "Could not load GitHub repos: GitHub API responded with 403",
   in red. What was missing was a fallback, and that is what was added.
2. **"One data file as the single source of truth for featured projects,
   driving both the homepage cards and the index rows."** That is what the
   old README said, and it was not true. `_data/projects.yml` drives the
   Featured cards only. The Index rows come from the GitHub API. Nothing
   reads `index_title`. The page's own comments said the Featured projects
   were "deliberately excluded" from the Index, but no code excludes them.
   They stay out because they are folders of this repository, which is in
   `hidden_repos`.
3. **"The twelve project subdirectories are served as-is and are not
   processed by Jekyll."** Mostly true, but not for Markdown. GitHub Pages
   runs its default plugins (`jekyll-optional-front-matter`,
   `jekyll-readme-index` and others), which publish every `.md` file as a
   page. The author's own `_site` build has `termlink-trials/WIKI.html` and a
   `Resume/index.html` made from `Resume/README.md`. This matters for this
   pass: a committed `review.md` would have been published.
4. **"The repository is 26 MB, most of it vendored third-party minified
   assets."** The 26 MB is the folder on disk: 11.05 MB of tracked files,
   9.1 MB of `.git` and 6.4 MB of a local `_site` build. Of the tracked
   11.05 MB, the vendored libraries are 2.3 MB. The largest single file was
   4.0 MB: a zip of this repository's own working tree, committed by
   accident.
5. **"Nothing to remove."** There was that zip, published at
   `/nishantmajhi.github.io.zip`, and a setup note published at
   `/Resume/README.md`. Both are removed.
6. **The fix it led with, "move the GitHub API fetch to build time", is not
   available.** GitHub Pages runs no custom plugins, so a build-time fetch
   means an Actions workflow that builds and deploys the site. That changes
   how the site is published, and is the author's decision. The other half
   of the finding — a fallback — was pure logic and is done.

## What was fixed

Every fix has a `regression:` test that runs the same scenario against the
code from before this pass, taken from git, and requires it to get the
answer wrong. The 18 browser checks named `regression:` fail against the
original and pass now.

**Anticipator** (grade calculator)
- The GPA divided seven subjects' grade points by 4. Straight 4.0s showed
  7.00, and straight C+ showed 3.50 and an A. Every GPA ever shown was 7/4
  of the right one.

**SimLoan** (loan simulator)
- "Find Tenure" (the default mode) charged a full EMI for the last,
  part month. On the page's own default loan it overstated interest by
  10,000: 1.60 L shown, where the real figure is 1.50 L. The schedule's
  principal column summed to more than the loan.
- An EMI that fits a whole number of months exactly was given an extra
  month of zero.
- The theme button redrew the chart for the hidden tenure dial's loan, not
  the loan on screen.

**nBase** (base calculator)
- `parseInt` read the valid prefix of anything. (19)₂ was 1, `12abc` was
  12, `0x1F` and `-5` were accepted. The inputs' own pattern attributes were
  never enforced, and the half-read text went into `innerHTML`.
- Arithmetic was in doubles and the inputs take 24 digits, so results past
  2⁵³ were wrong. Now BigInt.

**TimePass** (quiz)
- Divisions with remainders expected the truncated answer: "3 / 5" wanted
  0. Divisions now only use divisors of the dividend, keeping the operands
  between 1 and 10.
- `parseInt` accepted 3.5 as 3.
- Enter pressed twice on a right answer scored twice.

**TrigEqK** (identity checker)
- tan(2x) = 2tan x/(1 − tan²x) "failed" at 45°, 135°, 225° and 315°. Both
  sides are undefined there, but come out as large finite numbers in floating
  point, so the "both undefined" branch never fired.
- An absolute tolerance failed true identities at random angles beside an
  asymptote (sec²x = 1 + tan²x at 89.99°).
- Two complex or unit results passed as equal whatever their values.
- The reciprocal rewrite turned `asec(2)` into `a(1/cos(2))`. math.js has
  `sec`, `csc` and `cot` natively; only `cosec` is renamed now.

**BankVsRelative** (lending simulator), **the seventh UI exception**
- "Find break-even lending amount" could never find one: the gap between
  the two scenarios is proportional to the amount lent, so no amount breaks
  even unless every amount does. It said "No break-even point in range" for
  every input. With the author's agreement it now finds the break-even
  **rate**, ((1 + i)^(N−1) − 1) × 12/N, sets the slider to it, and says so.
  The button label and the verdict text are new copy.

**NameCodes**
- Codes typed into "Already assigned codes" went into `innerHTML`.

**recursion-in-multiplication**
- Run did nothing when the multiplier was 0: the plan has no steps, and Run
  looped while steps remained.

**termlink-trials** (escape-sequence game)
- Empty CSI parameters were dropped instead of defaulted. `\x1b[;20H` went
  to row 9, column 1, and `\x1b[1;;4m` stayed bold.
- `\x1b[38;5m` with no index set the colour to `#NaNNaNNaN`, which the
  grader's classifier calls red. It passed mission 01 without a red code.
- Typed text went into the breakdown and colour-safe labels as HTML.
- CONTINUE always reopened calibration and saved that over the player's
  place.
- Two tabs of the same game undid each other's progress (item 57's lesson).

**BetterHome**
- A query of only spaces was searched for.

**The home page**
- The Index now remembers the last list that loaded and shows it when the
  GitHub API refuses (60 unauthenticated requests an hour per IP) or the
  network is down. Visitors with nothing remembered see the same message as
  before.

**Tidy**
- `nishantmajhi.github.io.zip` (4.0 MB) and `Resume/README.md` removed;
  both were being published.
- `THIRD_PARTY.md` records each copied and CDN-loaded library with its
  version and licence.
- `_config.yml` comments say that `hidden_repos` only hides repos from
  display. Its `exclude` list keeps `tests/`, `package.json` and this file
  off the site.
- README rewritten.

## Structure

Pure logic moved out of five pages so it could be tested on its own:
`BankVsRelative/model.js`, `NameCodes/codes.js`,
`termlink-trials/engine.js`, and the home page's `assets/js/repo-index.js`.
Each move is pinned by a test that runs the moved code and the original from
git on the same inputs and requires the same output. The other pages' logic
was already in a separate script, or is tested as it stands.

## Tests

```sh
npm test                 # 149 node tests, under ten seconds
npm run test:browser     # 44 checks in headless Chrome, about 35 seconds
npm run test:original    # the same 44 against the original: 18 fail, 26 pass
```

Nothing to install; Node 22+. The node suite loads the real script files
into `node:vm` with a fake document (`tests/harness.js`). For the home page
it reads `_config.yml` and fills in `index.html`'s Liquid (`tests/site.js`).
Those six rendered lines were compared with the author's own `_site` build
and are identical. The browser suite answers every off-site request itself:
Taboo's Chart.js CDN request gets the identical copy SimLoan vendors, and the
GitHub API gets a fixture. It runs offline.

## Deliberately not done

- **Build-time fetch for the Index.** Needs an Actions deploy. See
  correction 6.
- **A LICENSE.** The review asked for one. Which licence is the author's
  call.
- **SimLoan's icons.** `tabler-icons.min.css` points at `SimLoan/fonts/`,
  which was never copied in, so every `ti` icon on that page draws nothing.
  Fixing it means adding font files or a CDN link and changes how the page
  looks, so it is left for the author.
- **Subresource integrity, pinning MathJax.** ConicSections loads "MathJax
  3" unpinned from jsDelivr. Recorded in `THIRD_PARTY.md`.
- **BankVsRelative's modelling assumption.** The relative pays interest for
  all N months while the bank is short for N − 1, so lending held one month
  always wins. The page states this assumption, and it is a fair reading of
  cash in hand at the start of month 1.
- **Anticipator's weighting.** A subject's grade point is the plain mean of
  theory and practical. If the board weights them by credit hours, this is
  wrong. That needs someone who knows the current grade IX/X rules, not a
  guess.
- **Copy that overstates.** Taboo says "3 decimals of π correct" whenever
  the error is under 0.001, which is not the same thing. SimLoan says "EMI
  must be above X" also when the EMI is above X but the loan would take over
  100 years. TrigEqK shows a complex result as "undefined". All of this is
  wording, not logic.
- **`index_title` in `_data/projects.yml`.** Unused. Left in the data,
  left out of the README's template.
- **The zip is still in history.** Rewriting history is the author's
  decision. Nothing in it is secret: it is the same site, already public.
- **termlink-trials' README** lists `Wiki.md`; the file is `WIKI.md`.
  Harmless; noted.
- **ConicSections** has no tests beyond loading without an exception. It is
  drawing code. The spot-check of its formulas (ellipse foci at √(a² − b²),
  hyperbola at √(a² + b²), parabola directrix x = −p) found nothing.

## Notes for whoever is next

- The sub-sites carry a lot of `innerHTML` built from strings. Everything
  that can carry typed text has been checked. The rest builds from numbers
  or fixed copy.
- `tests/harness.js`'s `ctx.$run` is not called `run` because TrigEqK
  declares a global `run()`, which silently replaced it.
- math.js rejects a scope object made in another realm ("expected Map or
  Object"). Build scopes inside the vm context, as `tests/trigeqk.test.js`
  does.
- The baseline for `regression:` tests is found by the subject "used flex
  instead of grid". A rebase that rewrites it breaks them loudly, on
  purpose.

## The first review's checklist

- [x] **P2** Move the GitHub API fetch to build time, or add a visible
      failure state and a cached fallback. *The failure state already
      existed; the fallback is added. Build time is not possible on Pages
      without an Actions deploy.*
- [x] **P3** Add a `THIRD_PARTY.md` recording each vendored library's
      version and licence.
- [ ] **P3** Add a `LICENSE`. *Left for the author.* Comment that
      `hidden_repos` is display filtering only. *Done.*

## Licence, 2026-10-02

The author chose one licence for all of their projects: free for personal,
non-commercial use, modifiable for the user's own use, and not to be
distributed, original or modified. No standard licence says that, so `LICENSE`
is a short custom text, the same in every project apart from the year and what
it excludes. The README's licence section says the same, and `package.json`
declares `SEE LICENSE IN LICENSE`, npm's form for a licence with no SPDX
identifier. Anything above that calls the licence an open question, or calls
the project MIT, is superseded.

## CI, 2026-10-02

`.github/workflows/ci.yml` runs the node checks and the browser suite as two
jobs on `ubuntu-latest`. Neither needs Ruby or Jekyll, and it does not touch
how Pages builds the site. Nothing has been pushed, so it has not run on
GitHub yet. Every job was run before committing, from a fresh clone of this
branch, the way a runner would run it: Linux jobs in a throwaway Ubuntu 24.04
(the image `ubuntu-latest` uses) with the same tool versions. 149 and 44.

The node job fetches full history, which the regression tests read (they fail
without it, checked). The browser job fails if the runner prints `SKIP`, which
it does when it finds no Chrome; otherwise a missing browser would read as a
pass.
