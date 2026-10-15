/*
 * The arithmetic behind Bank vs. Relative, kept apart from the sliders, the
 * dial and the chart so it can be tested on its own. The page's inline script
 * reads the inputs into `p` and calls these.
 *
 *   p.principal  loan balance today
 *   p.rbank      bank's annual rate, as a fraction (0.09 for 9%)
 *   p.monthly    the normal monthly payment
 *   p.nmonths    months the relative holds the money (N)
 *   p.rrel       relative's annual simple-interest rate, as a fraction
 */

/* Month-by-month balances: A pays the bank in full, B lends in month 1. */
function simulate(p, lentAmount) {
  const i_bank = p.rbank / 12;
  const horizon = Math.max(p.nmonths, 1);
  let A = [],
    B = [];
  let balA = p.principal,
    balB = p.principal;

  for (let m = 1; m <= horizon; m++) {
    let interestA = balA * i_bank;
    let payA = p.monthly;
    balA = balA + interestA - payA;
    if (balA < 0) balA = 0;
    A.push({
      month: m,
      payment: payA,
      balance: balA,
      interest: interestA,
    });

    let interestB = balB * i_bank;
    let payB = p.monthly;
    let note = "";
    if (m === 1) {
      payB = Math.max(p.monthly - lentAmount, 0);
      note =
        lentAmount > 0
          ? `Lent रु ${Math.round(lentAmount).toLocaleString("en-IN")} to relative`
          : "";
    }
    if (m === p.nmonths && lentAmount > 0) {
      const repay = lentAmount * (1 + p.rrel * (p.nmonths / 12));
      payB = payB + repay;
      note =
        (note ? note + "; " : "") +
        `Relative repays रु ${Math.round(repay).toLocaleString("en-IN")}`;
    }
    balB = balB + interestB - payB;
    if (balB < 0) balB = 0;
    B.push({
      month: m,
      payment: payB,
      balance: balB,
      interest: interestB,
      note,
    });
  }
  return { A, B };
}

/*
 * The relative's annual rate, between `lo` and `hi`, at which lending leaves
 * the same balance at month N as paying the bank in full.
 *
 * The question is a rate and not an amount because the gap between the two
 * scenarios is proportional to the amount lent: lending twice as much doubles
 * whatever it gains or loses, so no amount ever breaks even unless every
 * amount does. The rate is where the gap changes sign.
 *
 * Returns { rate } or, when no rate in range breaks even, { rate: null,
 * winner }, where winner is "lend" (lending wins even at `lo`), "bank"
 * (paying the bank wins even at `hi`) or "neither" (the loan is cleared by
 * month N either way, so lending changes nothing).
 */
function findBreakevenRate(p, lentAmount, lo, hi) {
  const n = Math.max(p.nmonths, 1);
  const gap = (rate) => {
    const { A, B } = simulate({ ...p, rrel: rate }, lentAmount);
    return B[n - 1].balance - A[n - 1].balance;
  };
  let gapLo = gap(lo);
  const gapHi = gap(hi);
  if (gapLo === 0 && gapHi === 0) return { rate: null, winner: "neither" };
  if (gapLo < 0 && gapHi < 0) return { rate: null, winner: "lend" };
  if (gapLo > 0 && gapHi > 0) return { rate: null, winner: "bank" };
  if (gapLo === 0) return { rate: lo };
  if (gapHi === 0) return { rate: hi };
  for (let iter = 0; iter < 100; iter++) {
    const mid = (lo + hi) / 2;
    const g = gap(mid);
    if (g === 0) return { rate: mid };
    if (Math.sign(g) === Math.sign(gapLo)) {
      lo = mid;
      gapLo = g;
    } else {
      hi = mid;
    }
  }
  return { rate: (lo + hi) / 2 };
}
