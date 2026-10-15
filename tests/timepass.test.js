"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { load, fakeDocument, FakeElement } = require("./harness");

/*
 * TimePass's real script on a fake page, with a clock the test moves by hand
 * so the one-second pause between questions can be stepped through.
 */
function quiz(rev) {
  const timers = [];
  let now = 0;
  const clock = {
    setTimeout(fn, ms = 0) {
      timers.push({ at: now + ms, fn });
      return timers.length;
    },
    clearTimeout() {},
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = timers.filter((t) => !t.done && t.at <= until).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        now = due.at;
        due.done = true;
        due.fn();
      }
      now = until;
    },
  };
  const alerts = [];
  const document = fakeDocument();
  const button = new FakeElement("button");
  const footer = new FakeElement("footer");
  document.querySelector = (sel) => (sel === "button" ? button : null);
  document.getElementsByTagName = (tag) => (tag === "footer" ? [footer] : []);
  const ctx = load("TimePass/js/script.js", {
    rev,
    globals: { document, alert: (m) => alerts.push(m), setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout },
  });
  const text = (id) => document.getElementById(id).textContent;
  const answer = (value) => {
    document.getElementById("userAnswer").value = String(value);
    ctx.checkAnswer();
  };
  /* Put a known question on screen, as if it had been drawn. */
  const pose = (question, value) => {
    ctx.currentProblem = { question, answer: value };
    ctx.currentQuestion = `What is ${question}?`;
    ctx.integerAnswer = value;
    ctx.displayQuestion();
  };
  return { ctx, clock, alerts, text, answer, pose, button };
}

const exact = (question) => Function(`return ${question};`)();

test("regression: every question has a whole-number answer, and it is the right one", () => {
  const working = quiz("working");
  for (let i = 0; i < 5000; i++) {
    const { question, answer } = working.ctx.randomProblem();
    assert.equal(answer, exact(question), `${question} = ${answer}`);
  }
  const original = quiz("original");
  const wrong = [];
  for (let i = 0; i < 5000 && !wrong.length; i++) {
    const { question, answer } = original.ctx.randomProblem();
    if (answer !== exact(question)) wrong.push(`${question} was marked ${answer}`);
  }
  assert.ok(wrong.length, "the original asked divisions with remainders and truncated the answer");
});

test("operands stay between 1 and 10, and every operation still comes up", () => {
  const { ctx } = quiz("working");
  const seen = new Set();
  for (let i = 0; i < 5000; i++) {
    const [a, op, b] = ctx.randomProblem().question.split(" ");
    seen.add(op);
    for (const n of [a, b]) assert.ok(Number(n) >= 1 && Number(n) <= 10, `operand ${n}`);
  }
  assert.deepEqual([...seen].sort(), ["*", "+", "-", "/"]);
});

test("regression: pressing Enter twice on a right answer scores once", () => {
  for (const rev of ["working", "original"]) {
    const q = quiz(rev);
    q.pose("3 + 4", 7);
    q.answer(7);
    q.answer(7); // again, before the next question has appeared
    q.clock.advance(1000);
    const score = q.text("score");
    if (rev === "working") assert.equal(score, "Score: 1");
    else assert.equal(score, "Score: 2", "the original scored the same answer twice");
  }
});

test("regression: 3.5 is not accepted as 3", () => {
  for (const rev of ["working", "original"]) {
    const q = quiz(rev);
    q.pose("6 / 2", 3);
    q.answer("3.5");
    q.clock.advance(1000);
    if (rev === "working") assert.equal(q.text("notification"), "The correct answer was 3.");
    else assert.equal(q.text("notification"), "Correct Answer!", "parseInt read 3.5 as 3");
  }
});

test("a right answer scores and moves on to a new question after a second", () => {
  const q = quiz("working");
  q.pose("3 * 4", 12);
  q.answer(12);
  assert.equal(q.text("notification"), "Correct Answer!");
  assert.equal(q.text("score"), "Score: 1");
  assert.equal(q.text("question"), "What is 3 * 4?");
  q.clock.advance(1000);
  assert.match(q.text("question"), /^What is \d+ [-+*/] \d+\?$/);
  assert.equal(q.text("question"), q.ctx.currentQuestion);
  assert.equal(q.ctx.integerAnswer, exact(q.ctx.currentProblem.question));
});

test("the next question can be answered once it is on screen", () => {
  const q = quiz("working");
  q.pose("3 + 4", 7);
  q.answer(7);
  q.clock.advance(1000);
  q.answer(q.ctx.integerAnswer);
  assert.equal(q.text("score"), "Score: 2");
});

test("a wrong answer shows the right one and resets the score", () => {
  const q = quiz("working");
  q.pose("2 + 2", 4);
  q.answer(4);
  q.clock.advance(1000);
  q.pose("9 - 3", 6);
  q.answer(5);
  assert.equal(q.text("notification"), "The correct answer was 6.");
  assert.equal(q.button.disabled, true, "the button is held while the answer is shown");
  q.clock.advance(1000);
  assert.equal(q.text("score"), "Score: 0");
  assert.equal(q.button.disabled, false);
});

test("an empty answer asks for a number and changes nothing", () => {
  const q = quiz("working");
  q.pose("2 + 2", 4);
  q.answer("");
  assert.deepEqual(q.alerts, ["Please enter a valid number."]);
  q.answer(4);
  assert.equal(q.text("score"), "Score: 1", "the empty answer did not lock the quiz");
});

test("a negative answer is accepted where it is right", () => {
  const q = quiz("working");
  q.pose("3 - 9", -6);
  q.answer("-6");
  assert.equal(q.text("score"), "Score: 1");
});
