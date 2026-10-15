/*
 * Everything TERMLINK decides, without the page: the VT100/ANSI interpreter
 * that turns typed input into a grid of cells, the breakdown that explains
 * each escape sequence, and the missions with the checks that grade them.
 * script.js loads after this and draws the grid, runs the game and saves
 * progress.
 */

"use strict";

/* =====================================================================
   VT / ANSI EMULATOR CORE
===================================================================== */
const ROWS = 9,
  COLS = 44;

function basicFg(n) {
  const map = [
    "#3a3a3a",
    "#ff5c57",
    "#5af78e",
    "#f3f99d",
    "#5555ff",
    "#ff79c6",
    "#8be9fd",
    "#f1f1f0",
  ];
  return map[n];
}
function brightFg(n) {
  const map = [
    "#6b6b6b",
    "#ff8b80",
    "#8dffb3",
    "#ffffa8",
    "#8d8dff",
    "#ffa3e0",
    "#b8f3ff",
    "#ffffff",
  ];
  return map[n];
}
const COLOR_NAMES = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
];

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
function rgbToHex(r, g, b) {
  r = clamp(Math.round(r), 0, 255);
  g = clamp(Math.round(g), 0, 255);
  b = clamp(Math.round(b), 0, 255);
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function idx256(n) {
  n = clamp(Math.round(n), 0, 255);
  if (n < 8) return basicFg(n);
  if (n < 16) return brightFg(n - 8);
  const levels = [0, 95, 135, 175, 215, 255];
  if (n < 232) {
    const i = n - 16,
      r = Math.floor(i / 36),
      g = Math.floor((i % 36) / 6),
      b = i % 6;
    return rgbToHex(levels[r], levels[g], levels[b]);
  }
  const gray = 8 + (n - 232) * 10;
  return rgbToHex(gray, gray, gray);
}
function hexToHsl(hex) {
  if (!hex) return null;
  let r = parseInt(hex.substr(1, 2), 16) / 255,
    g = parseInt(hex.substr(3, 2), 16) / 255,
    b = parseInt(hex.substr(5, 2), 16) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h,
    s,
    l = (max + min) / 2;
  if (max === min) {
    h = 0;
    s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}
function classify(hex) {
  if (!hex) return "default";
  const { h, s, l } = hexToHsl(hex);
  if (s < 15) return l > 75 ? "white" : l < 25 ? "black" : "gray";
  if (h < 15) return "red";
  if (h < 45) return "orange";
  if (h < 70) return "yellow";
  if (h < 170) return "green";
  if (h < 200) return "cyan";
  if (h < 255) return "blue";
  if (h < 330) return "magenta";
  return "red";
}

function blankCell() {
  return {
    ch: " ",
    fg: null,
    bg: null,
    bold: false,
    underline: false,
    blink: false,
  };
}
function blankGrid() {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, blankCell),
  );
}
function seededGrid(seed) {
  const g = blankGrid();
  if (seed) {
    seed.forEach((s) => {
      for (let i = 0; i < s.text.length; i++) {
        const c = s.col + i;
        if (c < COLS && s.row < ROWS)
          g[s.row][c] = { ...blankCell(), ch: s.text[i] };
      }
    });
  }
  return g;
}
function preprocess(raw) {
  let s = raw;
  s = s.replace(/\\x1b/gi, "\u001B");
  s = s.replace(/\\033/g, "\u001B");
  s = s.replace(/\\u001b/gi, "\u001B");
  s = s.replace(/\^\[/g, "\u001B");
  s = s.replace(/\\n/g, "\n");
  s = s.replace(/\\r/g, "\r");
  s = s.replace(/\\t/g, "\t");
  return s;
}

// A CSI sequence's parameters as numbers. An empty one -- the first in
// "\x1b[;20H" -- is NaN rather than dropped, so it takes its default instead of
// shifting the parameters after it along one: that is row 1, column 20.
function parseParams(paramStr) {
  return paramStr.split(";").map((x) => (x === "" ? NaN : Number(x)));
}

// SGR reads an absent parameter as 0, a reset.
function sgrParams(params) {
  return params.map((p) => (isNaN(p) ? 0 : p));
}

// The colour a 38 or 48 at params[i] selects, and how many parameters after it
// it uses. 38;5;n is a 256-colour index and 38;2;r;g;b a truecolour. With any
// of those numbers missing the colour is null and is ignored, as a terminal
// ignores it -- not "#NaNNaNNaN", which classify() reads as red.
function extendedColor(params, i) {
  const given = (...xs) => xs.every((x) => Number.isFinite(x));
  if (params[i + 1] === 5) {
    return { value: given(params[i + 2]) ? idx256(params[i + 2]) : null, skip: 2 };
  }
  if (params[i + 1] === 2) {
    const [r, g, b] = params.slice(i + 2, i + 5);
    return { value: given(r, g, b) ? rgbToHex(r, g, b) : null, skip: 4 };
  }
  return { value: null, skip: 0 };
}

function runVT(seed, rawInput) {
  const grid = seededGrid(seed);
  let row = 0,
    col = 0;
  let attrs = {
    fg: null,
    bg: null,
    bold: false,
    underline: false,
    blink: false,
    reverse: false,
  };
  const input = preprocess(rawInput);

  function scroll() {
    grid.shift();
    grid.push(Array.from({ length: COLS }, blankCell));
  }
  function writeChar(ch) {
    let fg = attrs.fg,
      bg = attrs.bg;
    if (attrs.reverse) {
      const t = fg;
      fg = bg;
      bg = t;
    }
    grid[row][col] = {
      ch,
      fg,
      bg,
      bold: attrs.bold,
      underline: attrs.underline,
      blink: attrs.blink,
    };
    col++;
    if (col >= COLS) {
      col = 0;
      row++;
      if (row >= ROWS) {
        scroll();
        row = ROWS - 1;
      }
    }
  }
  function eraseDisplay(mode) {
    const curIdx = row * COLS + col;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        if (mode === 2 || mode === 3) grid[r][c] = blankCell();
        else if (mode === 0 && i >= curIdx) grid[r][c] = blankCell();
        else if (mode === 1 && i <= curIdx) grid[r][c] = blankCell();
      }
  }
  function eraseLine(mode) {
    for (let c = 0; c < COLS; c++) {
      if (mode === 2) grid[row][c] = blankCell();
      else if (mode === 0 && c >= col) grid[row][c] = blankCell();
      else if (mode === 1 && c <= col) grid[row][c] = blankCell();
    }
  }
  function processSGR(params) {
    let i = 0;
    params = sgrParams(params);
    while (i < params.length) {
      const p = params[i];
      if (p === 0) {
        attrs = {
          fg: null,
          bg: null,
          bold: false,
          underline: false,
          blink: false,
          reverse: false,
        };
      } else if (p === 1) attrs.bold = true;
      else if (p === 4) attrs.underline = true;
      else if (p === 5) attrs.blink = true;
      else if (p === 7) attrs.reverse = true;
      else if (p === 22) attrs.bold = false;
      else if (p === 24) attrs.underline = false;
      else if (p === 25) attrs.blink = false;
      else if (p === 27) attrs.reverse = false;
      else if (p >= 30 && p <= 37) attrs.fg = basicFg(p - 30);
      else if (p === 38) {
        const color = extendedColor(params, i);
        if (color.value) attrs.fg = color.value;
        i += color.skip;
      } else if (p === 39) attrs.fg = null;
      else if (p >= 40 && p <= 47) attrs.bg = basicFg(p - 40);
      else if (p === 48) {
        const color = extendedColor(params, i);
        if (color.value) attrs.bg = color.value;
        i += color.skip;
      } else if (p === 49) attrs.bg = null;
      else if (p >= 90 && p <= 97) attrs.fg = brightFg(p - 90);
      else if (p >= 100 && p <= 107) attrs.bg = brightFg(p - 100);
      i++;
    }
  }

  let i = 0,
    guard = 0;
  while (i < input.length && guard < 20000) {
    guard++;
    const ch = input[i];
    if (ch === "\u001B") {
      i++;
      if (input[i] === "[") {
        i++;
        let paramStr = "";
        while (i < input.length && !/[A-Za-z]/.test(input[i])) {
          paramStr += input[i];
          i++;
        }
        const finalByte = input[i];
        i++;
        const params = parseParams(paramStr);
        switch (finalByte) {
          case "m":
            processSGR(params);
            break;
          case "H":
          case "f": {
            const r = (params[0] || 1) - 1,
              c = (params[1] || 1) - 1;
            row = clamp(r, 0, ROWS - 1);
            col = clamp(c, 0, COLS - 1);
            break;
          }
          case "A":
            row = clamp(row - (params[0] || 1), 0, ROWS - 1);
            break;
          case "B":
            row = clamp(row + (params[0] || 1), 0, ROWS - 1);
            break;
          case "C":
            col = clamp(col + (params[0] || 1), 0, COLS - 1);
            break;
          case "D":
            col = clamp(col - (params[0] || 1), 0, COLS - 1);
            break;
          case "J":
            eraseDisplay(params[0] || 0);
            break;
          case "K":
            eraseLine(params[0] || 0);
            break;
          default:
            break;
        }
      } else {
        i++;
      }
      continue;
    }
    if (ch === "\n") {
      row++;
      col = 0;
      if (row >= ROWS) {
        scroll();
        row = ROWS - 1;
      }
      i++;
      continue;
    }
    if (ch === "\r") {
      col = 0;
      i++;
      continue;
    }
    if (ch === "\t") {
      col = Math.min(COLS - 1, (Math.floor(col / 8) + 1) * 8);
      i++;
      continue;
    }
    writeChar(ch);
    i++;
  }
  return { grid, cursor: { row, col } };
}

function describeCSI(finalByte, params) {
  if (finalByte === "m") {
    params = sgrParams(params);
    const parts = [];
    let i = 0;
    while (i < params.length) {
      const p = params[i];
      if (p === 0) parts.push("reset all attributes");
      else if (p === 1) parts.push("bold on");
      else if (p === 4) parts.push("underline on");
      else if (p === 5) parts.push("blink on");
      else if (p === 7) parts.push("reverse video on");
      else if (p === 22) parts.push("bold off");
      else if (p === 24) parts.push("underline off");
      else if (p === 25) parts.push("blink off");
      else if (p === 27) parts.push("reverse off");
      else if (p >= 30 && p <= 37)
        parts.push("foreground → " + COLOR_NAMES[p - 30]);
      else if (p === 38) {
        parts.push("foreground → " + describeExtended(params, i));
        i += extendedColor(params, i).skip;
      } else if (p === 39) parts.push("foreground → default");
      else if (p >= 40 && p <= 47)
        parts.push("background → " + COLOR_NAMES[p - 40]);
      else if (p === 48) {
        parts.push("background → " + describeExtended(params, i));
        i += extendedColor(params, i).skip;
      } else if (p === 49) parts.push("background → default");
      else if (p >= 90 && p <= 97)
        parts.push("bright foreground → " + COLOR_NAMES[p - 90]);
      else if (p >= 100 && p <= 107)
        parts.push("bright background → " + COLOR_NAMES[p - 100]);
      else parts.push("code " + p + " (unrecognized)");
      i++;
    }
    return parts.join(", ");
  }
  if (finalByte === "H" || finalByte === "f") {
    return (
      "move cursor → row " + (params[0] || 1) + ", column " + (params[1] || 1)
    );
  }
  if (finalByte === "A") return "move cursor up " + (params[0] || 1);
  if (finalByte === "B") return "move cursor down " + (params[0] || 1);
  if (finalByte === "C") return "move cursor forward " + (params[0] || 1);
  if (finalByte === "D") return "move cursor back " + (params[0] || 1);
  if (finalByte === "J") {
    const m = params[0] || 0;
    return m === 2 || m === 3
      ? "erase entire screen"
      : m === 1
        ? "erase start→cursor"
        : "erase cursor→end of screen";
  }
  if (finalByte === "K") {
    const m = params[0] || 0;
    return m === 2
      ? "erase entire line"
      : m === 1
        ? "erase line start→cursor"
        : "erase cursor→end of line";
  }
  return "CSI sequence (" + finalByte + ")";
}

function describeExtended(params, i) {
  const ignored = !extendedColor(params, i).value;
  if (params[i + 1] === 5) {
    return ignored ? "256-color index missing (ignored)" : "256-color index " + params[i + 2];
  }
  if (params[i + 1] === 2) {
    return ignored
      ? "RGB with a component missing (ignored)"
      : "RGB(" + params[i + 2] + "," + params[i + 3] + "," + params[i + 4] + ")";
  }
  return "extended color with no mode (ignored)";
}

function explainInput(raw) {
  const input = preprocess(raw);
  const out = [];
  let i = 0,
    guard = 0,
    textBuf = "";
  function flushText() {
    if (textBuf) {
      out.push({ type: "text", value: textBuf });
      textBuf = "";
    }
  }
  while (i < input.length && guard < 5000) {
    guard++;
    const ch = input[i];
    if (ch === "\u001B") {
      flushText();
      i++;
      if (input[i] === "[") {
        i++;
        let paramStr = "";
        while (i < input.length && !/[A-Za-z]/.test(input[i])) {
          paramStr += input[i];
          i++;
        }
        const finalByte = input[i];
        i++;
        const params = parseParams(paramStr);
        out.push({
          type: "code",
          raw: "\\x1b[" + paramStr + finalByte,
          desc: describeCSI(finalByte, params),
        });
      } else {
        i++;
      }
      continue;
    }
    textBuf += ch;
    i++;
  }
  flushText();
  return out;
}

function findRun(grid, word) {
  for (let r = 0; r < ROWS; r++) {
    const rowStr = grid[r].map((c) => c.ch).join("");
    const idx = rowStr.indexOf(word);
    if (idx !== -1) {
      const cells = [];
      for (let k = 0; k < word.length; k++) cells.push(grid[r][idx + k]);
      return cells;
    }
  }
  return null;
}
function gridIsBlankExceptRun(grid, exceptWord) {
  const occupied = new Set();
  for (let r = 0; r < ROWS; r++) {
    const rowStr = grid[r].map((c) => c.ch).join("");
    const idx = rowStr.indexOf(exceptWord);
    if (idx !== -1) {
      for (let k = 0; k < exceptWord.length; k++)
        occupied.add(r + ":" + (idx + k));
    }
  }
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      if (occupied.has(r + ":" + c)) continue;
      if (grid[r][c].ch !== " ") return false;
    }
  return true;
}
function diag(label, ok) {
  return { label, ok };
}

/* =====================================================================
   MISSIONS
===================================================================== */
const MISSIONS = [
  {
    calibration: true,
    title: "00 :: CALIBRATION",
    briefing:
      "New operator detected. Before real clearance trials begin, confirm your terminal link is functioning. Nothing here is graded.",
    objective: "Type exactly: \\x1b[32mHELLO\\x1b[0m - then press EXECUTE.",
    seed: null,
    hint: "Copy it exactly: \\x1b[32mHELLO\\x1b[0m",
    check(grid) {
      const run = findRun(grid, "HELLO");
      const ok = !!(run && run.every((c) => classify(c.fg) === "green"));
      return {
        pass: ok,
        diagnostics: [
          diag('Word "HELLO" printed', !!run),
          diag("Foreground color is green", ok),
        ],
      };
    },
  },
  {
    title: "01 :: INTRUSION FLAG",
    briefing:
      "A silent alarm needs a visible marker. Security scripts watch for red text on this channel - anything else gets ignored.",
    objective: "Print the word ACCESS so its foreground color reads as RED.",
    seed: null,
    hint: "SGR code 31 sets a basic red foreground. Structure: \\x1b[ + code + m, then your text.",
    check(grid) {
      const run = findRun(grid, "ACCESS");
      const colorOk = !!(run && run.every((c) => classify(c.fg) === "red"));
      return {
        pass: !!run && colorOk,
        diagnostics: [
          diag('Word "ACCESS" printed', !!run),
          diag(
            "Foreground color is red" +
              (run ? " (detected: " + classify(run[0].fg) + ")" : ""),
            colorOk,
          ),
        ],
      };
    },
  },
  {
    title: "02 :: HAZARD HIGHLIGHT",
    briefing:
      "Background jobs get flagged differently than foreground ones - the highlight color lives behind the text, not in it.",
    objective: "Print the word DANGER with a YELLOW background.",
    seed: null,
    hint: "Background codes sit in the 40s range, mirroring the foreground 30s.",
    check(grid) {
      const run = findRun(grid, "DANGER");
      const colorOk = !!(
        run && run.every((c) => classify(c.bg) === "yellow")
      );
      return {
        pass: !!run && colorOk,
        diagnostics: [
          diag('Word "DANGER" printed', !!run),
          diag(
            "Background color is yellow" +
              (run ? " (detected: " + classify(run[0].bg) + ")" : ""),
            colorOk,
          ),
        ],
      };
    },
  },
  {
    title: "03 :: DOUBLE SIGNATURE",
    briefing:
      "A single attribute isn't enough to authorize an override - the terminal needs two style flags active on the same run of text, at once.",
    objective:
      "Print the word OVERRIDE both BOLD and UNDERLINED, using one sequence.",
    seed: null,
    hint: "Parameters can be chained with semicolons inside one SGR code: \\x1b[<a>;<b>m.",
    check(grid) {
      const run = findRun(grid, "OVERRIDE");
      const boldOk = !!(run && run.every((c) => c.bold));
      const undOk = !!(run && run.every((c) => c.underline));
      return {
        pass: !!run && boldOk && undOk,
        diagnostics: [
          diag('Word "OVERRIDE" printed', !!run),
          diag("Bold is active", boldOk),
          diag("Underline is active", undOk),
        ],
      };
    },
  },
  {
    title: "04 :: CLEAN HANDOFF",
    briefing:
      "Styles bleed forward until told otherwise. Leaving color turned on is how logs get contaminated - the next word must come out completely unstyled.",
    objective:
      "Print CLASSIFIED in CYAN, then print SAFE in the terminal's plain default color (no color code active).",
    seed: null,
    hint: "After your colored word, one code clears every active attribute back to default before you print the next word.",
    check(grid) {
      const a = findRun(grid, "CLASSIFIED");
      const b = findRun(grid, "SAFE");
      const aOk = !!(a && a.every((c) => classify(c.fg) === "cyan"));
      const bOk = !!(b && b.every((c) => c.fg === null));
      return {
        pass: !!a && !!b && aOk && bOk,
        diagnostics: [
          diag('Word "CLASSIFIED" printed', !!a),
          diag("CLASSIFIED foreground is cyan", aOk),
          diag('Word "SAFE" printed', !!b),
          diag("SAFE has no color applied (reset used)", bOk),
        ],
      };
    },
  },
  {
    title: "05 :: EXACT COORDINATES",
    briefing:
      "This isn't a scroll - it's a grid. The keycard glyph must land on one precise cell, not wherever the cursor happens to be.",
    objective: "Place the character K at exactly ROW 5, COLUMN 20.",
    seed: null,
    hint: "Cursor positioning: \\x1b[row;colH - rows and columns count from 1, not 0.",
    check(grid) {
      const ok = !!(grid[4] && grid[4][19] && grid[4][19].ch === "K");
      return {
        pass: ok,
        diagnostics: [diag("Character K found at row 5, column 20", ok)],
      };
    },
  },
  {
    title: "06 :: PURGE THE LOGS",
    briefing:
      "Old breach records are cluttering the buffer. Nothing you print will look clean until the whole screen has actually been wiped - not just written over.",
    objective:
      "Clear the ENTIRE screen, then print WIPED starting at the top-left corner.",
    seed: [
      { row: 0, col: 0, text: "LOG7734::BREACH_DETECTED_UNIT-9" },
      { row: 1, col: 0, text: "LOG7735::BREACH_DETECTED_UNIT-4" },
      { row: 2, col: 0, text: "LOG7736::UNAUTHORIZED_QUERY" },
      { row: 3, col: 0, text: "LOG7737::UNAUTHORIZED_QUERY" },
    ],
    hint: "Erase-in-display: \\x1b[2J clears every cell. Do it BEFORE you print, or your own text gets wiped too.",
    check(grid) {
      const run = findRun(grid, "WIPED");
      const posOk = !!(run && run[0] === grid[0][0]);
      const cleanOk = !!(run && gridIsBlankExceptRun(grid, "WIPED"));
      return {
        pass: !!run && posOk && cleanOk,
        diagnostics: [
          diag('Word "WIPED" printed', !!run),
          diag("WIPED starts at top-left corner", posOk),
          diag("Rest of the screen is empty (fully cleared)", cleanOk),
        ],
      };
    },
  },
  {
    title: "07 :: EXTENDED SPECTRUM",
    briefing:
      "Sixteen colors won't cut it for this clearance tier. The archive uses the extended 256-color palette - you'll need the right index, not just a name.",
    objective: "Print the word ORANGE using 256-color mode, index 208.",
    seed: null,
    hint: "256-color foreground: \\x1b[38;5;<n>m - the mission tells you which index to use.",
    check(grid) {
      const run = findRun(grid, "ORANGE");
      const ok = !!(run && run.every((c) => classify(c.fg) === "orange"));
      return {
        pass: ok,
        diagnostics: [
          diag('Word "ORANGE" printed', !!run),
          diag(
            "Foreground reads as orange" +
              (run ? " (detected: " + classify(run[0].fg) + ")" : ""),
            ok,
          ),
        ],
      };
    },
  },
  {
    title: "08 :: SIGNATURE FREQUENCY",
    briefing:
      "Final lock. The core only responds to one exact frequency, specified as a precise RGB triplet - not an approximation.",
    objective:
      "Print the word GHOST in truecolor RGB(127, 90, 240) - hex #7F5AF0.",
    seed: null,
    hint: "24-bit truecolor foreground: \\x1b[38;2;r;g;bm - plug in the exact numbers.",
    check(grid) {
      const run = findRun(grid, "GHOST");
      const ok = !!(
        run && run.every((c) => c.fg && c.fg.toLowerCase() === "#7f5af0")
      );
      return {
        pass: ok,
        diagnostics: [
          diag('Word "GHOST" printed', !!run),
          diag(
            "Foreground is exactly RGB(127,90,240)" +
              (run ? " (detected: " + (run[0].fg || "default") + ")" : ""),
            ok,
          ),
        ],
      };
    },
  },
];
const GRADED_COUNT = MISSIONS.filter((m) => !m.calibration).length;

/*
 * Saved progress as two tabs of the same run agree on it. Each tab keeps its
 * own copy in memory and saves the whole of it, so without this the tab that
 * saved last would undo every mission the other had completed since it
 * loaded. A different run -- a restart, or a new operator -- is not merged:
 * it replaces what is stored, as it always has.
 */
function mergeProgress(stored, mine) {
  if (!stored || stored.callsign !== mine.callsign || stored.startTime !== mine.startTime) {
    return mine;
  }
  const theirs = (key, i) => (Array.isArray(stored[key]) ? stored[key][i] : undefined);
  return {
    ...mine,
    completed: mine.completed.map((done, i) => !!(done || theirs("completed", i))),
    attempts: mine.attempts.map((n, i) => Math.max(n || 0, theirs("attempts", i) || 0)),
    highestReached: Math.max(mine.highestReached || 0, stored.highestReached || 0),
  };
}
