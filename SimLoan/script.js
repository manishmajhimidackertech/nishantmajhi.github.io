/**
 * SimLoan — Loan Payment Simulator
 * app.js — Core logic: EMI calculation, chart rendering, amortization table
 */

"use strict";

/* ── Chart instance ───────────────────────────────────────── */
let chartInstance = null;
let lastSchedule = null; // what the chart is currently drawing

/* ── Calculation Mode ─────────────────────────────────────── */
let calcMode = "tenure"; // "emi" | "tenure"

/**
 * Switch between "Find EMI" and "Find Tenure" modes.
 * @param {"emi"|"tenure"} mode
 */
function setMode(mode) {
  calcMode = mode;

  const tenureField = document.getElementById("tenureField");
  const emiInputField = document.getElementById("emiInputField");
  const mTenureCard = document.getElementById("mTenureCard");
  const btnEMI = document.getElementById("modeEMI");
  const btnTenure = document.getElementById("modeTenure");

  if (mode === "tenure") {
    tenureField.style.display = "none";
    emiInputField.style.display = "block";
    mTenureCard.style.display = "flex";
    btnTenure.classList.add("active");
    btnEMI.classList.remove("active");
    document.getElementById("mEMICard").style.display = "none";
  } else {
    tenureField.style.display = "block";
    emiInputField.style.display = "none";
    mTenureCard.style.display = "none";
    btnEMI.classList.add("active");
    btnTenure.classList.remove("active");
    document.getElementById("mEMICard").style.display = "flex";
  }

  compute();
}

/**
 * Calculate loan tenure (months) given principal, annual rate, and fixed EMI.
 * Formula: n = -log(1 - P*r/EMI) / log(1+r)
 * Returns null if the EMI is too low to cover even the first month's interest.
 * @param {number} principal
 * @param {number} annualRate
 * @param {number} emi
 * @returns {number|null}
 */
function calcTenure(principal, annualRate, emi) {
  const r = annualRate / (12 * 100);
  let n;
  if (r === 0) {
    n = principal / emi;
  } else {
    const minEMI = principal * r; // interest-only payment
    if (emi <= minEMI) return null; // EMI too low — loan never repays
    n = -Math.log(1 - (principal * r) / emi) / Math.log(1 + r);
  }
  // An EMI that fits a whole number of months exactly comes out a hair over
  // it in floating point; without the tolerance that is an extra month.
  return Math.ceil(n - 1e-9);
}

/* ── Number Formatting ────────────────────────────────────── */
/**
 * Format a number in Indian numbering system with रू prefix.
 * Converts large numbers to lakh/crore shorthand.
 * @param {number} n
 * @param {boolean} [short=false] - Use lakh/crore shorthand
 * @returns {string}
 */
function fmt(n, short = false) {
  if (short) {
    if (n >= 10000000) return "रू " + (n / 10000000).toFixed(2) + " Cr";
    if (n >= 100000) return "रू " + (n / 100000).toFixed(2) + " L";
  }
  return "रू " + Math.round(n).toLocaleString("en-IN");
}

/** Short version for table / chart labels */
function fmtS(n) {
  if (n >= 10000000) return "रू " + (n / 10000000).toFixed(1) + "Cr";
  if (n >= 100000) return "रू " + (n / 100000).toFixed(1) + "L";
  return "रू " + Math.round(n).toLocaleString("en-IN");
}

/* ── Tenure Dial (custom rotary control) ──────────────────────
 * Replaces the old <input type="range"> for tenure. Sweeps 270°
 * (leaving a 90° gap at the bottom), draggable + keyboard accessible.
 */
const DIAL_MIN = 1;
const DIAL_MAX = 360;
const DIAL_START_ANGLE = -135; // degrees, 0 = top, clockwise positive
const DIAL_SWEEP = 270;
const DIAL_R = 82;
const DIAL_CX = 100;
const DIAL_CY = 100;

let tenureMonths = 60;
let dialDragging = false;

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180; // -90 so 0deg = top
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  if (endAngle - startAngle >= 359.99) endAngle = startAngle + 359.99;
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function valueToAngle(value) {
  const clamped = Math.min(DIAL_MAX, Math.max(DIAL_MIN, value));
  return (
    DIAL_START_ANGLE +
    ((clamped - DIAL_MIN) / (DIAL_MAX - DIAL_MIN)) * DIAL_SWEEP
  );
}

function angleFromPointer(clientX, clientY, svgEl) {
  const rect = svgEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  let angle = (Math.atan2(dx, -dy) * 180) / Math.PI; // 0 = top, clockwise
  if (angle < DIAL_START_ANGLE) angle += 360;
  const endAngle = DIAL_START_ANGLE + DIAL_SWEEP;
  if (angle > endAngle) {
    // Snap to nearer end when dragging past the gap
    const distToStart = Math.abs(angle - 360 - DIAL_START_ANGLE);
    const distToEnd = Math.abs(angle - endAngle);
    angle = distToStart < distToEnd ? DIAL_START_ANGLE : endAngle;
  }
  return Math.max(DIAL_START_ANGLE, Math.min(endAngle, angle));
}

function setTenure(value, skipCompute) {
  tenureMonths = Math.round(Math.min(DIAL_MAX, Math.max(DIAL_MIN, value)));

  const track = document.getElementById("dialTrack");
  const progress = document.getElementById("dialProgress");
  const thumb = document.getElementById("dialThumb");
  const dial = document.getElementById("tenureDial");

  const endAngle = DIAL_START_ANGLE + DIAL_SWEEP;
  const valueAngle = valueToAngle(tenureMonths);

  if (track) track.setAttribute("d", describeArc(DIAL_CX, DIAL_CY, DIAL_R, DIAL_START_ANGLE, endAngle));
  if (progress) progress.setAttribute("d", describeArc(DIAL_CX, DIAL_CY, DIAL_R, DIAL_START_ANGLE, valueAngle));

  if (thumb) {
    const pos = polarToCartesian(DIAL_CX, DIAL_CY, DIAL_R, valueAngle);
    thumb.setAttribute("cx", pos.x);
    thumb.setAttribute("cy", pos.y);
  }

  if (dial) {
    dial.setAttribute("aria-valuenow", tenureMonths);
    dial.setAttribute("aria-valuetext", tenureMonths + " months");
  }

  const center = document.getElementById("dialCenter");
  if (center) {
    if (tenureMonths > 12) {
      const years = Math.floor(tenureMonths / 12);
      const rem = tenureMonths % 12;
      const monthsRow = rem
        ? `<div class="dial-split-row">
             <span class="dial-value-sm">${rem}</span>
             <span class="dial-unit">${rem === 1 ? "month" : "months"}</span>
           </div>`
        : "";
      center.innerHTML = `
        <div class="dial-split-row">
          <span class="dial-value-sm">${years}</span>
          <span class="dial-unit">${years === 1 ? "year" : "years"}</span>
        </div>${monthsRow}`;

      if (rem) {
        centerYearsRow();
      } else {
        center.style.transform = ""; // only row left — plain centering already lands it dead-center
      }
    } else {
      center.style.transform = ""; // revert to plain CSS centering
      center.innerHTML = `
        <span class="dial-value" id="tenureDisplay">${tenureMonths}</span>
        <span class="dial-unit">${tenureMonths === 1 ? "month" : "months"}</span>`;
    }
  }

  if (!skipCompute) compute();
}

/**
 * Pins the vertical center of the "years" row to the dial's true
 * geometric center (the widest point of the circular arc), rather
 * than the center of the whole two-row text block. The offset only
 * depends on fixed font sizes/line-heights, so it's measured once
 * and cached.
 */
let yearsCenterOffsetPx = null;

function centerYearsRow() {
  const circle = document.querySelector(".dial-circle");
  const center = document.getElementById("dialCenter");
  const yearsRow = center && center.querySelector(".dial-split-row:first-child");
  if (!circle || !center || !yearsRow) return;

  if (yearsCenterOffsetPx === null) {
    center.style.transform = ""; // measure against plain, un-shifted centering first
    const circleRect = circle.getBoundingClientRect();
    const yearsRect = yearsRow.getBoundingClientRect();
    const circleCenterY = circleRect.top + circleRect.height / 2;
    const yearsCenterY = yearsRect.top + yearsRect.height / 2;
    yearsCenterOffsetPx = circleCenterY - yearsCenterY;
  }

  center.style.transform = `translate(-50%, calc(-50% + ${yearsCenterOffsetPx}px))`;
}

function dialValueFromEvent(e) {
  const dial = document.getElementById("tenureDial");
  const angle = angleFromPointer(e.clientX, e.clientY, dial);
  const ratio = (angle - DIAL_START_ANGLE) / DIAL_SWEEP;
  return DIAL_MIN + ratio * (DIAL_MAX - DIAL_MIN);
}

function initDial() {
  const dial = document.getElementById("tenureDial");
  if (!dial) return;

  const onMove = (e) => {
    if (!dialDragging) return;
    setTenure(dialValueFromEvent(e));
    e.preventDefault();
  };
  const onUp = () => {
    dialDragging = false;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };

  dial.addEventListener("pointerdown", (e) => {
    dialDragging = true;
    setTenure(dialValueFromEvent(e));
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    e.preventDefault();
  });

  dial.addEventListener("keydown", (e) => {
    const bigStep = 12;
    switch (e.key) {
      case "ArrowUp":
      case "ArrowRight":
        setTenure(tenureMonths + 1);
        break;
      case "ArrowDown":
      case "ArrowLeft":
        setTenure(tenureMonths - 1);
        break;
      case "PageUp":
        setTenure(tenureMonths + bigStep);
        break;
      case "PageDown":
        setTenure(tenureMonths - bigStep);
        break;
      case "Home":
        setTenure(DIAL_MIN);
        break;
      case "End":
        setTenure(DIAL_MAX);
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  setTenure(tenureMonths, true);
}

/* ── Core EMI Calculation ─────────────────────────────────── */
/**
 * Calculates Equated Monthly Installment (EMI).
 * Formula: EMI = P × r × (1+r)^n / ((1+r)^n − 1)
 * @param {number} principal  - Loan amount
 * @param {number} annualRate - Annual interest rate in %
 * @param {number} months     - Tenure in months
 * @returns {{emi: number, totalPayable: number, totalInterest: number}}
 */
function calcEMI(principal, annualRate, months) {
  const r = annualRate / (12 * 100);
  let emi;
  if (r === 0) {
    emi = principal / months;
  } else {
    const pow = Math.pow(1 + r, months);
    emi = (principal * r * pow) / (pow - 1);
  }
  const totalPayable = emi * months;
  const totalInterest = totalPayable - principal;
  return { emi, totalPayable, totalInterest };
}

/**
 * Builds the full amortization schedule row by row. No month pays more than
 * is owed, so when the tenure was rounded up to whole months the last
 * payment is the part-EMI that clears the balance.
 * @param {number} principal
 * @param {number} annualRate
 * @param {number} months
 * @param {number} emi
 * @returns {Array<{month, emi, interest, principal, balance, pctPaid}>}
 */
function buildSchedule(principal, annualRate, months, emi) {
  const r = annualRate / (12 * 100);
  const rows = [];
  let balance = principal;

  for (let i = 1; i <= months; i++) {
    const interest = balance * r;
    const payment = i === months ? balance + interest : Math.min(emi, balance + interest);
    const prinPaid = payment - interest;
    balance = Math.max(0, balance - prinPaid);
    const pctPaid = Math.min(100, ((principal - balance) / principal) * 100);

    rows.push({
      month: i,
      emi: payment,
      interest: interest,
      principal: prinPaid,
      balance: balance,
      pctPaid: pctPaid,
    });
  }
  return rows;
}

/* ── Chart Rendering ──────────────────────────────────────── */
function renderChart(rows) {
  const n = rows.length;
  const step = n <= 24 ? 1 : n <= 60 ? 3 : n <= 120 ? 6 : 12;

  const labels = [];
  const princArr = [];
  const intArr = [];

  for (let i = 0; i < n; i += step) {
    const r = rows[i];
    labels.push("M" + r.month);
    princArr.push(Math.round(r.principal));
    intArr.push(Math.round(r.interest));
  }

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const gridColor = isDark ? "rgba(255,255,240,0.08)" : "rgba(30,30,20,0.07)";
  const tickColor = isDark ? "#888780" : "#888780";

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  chartInstance = new Chart(document.getElementById("loanChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Principal",
          data: princArr,
          backgroundColor: "#1D9E75",
          borderRadius: 2,
          borderSkipped: false,
        },
        {
          label: "Interest",
          data: intArr,
          backgroundColor: "#185FA5",
          borderRadius: 2,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ctx.dataset.label + ": " + fmtS(ctx.raw),
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: tickColor, font: { size: 10 }, maxRotation: 45 },
          grid: { display: false },
        },
        y: {
          stacked: true,
          ticks: {
            color: tickColor,
            font: { size: 10 },
            callback: (v) => fmtS(v),
          },
          grid: { color: gridColor },
        },
      },
    },
  });
}

/* ── Table Rendering ──────────────────────────────────────── */
function renderTable(rows, principal) {
  const tbody = document.getElementById("schedBody");
  const rowCount = document.getElementById("rowCount");
  rowCount.textContent = rows.length + " payments";

  const fragment = document.createDocumentFragment();

  rows.forEach((r) => {
    const pct = Math.round(r.pctPaid);
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td class="muted">${r.month}</td>
      <td>${fmtS(r.emi)}</td>
      <td class="blue">${fmtS(r.interest)}</td>
      <td class="green">${fmtS(r.principal)}</td>
      <td>${fmtS(r.balance)}</td>
      <td>
        <div class="progress-wrap">
          <div class="progress-track">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
          <span class="progress-pct">${pct}%</span>
        </div>
      </td>`;

    fragment.appendChild(tr);
  });

  tbody.innerHTML = "";
  tbody.appendChild(fragment);
}

/* ── Main Compute Function ────────────────────────────────── */
function compute() {
  const principal = parseFloat(document.getElementById("loanAmt").value) || 0;
  const annualRate =
    parseFloat(document.getElementById("rateSlider").value) || 0;

  if (!principal || !annualRate) return;

  let months, emi;

  if (calcMode === "tenure") {
    /* Reverse mode: user sets EMI, we find tenure */
    emi = parseFloat(document.getElementById("emiAmt").value) || 0;
    if (!emi) return;

    const result = calcTenure(principal, annualRate, emi);
    const hint = document.getElementById("emiHint");

    if (result === null || result > 1200) {
      // EMI too low
      const minEMI = (principal * annualRate) / (12 * 100);
      hint.textContent =
        "EMI must be above " +
        fmt(minEMI, true) +
        " to cover monthly interest.";
      hint.style.color = "var(--amber)";
      document.getElementById("mEMI").textContent = "-";
      document.getElementById("mInt").textContent = "-";
      document.getElementById("mTotal").textContent = "-";
      document.getElementById("mRatio").textContent = "-";
      document.getElementById("mTenure").textContent = "-";
      return;
    }

    months = result;
    hint.textContent = "";

    const years = Math.floor(months / 12);
    const rem = months % 12;
    const tenureLabel =
      (years > 0 ? years + " yr" + (years > 1 ? "s" : "") : "") +
      (rem > 0 ? (years > 0 ? " " : "") + rem + " mo" : "");

    document.getElementById("mTenure").textContent = tenureLabel;
  } else {
    /* Normal mode: user sets tenure, we find EMI */
    months = tenureMonths || 0;
    if (!months) return;
    const result = calcEMI(principal, annualRate, months);
    emi = result.emi;
  }

  const schedule = buildSchedule(principal, annualRate, months, emi);
  const totalPayable = schedule.reduce((sum, row) => sum + row.emi, 0);
  const totalInterest = totalPayable - principal;
  const ratio = ((totalInterest / principal) * 100).toFixed(1);

  /* Update metric cards */
  document.getElementById("mEMI").textContent = fmt(emi, true) + "/mo";
  document.getElementById("mInt").textContent = fmt(totalInterest, true);
  document.getElementById("mTotal").textContent = fmt(totalPayable, true);
  document.getElementById("mRatio").textContent = ratio + "%";

  lastSchedule = schedule;
  renderChart(schedule);
  renderTable(schedule, principal);
}

/* ── Theme Toggle ─────────────────────────────────────────── */
function toggleTheme() {
  const root = document.documentElement;
  const isDark = root.getAttribute("data-theme") === "dark";
  const newMode = isDark ? "light" : "dark";

  root.setAttribute("data-theme", newMode);

  const icon = document.getElementById("themeIcon");
  if (icon) icon.className = isDark ? "ti ti-moon" : "ti ti-sun";

  /* Re-render the chart on screen with updated grid colors */
  if (lastSchedule) renderChart(lastSchedule);

  /* Persist preference */
  try {
    localStorage.setItem("simloan-theme", newMode);
  } catch (e) {}
}

/* ── Restore Saved Theme ──────────────────────────────────── */
(function restoreTheme() {
  try {
    const saved = localStorage.getItem("simloan-theme");
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    const useDark = saved ? saved === "dark" : prefersDark;

    if (useDark) {
      document.documentElement.setAttribute("data-theme", "dark");
      const icon = document.getElementById("themeIcon");
      if (icon) icon.className = "ti ti-sun";
    }
  } catch (e) {}
})();

/* ── Smooth Nav Link Highlighting ─────────────────────────── */
document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    document
      .querySelectorAll(".nav-link")
      .forEach((l) => l.classList.remove("active"));
    link.classList.add("active");
  });
});

/* ── Init on DOM Ready ────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  initDial();
  setMode("tenure");
});

/* Expose globally for inline oninput handlers */
window.compute = compute;
window.toggleTheme = toggleTheme;
window.setMode = setMode;
