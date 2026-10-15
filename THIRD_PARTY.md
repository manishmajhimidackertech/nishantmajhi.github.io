# Third-party code

Code in this repository that was not written for it, and code the pages load
from elsewhere. Everything below is under a permissive licence that allows it
to be served from here; the licence goes with the copy.

## Copied into the repository

| File | What it is | Version | Licence |
| --- | --- | --- | --- |
| `SimLoan/chart.umd.min.js` | [Chart.js](https://www.chartjs.org), the UMD build, as served by jsDelivr | 4.4.1 | MIT (its header says so) |
| `SimLoan/tabler-icons.min.css` | [Tabler Icons](https://tabler.io/icons) webfont stylesheet | 3.19.0 | MIT |
| `TrigEqK/math.min.js` | [math.js](https://mathjs.org) | 12.4.2 | Apache-2.0 |

Notes:

- `tabler-icons.min.css` points at font files in `SimLoan/fonts/`, which
  were never copied in. The stylesheet loads, but its icons have no font to
  draw from.
- `math.min.js` has been reformatted since it was downloaded and has lost
  its licence header. The version comes from the string the library reports
  as `math.version`.

## Loaded from a CDN when the page opens

| Page | What | From | Licence |
| --- | --- | --- | --- |
| `Taboo/` | Chart.js 4.4.1 | cdnjs.cloudflare.com | MIT |
| `ConicSections/` | MathJax 3 (whatever 3.x jsDelivr serves) | cdn.jsdelivr.net | Apache-2.0 |
| most pages | Web fonts | fonts.googleapis.com | each family's own licence, set by Google Fonts |

None of these is pinned with a subresource-integrity hash. MathJax is not
pinned to a version at all, so that page can change without a commit here.
