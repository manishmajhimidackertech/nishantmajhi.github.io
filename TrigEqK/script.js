document.addEventListener("DOMContentLoaded", function () {
  var input = document.getElementById("equation");
  var btn = document.getElementById("check-btn");

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      run();
    }
  });

  btn.addEventListener("click", run);

  // Tab switching
  document.querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (t) {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      document.querySelectorAll("[role='tabpanel']").forEach(function (p) {
        p.hidden = true;
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      var panelId = tab.getAttribute("aria-controls");
      document.getElementById(panelId).hidden = false;
    });
  });
});

function run() {
  var input = document.getElementById("equation");
  var value = input.value.trim();

  if (!value) {
    showInputError(input, "Please enter an equation.");
    return;
  }
  if (!value.includes("=")) {
    showInputError(
      input,
      'Equation must contain "=" - e.g. sin(x)^2 + cos(x)^2 = 1',
    );
    return;
  }

  var parts = value.split("=");
  var lhs = parts[0].trim();
  var rhs = parts.slice(1).join("=").trim();

  if (!lhs || !rhs) {
    showInputError(input, 'Both sides of the "=" must be non-empty.');
    return;
  }

  clearInputError(input);

  var standardAngles = [
    0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330,
    360,
  ];
  var randomAngles = getRandomAngles(standardAngles.length);

  var stdResults = fillTable("standard", standardAngles, lhs, rhs);
  var rndResults = fillTable("random", randomAngles, lhs, rhs);

  updateSummary(stdResults, rndResults);
  showResults();
}

// ── Table filling ─────────────────────────────────────────────────────────────

function fillTable(tableId, angles, lhs, rhs) {
  var tbody = document.querySelector("#" + tableId + " tbody");
  tbody.innerHTML = "";

  var passCount = 0;

  angles.forEach(function (angle, i) {
    var result = testExpression(angle, lhs, rhs);
    if (result.pass) passCount++;

    var row = document.createElement("tr");

    var lhsDisplay = formatValue(result.lhs);
    var rhsDisplay = formatValue(result.rhs);
    var isError = result.lhs === "Error";

    row.innerHTML =
      "<td>" +
      (i + 1) +
      "</td>" +
      "<td>" +
      formatAngle(angle) +
      "</td>" +
      '<td class="' +
      (isError ? "error-cell" : "") +
      '">' +
      lhsDisplay +
      "</td>" +
      '<td class="' +
      (isError ? "error-cell" : "") +
      '">' +
      rhsDisplay +
      "</td>" +
      '<td><span class="' +
      (result.pass ? "pass-cell" : "fail-cell") +
      '" ' +
      'aria-label="' +
      (result.pass ? "Pass" : "Fail") +
      '">' +
      (result.pass ? "Pass" : "Fail") +
      "</span></td>";

    tbody.appendChild(row);
  });

  return { pass: passCount, total: angles.length };
}

// ── Summary & visibility ───────────────────────────────────────────────────────

function updateSummary(std, rnd) {
  var totalPass = std.pass + rnd.pass;
  var totalTests = std.total + rnd.total;
  var allPass = totalPass === totalTests;

  var banner = document.getElementById("summary-banner");
  var icon = document.getElementById("summary-icon");
  var text = document.getElementById("summary-text");

  banner.className = "summary-banner " + (allPass ? "pass" : "fail");
  icon.textContent = allPass ? "✓" : "✗";
  text.textContent = allPass
    ? totalPass +
      " / " +
      totalTests +
      " tests passed - equation verified across all angles."
    : totalPass +
      " / " +
      totalTests +
      " tests passed - equation fails for some angles. Check the table for details.";

  // Update tab badges
  document.getElementById("badge-standard").textContent =
    std.pass + "/" + std.total;
  document.getElementById("badge-random").textContent =
    rnd.pass + "/" + rnd.total;

  // Announce to screen readers
  var live = document.getElementById("live-announce");
  live.textContent = "";
  setTimeout(function () {
    live.textContent =
      (allPass ? "Equation verified. " : "Equation failed. ") +
      totalPass +
      " of " +
      totalTests +
      " tests passed.";
  }, 50);
}

function showResults() {
  document.getElementById("empty-state").hidden = true;
  document.getElementById("results").hidden = false;

  // Reset to standard tab
  document.getElementById("tab-standard").click();
}

// ── Math evaluation (uses math.js) ────────────────────────────────────────────

function testExpression(angle, lhs, rhs) {
  try {
    var rad = (angle * Math.PI) / 180;
    var scope = { x: rad };

    var lhsVal = mathjs_evaluate(lhs, scope);
    var rhsVal = mathjs_evaluate(rhs, scope);

    return { lhs: lhsVal, rhs: rhsVal, pass: valuesAgree(lhsVal, rhsVal) };
  } catch (e) {
    return { lhs: "Error", rhs: "Error", pass: false };
  }
}

// Past this size a value is an asymptote that floating point could not reach:
// tan(90°) comes out as 1.6e16, not Infinity.
var UNDEFINED_BEYOND = 1e10;

function isUndefinedValue(val) {
  return !isFinite(val) || Math.abs(val) > UNDEFINED_BEYOND;
}

// Equal to within a relative tolerance, so that two sides of an identity
// agree near an asymptote too, where the values are large and their last
// digits differ. Both sides undefined at an angle (tan(2x) at 45°, say)
// counts as agreeing; only one of them undefined does not.
function numbersAgree(a, b) {
  var aUndef = isUndefinedValue(a);
  var bUndef = isUndefinedValue(b);
  if (aUndef || bUndef) return aUndef && bUndef;
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

// math.js answers with a Complex for sqrt(-1), a Unit for "5 cm", and so on.
// Those are compared as what they are, not waved through as "not finite".
function valuesAgree(a, b) {
  if (typeof a === "number" && typeof b === "number") return numbersAgree(a, b);
  if (isComplexOrNumber(a) && isComplexOrNumber(b)) {
    var ca = math.complex(a);
    var cb = math.complex(b);
    return numbersAgree(ca.re, cb.re) && numbersAgree(ca.im, cb.im);
  }
  try {
    var same = math.equal(a, b); // a boolean for units, a matrix for matrices
    return typeof same === "boolean" ? same : math.deepEqual(a, b) === true;
  } catch (e) {
    return false; // values math.js cannot compare, such as a unit and a number
  }
}

function isComplexOrNumber(val) {
  return typeof val === "number" || math.isComplex(val);
}

function mathjs_evaluate(expr, scope) {
  // math.js knows sec, csc and cot (and asec, sech...) but not the "cosec"
  // spelling, so that one is renamed and everything else is left to it.
  var expanded = expr.toLowerCase().replace(/\bcosec\s*\(/g, "csc(");
  return math.evaluate(expanded, scope);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRandomAngles(count) {
  var result = [];
  for (var i = 0; i < count; i++) {
    result.push(parseFloat((Math.random() * 360).toFixed(2)));
  }
  return result;
}

function formatAngle(angle) {
  // Show integers cleanly, decimals to 2dp
  return (Number.isInteger(angle) ? angle : angle.toFixed(2)) + "°";
}

function formatValue(val) {
  if (val === "Error") return "Error";
  if (!isFinite(val)) return val > 0 ? "+∞" : val < 0 ? "−∞" : "undefined";
  // Round to 8 significant figures to avoid floating-point noise
  return parseFloat(val.toPrecision(8)).toString();
}

// ── Input error helpers ───────────────────────────────────────────────────────

function showInputError(input, msg) {
  clearInputError(input);
  input.style.borderColor = "var(--red)";
  input.style.boxShadow = "0 0 0 3px rgba(220,38,38,.15)";
  var err = document.createElement("p");
  err.id = "input-error";
  err.style.cssText = "color:var(--red);font-size:0.8125rem;margin-top:0.4rem;";
  err.textContent = msg;
  input.closest(".input-section").appendChild(err);
  input.setAttribute("aria-describedby", "input-error");
  input.focus();
}

function clearInputError(input) {
  input.style.borderColor = "";
  input.style.boxShadow = "";
  input.removeAttribute("aria-describedby");
  var existing = document.getElementById("input-error");
  if (existing) existing.remove();
}
