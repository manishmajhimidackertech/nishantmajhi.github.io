# 🖥️ TERMLINK: Escape Sequence Trials

**TERMLINK: Escape Sequence Trials** is a browser-based educational puzzle game in which players learn ANSI/VT100 terminal escape sequences by typing them directly into a simulated terminal and observing the live result. It is built with vanilla HTML, CSS, and JavaScript and requires no installation or build process.

## Overview

The game frames its lessons as a series of "security clearance" missions undertaken by a player-named "operator" inside a fictional system called TERMLINK OS. Rather than presenting escape codes as a reference table to memorize, each mission poses a visual objective - for example, rendering specific text in a given color, or positioning a cursor at an exact coordinate - that can only be solved by writing a correct, real escape sequence.

## Gameplay

A player begins by choosing a callsign, then proceeds through a calibration mission and eight graded missions of increasing complexity. For each mission, the game displays:

- A **briefing**, describing the in-fiction task
- An **objective**, stating the exact rendering condition that must be met
- A **live terminal** that re-renders as the player types, before submission
- A **reference codex** of escape codes with click-to-insert templates

On submission, the game runs the player's input through its own escape-sequence interpreter and checks the resulting terminal grid against the mission's target condition, returning either "ACCESS GRANTED" or "ACCESS DENIED" along with a diagnostic breakdown of which conditions passed or failed. Repeated failures unlock an optional hint.

## Topics covered

Over the course of the eight missions, the game exercises the following parts of the ANSI/VT100 SGR (Select Graphic Rendition) and cursor-control specification:

| Concept                           | Escape sequence family  |
| --------------------------------- | ----------------------- |
| Foreground/background color       | `\x1b[3Xm` / `\x1b[4Xm` |
| Text attributes (bold, underline) | `\x1b[1m`, `\x1b[4m`    |
| Attribute reset                   | `\x1b[0m`               |
| Cursor addressing                 | `\x1b[row;colH`         |
| Screen erase                      | `\x1b[2J`               |
| 256-color palette                 | `\x1b[38;5;nm`          |
| 24-bit truecolor                  | `\x1b[38;2;r;g;bm`      |

## Completion and certification

Clearing all eight graded missions triggers an in-game certificate screen recording the player's callsign, total attempts, and completion time, which can be downloaded as a plain-text "Certificate of Clearance." Mission progress is saved locally in the player's browser via `localStorage`, so a session can be resumed after closing the page, though progress does not sync across devices or browsers.

## Technology

TERMLINK is implemented as a single self-contained web application split across `index.html`, `style.css`, and `script.js`, using no external frameworks or dependencies beyond two Google Fonts (`VT323` and `Share Tech Mono`) for its terminal aesthetic. Its core is a small custom interpreter that parses a subset of ANSI/VT100 escape sequences and renders them to a character grid, which is also used to grade player submissions.

## See also

- [ANSI escape code](https://en.wikipedia.org/wiki/ANSI_escape_code)
- [VT100](https://en.wikipedia.org/wiki/VT100)
- [Select Graphic Rendition](https://en.wikipedia.org/wiki/ANSI_escape_code#SGR)

---

_This page documents a fan/independent project and is not affiliated with any official standards body. It is written in an encyclopedic style for use as a GitHub Wiki page rather than as an article on Wikipedia itself - see the note below._

## Why not an actual Wikipedia article?

Wikipedia's [notability guidelines](https://en.wikipedia.org/wiki/Wikipedia:Notability) require significant coverage in independent, reliable secondary sources (press coverage, reviews, academic citations, etc.) before a subject qualifies for its own article. A newly created personal project - however polished - won't meet that bar on day one, and an article created without it is typically deleted quickly. This page is written in that style anyway so you can drop it straight into your repo's GitHub Wiki (Settings → Wiki) or keep it as `WIKI.md`. If the game later gets genuine independent coverage, that's when a real Wikipedia article becomes viable - and at that point the sourcing here would be a useful starting draft.
