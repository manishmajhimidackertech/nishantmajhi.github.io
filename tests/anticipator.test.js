"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./harness");

const SUBJECTS = ["English", "Nepali", "Samajik", "Mathematics", "Science", "Optional I", "Optional II"];

/*
 * Just enough of Anticipator/index.html for its script: a row per subject
 * with a theory and a practical input, a grade-point cell and a final-grade
 * cell, and the two footer cells. The row count is read from the real page
 * so the fake cannot drift from it.
 */
function gradeSheet(rows = SUBJECTS.length) {
  const byId = { final_gpa: { textContent: "" }, final_grade: { textContent: "" } };
  const table = [];
  for (let i = 0; i < rows; i++) {
    const row = { gradePoint: { textContent: "" }, finalGrade: { textContent: "" } };
    const input = () => ({ value: "0", closest: () => row.tr });
    row.theory = input();
    row.practical = input();
    row.tr = {
      querySelector(sel) {
        return {
          ".theory > input": row.theory,
          ".practical > input": row.practical,
          ".grade-point": row.gradePoint,
          ".final-grade": row.finalGrade,
        }[sel];
      },
    };
    table.push(row);
  }
  const document = {
    getElementById: (id) => byId[id],
    querySelectorAll(sel) {
      if (sel === ".grade-point") return table.map((r) => r.gradePoint);
      if (sel === ".theory > input") return table.map((r) => r.theory);
      if (sel === ".practical > input") return table.map((r) => r.practical);
      throw new Error(`unexpected selector ${sel}`);
    },
  };
  return { document, table, byId };
}

function sheet(rev) {
  const page = gradeSheet();
  const ctx = load("Anticipator/js/script.js", { rev, globals: { document: page.document } });
  /* Type a theory and practical grade into a row, as onchange would see it. */
  page.enter = (i, theory, practical) => {
    page.table[i].theory.value = String(theory);
    page.table[i].practical.value = String(practical);
    ctx.calculateAverage(page.table[i].theory);
  };
  return { ctx, page };
}

test("the page really has seven subject rows", () => {
  const html = require("./harness").readSource("Anticipator/index.html");
  assert.equal((html.match(/class="grade-point"/g) || []).length, SUBJECTS.length);
});

test("regression: straight 4.0s give a GPA of 4.00, not 7.00", () => {
  for (const rev of ["working", "original"]) {
    const { page } = sheet(rev);
    for (let i = 0; i < SUBJECTS.length; i++) page.enter(i, 4, 4);
    if (rev === "working") {
      assert.equal(page.byId.final_gpa.textContent, "4.00");
      assert.equal(page.byId.final_grade.textContent, "A+");
    } else {
      assert.equal(page.byId.final_gpa.textContent, "7.00", "the original divided seven subjects by four");
    }
  }
});

test("regression: a below-average sheet is not graded A+", () => {
  // Every subject a C+ (2.0): the GPA is 2.00 and the grade C+.
  for (const rev of ["working", "original"]) {
    const { page } = sheet(rev);
    for (let i = 0; i < SUBJECTS.length; i++) page.enter(i, 2, 2);
    if (rev === "working") {
      assert.equal(page.byId.final_gpa.textContent, "2.00");
      assert.equal(page.byId.final_grade.textContent, "C+");
    } else {
      assert.equal(page.byId.final_grade.textContent, "A", "3.50, from 14 / 4");
    }
  }
});

test("the GPA is the mean of the seven grade points", () => {
  const { page } = sheet("working");
  const points = [4, 3.6, 3.2, 2.8, 2.4, 2.0, 1.6];
  points.forEach((p, i) => page.enter(i, p, p));
  assert.equal(page.byId.final_gpa.textContent, "2.80");
  assert.equal(page.byId.final_grade.textContent, "B+");
});

test("a subject's grade point is the mean of its theory and practical grades", () => {
  const { page } = sheet("working");
  page.enter(0, 3.2, 4);
  assert.equal(page.table[0].gradePoint.textContent, "3.60");
  assert.equal(page.table[0].finalGrade.textContent, "A+");
});

test("no GPA is shown until every subject has a grade point", () => {
  const { page } = sheet("working");
  for (let i = 0; i < SUBJECTS.length - 1; i++) page.enter(i, 4, 4);
  assert.equal(page.byId.final_gpa.textContent, "");
  assert.equal(page.byId.final_grade.textContent, "");
  page.enter(SUBJECTS.length - 1, 4, 4);
  assert.equal(page.byId.final_gpa.textContent, "4.00");
});

test("gradePointAverage is null for an empty or incomplete sheet", () => {
  const { ctx } = sheet("working");
  assert.equal(ctx.gradePointAverage([]), null);
  assert.equal(ctx.gradePointAverage([4, NaN, 3]), null);
  assert.equal(ctx.gradePointAverage([4, 3]), 3.5);
});

test("the grade boundaries are the ones the scale lists", () => {
  const { ctx } = sheet("working");
  const cases = [
    [4, "A+"], [3.6, "A+"], [3.59, "A"], [3.2, "A"], [3.19, "B+"], [2.8, "B+"],
    [2.79, "B"], [2.4, "B"], [2.39, "C+"], [2.0, "C+"], [1.99, "C"], [1.6, "C"],
    [1.59, "D+"], [1.2, "D+"], [1.19, "D"], [0.8, "D"], [0.79, "NG"], [0, "NG"],
  ];
  for (const [point, grade] of cases) assert.equal(ctx.getFinalGrade(point), grade, `grade for ${point}`);
});

test("the grade is read from the GPA as displayed, so the two always agree", () => {
  // The mean here is 25.17 / 7 = 3.5957, which shows as 3.60 and so must be
  // an A+, not the A that 3.5957 itself would be.
  const { ctx, page } = sheet("working");
  const points = [3.6, 3.6, 3.6, 3.6, 3.6, 3.6, 3.57];
  points.forEach((p, i) => page.enter(i, p, p));
  const shown = page.byId.final_gpa.textContent;
  assert.equal(shown, "3.60");
  assert.equal(page.byId.final_grade.textContent, ctx.getFinalGrade(Number(shown)));
  assert.equal(page.byId.final_grade.textContent, "A+");
});

test("Random fills every subject and produces a GPA within the scale", () => {
  for (let run = 0; run < 50; run++) {
    const { ctx, page } = sheet("working");
    ctx.populateTableWithRandomGPA();
    for (const row of page.table) {
      for (const input of [row.theory, row.practical]) {
        const v = Number(input.value);
        assert.ok(v >= 0.01 && v <= 4, `random grade ${v} outside 0.01..4`);
      }
    }
    const gpa = Number(page.byId.final_gpa.textContent);
    assert.ok(gpa > 0 && gpa <= 4, `GPA ${gpa} outside the 4-point scale`);
  }
});
