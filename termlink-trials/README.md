# 🖥️ TERMLINK :: Escape Sequence Trials

A browser-based CRT-terminal puzzle game that teaches ANSI/VT100 escape sequences by making you actually type them. No lecture slides - just a live terminal, a target output, and a hacker aesthetic.

![status](https://img.shields.io/badge/status-playable-3dffb0) ![type](https://img.shields.io/badge/type-vanilla%20JS-1f6b4a)

## Play it

Open `index.html` in any modern browser - no build step, no dependencies, no server required.

Or enable GitHub Pages on this repo (Settings → Pages → deploy from `main`) and play it straight from a URL.

## What it is

You play an "operator" working through 8 graded missions (plus a calibration round) inside a simulated terminal called TERMLINK OS. Each mission gives you a briefing and an objective; you type a real escape sequence into the input box, the terminal renders it **live** as you type, and TERMLINK checks whether your output matches what was asked for.

Missions cover:

- `00` Calibration - get the mechanics under your fingers
- `01` Intrusion Flag
- `02` Hazard Highlight
- `03` Double Signature
- `04` Clean Handoff
- `05` Exact Coordinates
- `06` Purge the Logs
- `07` Extended Spectrum
- `08` Signature Frequency

By the end you'll have used SGR color codes (foreground/background), text attributes (bold, underline) and combining them, attribute reset, cursor addressing (`row;colH`), screen erase (`2J`), the 256-color palette (`38;5;n`), and 24-bit truecolor (`38;2;r;g;b`) - for real, not simulated.

Finish all 8 and you get a downloadable certificate of clearance.

## Features

- Live terminal preview as you type - see the effect before you submit
- A reference codex of escape codes, with click-to-insert templates
- Sequence breakdown that explains what each token in your input does
- Hints that unlock automatically after a couple of failed attempts
- Accessibility options: reduced motion and adjustable font size
- A downloadable text certificate on completion

## A note on saving progress

This project was originally built as a Claude Artifact, where it had access to a small persistent key-value store (`window.storage`). That API **only exists inside Claude's artifact runtime** - it is not a web standard, so it won't work on GitHub Pages or anywhere else outside Claude.

Progress (callsign, completed missions, attempts, settings) is now saved with `localStorage` instead, so the game works fine standalone - it's just scoped to one browser on one device, with no sync across devices. The original build's shared cross-player leaderboard depended on that Claude-only backend and has been removed rather than faked; everything else plays exactly the same.

## Project structure

```
.
├── index.html   # markup only
├── style.css    # CRT/terminal visual theme
├── engine.js    # VT100 interpreter, sequence breakdown, missions and their checks
├── script.js    # the game: rendering, mission flow, saved progress
├── README.md
└── Wiki.md
```

## Tech

Plain HTML/CSS/JavaScript. No frameworks, no build tools, no npm install. Fonts are loaded from Google Fonts (`VT323`, `Share Tech Mono`); everything else is self-contained.

## License

Add a license of your choice here (MIT is a common pick for a project like this) before or after pushing.
