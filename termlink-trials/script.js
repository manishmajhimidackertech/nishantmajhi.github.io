(function () {
  "use strict";

  /* =====================================================================
     STORAGE HELPERS
  ===================================================================== */
  // Progress is saved locally in this browser via localStorage - it works standalone
  // (GitHub Pages, opened as a file, etc.) but does NOT sync across devices/browsers.
  const PROGRESS_KEY = "termlink:progress";
  const hasLocalStorage = (function () {
    try {
      const t = "__termlink_test__";
      window.localStorage.setItem(t, "1");
      window.localStorage.removeItem(t);
      return true;
    } catch (e) {
      return false;
    } // private browsing / storage disabled
  })();

  async function saveProgress() {
    if (!hasLocalStorage) return;
    try {
      // Read what is stored now, not at page load: another tab may have saved.
      const merged = mergeProgress(readStoredProgress(), {
        callsign: state.callsign,
        current: state.current,
        completed: state.completed,
        attempts: state.attempts,
        highestReached: state.highestReached,
        startTime: state.startTime,
        settings: state.settings,
        onboarded: true,
      });
      state.completed = merged.completed;
      state.attempts = merged.attempts;
      state.highestReached = merged.highestReached;
      window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(merged));
      flashSaveIndicator();
    } catch (e) {
      /* non-fatal */
    }
  }
  async function loadProgress() {
    return readStoredProgress();
  }
  function readStoredProgress() {
    if (!hasLocalStorage) return null;
    try {
      const raw = window.localStorage.getItem(PROGRESS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function flashSaveIndicator() {
    const el = document.getElementById("saveIndicator");
    el.textContent = "progress saved";
    setTimeout(() => {
      if (el.textContent === "progress saved") el.textContent = "";
    }, 1500);
  }

  function escapeHtml(c) {
    if (c === "<") return "&lt;";
    if (c === ">") return "&gt;";
    if (c === "&") return "&amp;";
    return c;
  }
  function escapeText(s) {
    return String(s).replace(/[<>&]/g, escapeHtml);
  }

  function renderGrid(grid) {
    const el = document.getElementById("termGrid");
    let html = "";
    for (let r = 0; r < ROWS; r++) {
      html += '<span class="term-row">';
      let runStart = 0;
      const row = grid[r];
      function sig(c) {
        return (
          (c.fg || "") +
          "|" +
          (c.bg || "") +
          "|" +
          c.bold +
          "|" +
          c.underline +
          "|" +
          c.blink
        );
      }
      for (let c = 1; c <= COLS; c++) {
        if (c === COLS || sig(row[c]) !== sig(row[runStart])) {
          const cell = row[runStart];
          const text = row
            .slice(runStart, c)
            .map((x) => escapeHtml(x.ch))
            .join("");
          const title =
            (cell.fg ? "fg:" + classify(cell.fg) + " " : "") +
            (cell.bg ? "bg:" + classify(cell.bg) : "");
          const style = `color:${cell.fg || "var(--phosphor)"};background-color:${cell.bg || "transparent"};font-weight:${cell.bold ? 700 : 400};text-decoration:${cell.underline ? "underline" : "none"};${cell.blink ? "animation:blink 1s steps(1) infinite;" : ""}`;
          html += `<span title="${title}" style="${style}">${text || "&nbsp;"}</span>`;
          runStart = c;
        }
      }
      html += "</span>";
    }
    el.innerHTML = html;

    const legendEl = document.getElementById("colorLegend");
    if (state.settings.colorSafe) {
      const legend = [];
      for (let r = 0; r < ROWS; r++) {
        const row = grid[r];
        let runStart = 0;
        function sig(c) {
          return (c.fg || "") + "|" + (c.bg || "");
        }
        for (let c = 1; c <= COLS; c++) {
          if (c === COLS || sig(row[c]) !== sig(row[runStart])) {
            const cell = row[runStart];
            const text = row
              .slice(runStart, c)
              .map((x) => x.ch)
              .join("")
              .trim();
            if (text && (cell.fg || cell.bg)) {
              const bits = [];
              if (cell.fg) bits.push("fg=" + classify(cell.fg));
              if (cell.bg) bits.push("bg=" + classify(cell.bg));
              legend.push('"' + escapeText(text) + '" → ' + bits.join(", "));
            }
            runStart = c;
          }
        }
      }
      if (legend.length) {
        legendEl.style.display = "block";
        legendEl.innerHTML = "COLOR-SAFE LABELS: " + legend.join(" · ");
      } else legendEl.style.display = "none";
    } else legendEl.style.display = "none";
  }

  const CODEX_ROWS = [
    ["\\x1b[", "Escape + CSI - begins almost every sequence", null],
    ["...m", "SGR - sets color/style. Params separated by ;", null],
    ["0", "Reset all attributes to default", "\\x1b[0m"],
    ["1 / 4", "Bold / Underline", "\\x1b[1;4m"],
    ["30–37", "Foreground color (basic 8)", "\\x1b[31m"],
    ["40–47", "Background color (basic 8)", "\\x1b[43m"],
    ["38;5;n", "Foreground, 256-color palette (n = 0–255)", "\\x1b[38;5;nm"],
    ["38;2;r;g;b", "Foreground, 24-bit truecolor", "\\x1b[38;2;r;g;b" + "m"],
    ["...H", "Cursor position: \\x1b[row;colH (1-indexed)", "\\x1b[5;20H"],
    ["...J", "Erase display: \\x1b[2J clears everything", "\\x1b[2J"],
  ];

  /* =====================================================================
     STATE
  ===================================================================== */
  let state = {
    callsign: "",
    current: 0,
    completed: new Array(MISSIONS.length).fill(false),
    attempts: new Array(MISSIONS.length).fill(0),
    highestReached: 0,
    startTime: 0,
    settings: { reducedMotion: false, colorSafe: false, fontScale: 1 },
  };

  function typewriter(el, text, speed, done) {
    if (el._twInterval) {
      clearInterval(el._twInterval);
      el._twInterval = null;
    }
    if (state.settings.reducedMotion) {
      el.textContent = text;
      if (done) done();
      return;
    }
    el.textContent = "";
    let i = 0;
    el._twInterval = setInterval(() => {
      el.textContent += text[i];
      i++;
      if (i >= text.length) {
        clearInterval(el._twInterval);
        el._twInterval = null;
        if (done) done();
      }
    }, speed);
  }

  /* ---- BOOT ---- */
  const bootText = `TERMLINK OS v2.4 - SECURE UPLINK NODE
INITIALIZING KERNEL................... OK
LOADING ESCAPE SEQUENCE INTERPRETER.... OK
MOUNTING ARCHIVE PARTITION............ OK
SECURITY CLEARANCE TRIALS QUEUED...... 8

This terminal only obeys real VT100 / ANSI control codes.
No mouse. No menus. Only correctly formed escape sequences
will unlock each partition.`;

  const bootLinesEl = document.getElementById("bootLines");

  loadProgress().then((saved) => {
    typewriter(bootLinesEl, bootText, 12, () => {
      if (saved && saved.callsign) {
        document.getElementById("continueBtn").textContent =
          "CONTINUE AS " + saved.callsign.toUpperCase();
        document.getElementById("continueRow").style.display = "flex";
        document.getElementById("continueBtn").onclick = () =>
          resumeGame(saved);
        document.getElementById("bootHint").textContent =
          "press ENTER to continue";
        document.getElementById("newOpBtn").onclick = () => {
          document.getElementById("continueRow").style.display = "none";
          document.getElementById("callsignRow").style.display = "flex";
          document.getElementById("bootHint").textContent =
            "press ENTER to confirm callsign";
          document.getElementById("callsignInput").focus();
        };
      } else {
        document.getElementById("callsignRow").style.display = "flex";
        document.getElementById("callsignInput").focus();
      }
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const boot = document.getElementById("bootScreen");
    if (boot.style.display === "none") return; // not on boot screen anymore
    const continueRow = document.getElementById("continueRow");
    const callsignRow = document.getElementById("callsignRow");
    if (continueRow.style.display === "flex") {
      e.preventDefault();
      document.getElementById("continueBtn").click();
    } else if (callsignRow.style.display === "flex") {
      e.preventDefault();
      const val = document.getElementById("callsignInput").value.trim();
      state.callsign = val || "UNKNOWN";
      state.startTime = Date.now();
      enterGame();
      showOnboarding();
    }
  });

  function resumeGame(saved) {
    state.callsign = saved.callsign;
    state.current = saved.current || 0;
    state.completed = saved.completed || new Array(MISSIONS.length).fill(false);
    state.attempts = saved.attempts || new Array(MISSIONS.length).fill(0);
    state.highestReached = saved.highestReached || 0;
    state.startTime = saved.startTime || Date.now();
    state.settings = saved.settings || state.settings;
    enterGame();
    applySettingsToUI();
    if (state.completed.filter(Boolean).length >= GRADED_COUNT) {
      showCertificate();
    } else {
      loadMission(state.current);
    }
  }

  function enterGame() {
    document.getElementById("bootScreen").style.display = "none";
    document.getElementById("gameScreen").style.display = "block";
    document.getElementById("hudCallsign").textContent =
      state.callsign.toUpperCase();
    buildCodex();
    buildToolbar();
    buildMissionList();
    if (!document.getElementById("gameScreen").dataset.initDone) {
      // state.current, not 0: when resuming, resumeGame has already set it
      // to the player's mission, and loading 0 would save over their place.
      loadMission(state.current);
      document.getElementById("gameScreen").dataset.initDone = "1";
    }
  }

  /* ---- ONBOARDING ---- */
  function showOnboarding() {
    document.getElementById("onboardOverlay").style.display = "flex";
  }
  document.getElementById("onboardDismiss").addEventListener("click", () => {
    document.getElementById("onboardOverlay").style.display = "none";
    saveProgress();
  });
  document.getElementById("howBtn").addEventListener("click", showOnboarding);

  /* ---- OPTIONS ---- */
  function applySettingsToUI() {
    document.getElementById("reducedMotionToggle").checked =
      state.settings.reducedMotion;
    document.getElementById("colorSafeToggle").checked =
      state.settings.colorSafe;
    document
      .getElementById("app")
      .classList.toggle("reduced-motion", state.settings.reducedMotion);
    document.documentElement.style.setProperty(
      "--fs",
      state.settings.fontScale,
    );
  }
  document
    .getElementById("reducedMotionToggle")
    .addEventListener("change", (e) => {
      state.settings.reducedMotion = e.target.checked;
      document
        .getElementById("app")
        .classList.toggle("reduced-motion", state.settings.reducedMotion);
      saveProgress();
    });
  document.getElementById("colorSafeToggle").addEventListener("change", (e) => {
    state.settings.colorSafe = e.target.checked;
    livePreview();
    saveProgress();
  });
  document.getElementById("fontUp").addEventListener("click", () => {
    state.settings.fontScale = Math.min(
      1.4,
      +(state.settings.fontScale + 0.1).toFixed(2),
    );
    document.documentElement.style.setProperty(
      "--fs",
      state.settings.fontScale,
    );
    saveProgress();
  });
  document.getElementById("fontDown").addEventListener("click", () => {
    state.settings.fontScale = Math.max(
      0.8,
      +(state.settings.fontScale - 0.1).toFixed(2),
    );
    document.documentElement.style.setProperty(
      "--fs",
      state.settings.fontScale,
    );
    saveProgress();
  });

  /* ---- CODEX / TOOLBAR ---- */
  function buildCodex() {
    const table = document.getElementById("codexTable");
    table.innerHTML = CODEX_ROWS.map(([code, desc, snippet]) => {
      const cell = snippet
        ? `<button class="snippet-btn" data-snippet="${snippet.replace(/"/g, "&quot;")}">${code}</button>`
        : `<code>${code}</code>`;
      return `<tr><td>${cell}</td><td>${desc}</td></tr>`;
    }).join("");
    table.querySelectorAll(".snippet-btn").forEach((btn) => {
      btn.addEventListener("click", () => insertAtCursor(btn.dataset.snippet));
    });
  }
  const QUICK_INSERTS = [
    { label: "ESC[", value: "\\x1b[" },
    { label: ";", value: ";" },
    { label: "m", value: "m" },
    { label: "H", value: "H" },
    { label: "J", value: "J" },
    { label: "reset \\x1b[0m", value: "\\x1b[0m" },
  ];
  function buildToolbar() {
    const el = document.getElementById("toolbarRow");
    el.innerHTML = QUICK_INSERTS.map(
      (q) =>
        `<button data-ins="${q.value.replace(/"/g, "&quot;")}">${q.label}</button>`,
    ).join("");
    el.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => insertAtCursor(btn.dataset.ins));
    });
  }
  function insertAtCursor(text) {
    const input = document.getElementById("codeInput");
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    const pos = start + text.length;
    input.focus();
    input.setSelectionRange(pos, pos);
    livePreview();
  }

  /* ---- MISSION LIST ---- */
  function buildMissionList() {
    const el = document.getElementById("missionList");
    el.innerHTML = MISSIONS.map((m, i) => {
      const unlocked = i <= state.highestReached;
      const mark = state.completed[i]
        ? "✓"
        : i === state.current
          ? "›"
          : unlocked
            ? "·"
            : "🔒";
      let cls = unlocked ? "unlocked" : "locked";
      if (state.completed[i]) cls += " done";
      if (i === state.current) cls += " current";
      const wrap = m.calibration ? "calib" : "";
      return `<div class="m-item ${cls} ${wrap}" data-idx="${i}" tabindex="${unlocked ? 0 : -1}"><span class="m-mark">${mark}</span>${m.title}</div>`;
    }).join("");
    el.querySelectorAll(".m-item.unlocked").forEach((item) => {
      item.addEventListener("click", () => loadMission(+item.dataset.idx));
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter") loadMission(+item.dataset.idx);
      });
    });
  }

  function updateHud() {
    const done = state.completed.filter(
      (v, i) => v && !MISSIONS[i].calibration,
    ).length;
    document.getElementById("hudProgress").textContent =
      done + "/" + GRADED_COUNT;
    document.getElementById("progFill").style.width =
      (done / GRADED_COUNT) * 100 + "%";
  }

  /* ---- MISSION LOADING ---- */
  let liveGrid = null;

  function loadMission(idx) {
    state.current = idx;
    state.highestReached = Math.max(state.highestReached, idx);
    buildMissionList();
    updateHud();
    const m = MISSIONS[idx];

    document.getElementById("practiceBanner").style.display = state.completed[
      idx
    ]
      ? "block"
      : "none";
    document.getElementById("objectiveBox").textContent =
      "OBJECTIVE: " + m.objective;
    typewriter(document.getElementById("briefing"), m.briefing, 8);

    document.getElementById("codeInput").value = "";
    document.getElementById("feedback").textContent = "";
    document.getElementById("feedback").className = "";
    document.getElementById("diagnostics").innerHTML = "";
    document.getElementById("breakdown").style.display = "none";
    document.getElementById("hintText").style.display = "none";
    document.getElementById("hintText").textContent = m.hint;
    document.getElementById("history").innerHTML = "";
    document.getElementById("nextBtn").disabled = !state.completed[idx];
    document.getElementById("nextBtn").textContent =
      idx === MISSIONS.length - 1 ? "VIEW CERTIFICATE ▸" : "NEXT MISSION ▸";

    liveGrid = runVT(m.seed, "").grid;
    renderGrid(liveGrid);
    document.getElementById("codeInput").focus();
    saveProgress();
  }

  function livePreview() {
    const m = MISSIONS[state.current];
    const val = document.getElementById("codeInput").value;
    const result = runVT(m.seed, val);
    liveGrid = result.grid;
    renderGrid(liveGrid);
  }

  document.getElementById("codeInput").addEventListener("input", livePreview);
  document.getElementById("codeInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      attemptExecute();
    }
  });
  document
    .getElementById("executeBtn")
    .addEventListener("click", attemptExecute);
  document.getElementById("clearInputBtn").addEventListener("click", () => {
    document.getElementById("codeInput").value = "";
    livePreview();
    document.getElementById("codeInput").focus();
  });

  function logHistory(cmd, ok) {
    const el = document.getElementById("history");
    const line = document.createElement("div");
    line.className = ok ? "ok" : "no";
    line.textContent = (ok ? "[OK]     " : "[DENIED] ") + "> " + cmd;
    el.insertBefore(line, el.firstChild);
  }

  function renderDiagnostics(diagnostics) {
    const el = document.getElementById("diagnostics");
    el.innerHTML = diagnostics
      .map(
        (d) =>
          `<div class="${d.ok ? "yes" : "no"}">${d.ok ? "✓" : "✗"} ${d.label}</div>`,
      )
      .join("");
  }

  function renderBreakdown(raw) {
    const tokens = explainInput(raw);
    const el = document.getElementById("breakdown");
    if (!tokens.length) {
      el.style.display = "none";
      return;
    }
    el.style.display = "block";
    el.innerHTML =
      "<strong>SEQUENCE BREAKDOWN:</strong><br>" +
      tokens
        .map((t) => {
          if (t.type === "text")
            return `<span class="tok-text">"${escapeText(t.value)}"</span> → literal text`;
          return `<span class="tok-code">${escapeText(t.raw)}</span> → ${t.desc}`;
        })
        .join("<br>");
  }

  function attemptExecute() {
    const idx = state.current;
    const m = MISSIONS[idx];
    const val = document.getElementById("codeInput").value;
    if (!val.trim()) return;
    const result = runVT(m.seed, val);
    liveGrid = result.grid;
    renderGrid(liveGrid);

    const { pass, diagnostics } = m.check(liveGrid);
    const fb = document.getElementById("feedback");
    logHistory(val, pass);
    renderDiagnostics(diagnostics);
    renderBreakdown(val);

    state.attempts[idx] = (state.attempts[idx] || 0) + 1;

    if (pass) {
      fb.textContent = m.calibration
        ? "LINK CONFIRMED - CALIBRATION COMPLETE"
        : state.completed[idx]
          ? "ACCESS GRANTED - PRACTICE RUN CONFIRMED"
          : "ACCESS GRANTED - CLEARANCE ESCALATED";
      fb.className = "granted";
      const wasNew = !state.completed[idx];
      state.completed[idx] = true;
      buildMissionList();
      updateHud();
      document.getElementById("nextBtn").disabled = false;
      document.getElementById("practiceBanner").style.display = wasNew
        ? "none"
        : document.getElementById("practiceBanner").style.display;
      saveProgress();
    } else {
      fb.textContent = "ACCESS DENIED - SIGNATURE DOES NOT MATCH";
      fb.className = "denied";
      if (state.attempts[idx] >= 2) {
        document.getElementById("hintText").style.display = "block";
      }
    }
  }

  document.getElementById("hintBtn").addEventListener("click", () => {
    document.getElementById("hintText").style.display = "block";
  });

  document.getElementById("nextBtn").addEventListener("click", () => {
    const next = state.current + 1;
    if (next >= MISSIONS.length) {
      showCertificate();
    } else {
      loadMission(next);
    }
  });

  /* ---- CERTIFICATE ---- */
  function formatTime(sec) {
    const m = Math.floor(sec / 60),
      s = sec % 60;
    return m + "m " + String(s).padStart(2, "0") + "s";
  }

  async function showCertificate() {
    document.getElementById("gameScreen").style.display = "none";
    document.getElementById("certScreen").style.display = "block";
    document.getElementById("certName").textContent =
      state.callsign.toUpperCase();
    const d = new Date();
    const totalAttempts = state.attempts.reduce(
      (a, b, i) => (MISSIONS[i].calibration ? a : a + b),
      0,
    );
    const timeSeconds = Math.max(
      1,
      Math.round((Date.now() - state.startTime) / 1000),
    );
    document.getElementById("certStats").textContent =
      "Total attempts: " +
      totalAttempts +
      "  ·  Total time: " +
      formatTime(timeSeconds);
    document.getElementById("certStamp").textContent =
      "ISSUED " +
      d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      }) +
      "  ·  CLEARANCE LEVEL: OMEGA  ·  TRIALS COMPLETED " +
      GRADED_COUNT +
      "/" +
      GRADED_COUNT;

    spawnConfetti();
    saveProgress();
  }

  function spawnConfetti() {
    if (state.settings.reducedMotion) return;
    const colors = ["#3dffb0", "#ffb020", "#7dffce", "#ff9d4d"];
    for (let i = 0; i < 50; i++) {
      const p = document.createElement("div");
      p.className = "confetti-piece";
      p.style.left = Math.random() * 100 + "vw";
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      p.style.animationDuration = 2 + Math.random() * 1.8 + "s";
      p.style.animationDelay = Math.random() * 0.6 + "s";
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 5000);
    }
  }

  document.getElementById("downloadCertBtn").addEventListener("click", () => {
    const d = new Date();
    const totalAttempts = state.attempts.reduce(
      (a, b, i) => (MISSIONS[i].calibration ? a : a + b),
      0,
    );
    const timeSeconds = Math.max(
      1,
      Math.round((Date.now() - state.startTime) / 1000),
    );
    const text = `╔══════════════════════════════════════════════════╗
║          CERTIFICATE OF CLEARANCE                  ║
║       TERMLINK SECURE OPERATIONS DIVISION          ║
╠══════════════════════════════════════════════════╣

  This certifies that operator

      ${state.callsign.toUpperCase()}

  has demonstrated full command authority over the
  ANSI / VT100 escape sequence protocol and
  successfully cleared all ${GRADED_COUNT} TERMLINK security trials.

  MASTERED:
   - SGR color codes (foreground / background)
   - Text attributes (bold, underline) and combining them
   - Attribute reset
   - Cursor addressing (row;colH)
   - Screen erase (2J)
   - 256-color palette mode (38;5;n)
   - 24-bit truecolor (38;2;r;g;b)

  Total attempts: ${totalAttempts}
  Total time: ${formatTime(timeSeconds)}

  Issued ${d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
  Clearance level: OMEGA

╚══════════════════════════════════════════════════╝`;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      "termlink-certificate-" +
      (state.callsign || "operator").replace(/[^a-z0-9]/gi, "_") +
      ".txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });

  document.getElementById("restartBtn").addEventListener("click", () => {
    state.current = 0;
    state.completed = new Array(MISSIONS.length).fill(false);
    state.attempts = new Array(MISSIONS.length).fill(0);
    state.highestReached = 0;
    state.startTime = Date.now();
    document.getElementById("certScreen").style.display = "none";
    document.getElementById("gameScreen").style.display = "block";
    buildMissionList();
    loadMission(0);
    saveProgress();
  });
})();
