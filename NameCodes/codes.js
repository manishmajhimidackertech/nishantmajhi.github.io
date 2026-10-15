/*
 * How a name becomes a code, kept apart from the page so it can be tested.
 * The rules are the ones the page explains under "How the code is generated";
 * the page's inline script calls buildCandidates() and draws the result.
 */

const VOWELS = new Set(["a", "e", "i", "o", "u"]);
const DIGRAPHS = [
  ["chh", "c"],
  ["ksh", "x"],
  ["bh", "b"],
  ["ch", "c"],
  ["dh", "d"],
  ["gh", "g"],
  ["jh", "j"],
  ["kh", "k"],
  ["ph", "p"],
  ["sh", "s"],
  ["th", "t"],
  ["ny", "n"],
  ["gy", "g"],
].sort((a, b) => b[0].length - a[0].length);
const MAX_LEN = 4;

function segmentName(name) {
  const lower = name.toLowerCase().replace(/[^a-z]/g, "");
  const units = [];
  let i = 0;
  while (i < lower.length) {
    let matched = null;
    for (const [pat, rep] of DIGRAPHS) {
      if (lower.startsWith(pat, i)) {
        matched = [pat, rep];
        break;
      }
    }
    if (matched) {
      units.push({
        raw: matched[0],
        rep: matched[1],
        isVowel: VOWELS.has(matched[1]),
      });
      i += matched[0].length;
    } else {
      const ch = lower[i];
      units.push({ raw: ch, rep: ch, isVowel: VOWELS.has(ch) });
      i += 1;
    }
  }
  return units.map((u, idx) => ({ ...u, idx }));
}

function decideKeep(units) {
  const n = units.length;
  return units.map((u) => ({
    ...u,
    keep: !u.isVowel || u.idx === 0 || u.idx === n - 1,
  }));
}

function applySafeguard(decided) {
  if (decided.some((u) => u.isVowel && u.keep)) return decided;
  const dropped = decided.filter((u) => u.isVowel && !u.keep);
  if (!dropped.length) return decided;
  const target = dropped[dropped.length - 1].idx;
  return decided.map((u) =>
    u.idx === target ? { ...u, keep: true } : u,
  );
}

function codeFrom(decided) {
  return decided
    .filter((u) => u.keep)
    .map((u) => u.rep)
    .join("")
    .toUpperCase();
}

function altByReinstating(decided) {
  const droppedIdx = decided
    .filter((u) => u.isVowel && !u.keep)
    .map((u) => u.idx)
    .sort((a, b) => a - b);
  if (!droppedIdx.length) return null;
  const working = decided.map((u) =>
    u.idx === droppedIdx[0] ? { ...u, keep: true } : u,
  );
  return codeFrom(working);
}

function buildCandidates(name) {
  const units = segmentName(name);
  const decided = applySafeguard(decideKeep(units));
  const natural = codeFrom(decided);
  const primary =
    natural.length > MAX_LEN ? natural.slice(0, MAX_LEN) : natural;
  let secondary;
  if (natural.length > MAX_LEN) {
    secondary = natural;
  } else {
    const alt = altByReinstating(decided);
    secondary = alt ? alt.slice(0, MAX_LEN) : null;
  }
  if (secondary === primary) secondary = null;
  return { units, decided, primary, secondary };
}
