/*
 * The homepage's moving parts: the conic in the hero that follows the
 * pointer, a small live drawing for each project, and the filter and
 * category strip over the Index. The Index itself is built by repo-index.js;
 * this file only reads what that puts on the page.
 */

(function () {
  "use strict";

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const YELLOW = "#ffe44d";
  const ink = (a) => `rgba(244,246,255,${a})`;
  const mono = (px, weight = 500) => `${weight} ${px}px "JetBrains Mono", ui-monospace, monospace`;
  const display = (px) => `800 ${px}px "Bricolage Grotesque", system-ui, sans-serif`;

  /* A canvas kept at the size of its box, in CSS pixels. */
  function fit(canvas) {
    const ctx = canvas.getContext("2d");
    const size = { w: 0, h: 0 };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size.w = canvas.clientWidth;
      size.h = canvas.clientHeight;
      canvas.width = Math.round(size.w * dpr);
      canvas.height = Math.round(size.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    new ResizeObserver(resize).observe(canvas);
    resize();
    return { ctx, size };
  }

  /*
   * The conic with focus (fx, fy), semi-latus rectum l and eccentricity e:
   * r = l / (1 - e cos θ), its directrix the vertical line l/e to the left.
   * Past e = 1 the negative radii are the hyperbola's other branch.
   */
  const radius = (l, e, th) => l / (1 - e * Math.cos(th));

  function conicPath(c, fx, fy, l, e, limit) {
    c.beginPath();
    let pen = false;
    let last = 0;
    for (let th = 0; th <= Math.PI * 2 + 0.004; th += 0.008) {
      const r = radius(l, e, th);
      if (!isFinite(r) || Math.abs(r) > limit || (pen && r * last < 0)) {
        pen = false;
        continue;
      }
      const x = fx + r * Math.cos(th);
      const y = fy + r * Math.sin(th);
      if (pen) c.lineTo(x, y);
      else c.moveTo(x, y);
      pen = true;
      last = r;
    }
  }

  const dot = (c, x, y, r, fill) => {
    c.fillStyle = fill;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  };

  const line = (c, x1, y1, x2, y2) => {
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  };

  /* -- hero ---------------------------------------------------------------- */

  function hero() {
    const sectionEl = document.getElementById("top");
    const canvas = document.getElementById("plot");
    if (!sectionEl || !canvas) return;
    const { ctx: c, size } = fit(canvas);
    const nameEl = document.getElementById("conic-name");
    const eEl = document.getElementById("conic-e");

    let e = 0.62;
    let target = null; // set by the pointer; null lets it drift on its own
    let visible = true;

    sectionEl.addEventListener("pointermove", (ev) => {
      if (ev.pointerType === "touch") return;
      const box = sectionEl.getBoundingClientRect();
      target = 0.2 + ((ev.clientX - box.left) / box.width) * 1.5;
    });
    sectionEl.addEventListener("pointerleave", () => (target = null));
    new IntersectionObserver(([entry]) => (visible = entry.isIntersecting)).observe(sectionEl);

    function draw(ms) {
      const t = ms / 1000;
      const { w, h } = size;
      const narrow = w < 700;
      const fx = w * (narrow ? 0.56 : 0.6);
      const fy = h * (narrow ? 0.34 : 0.42);
      const l = Math.min(w, h) * (narrow ? 0.2 : 0.21);

      const goal = target === null ? 0.95 + 0.6 * Math.sin(t * 0.3) : target;
      e += (goal - e) * (still ? 1 : 0.07);

      c.clearRect(0, 0, w, h);

      // axes through the focus, ticked every l/2
      c.strokeStyle = ink(0.28);
      c.lineWidth = 1;
      line(c, 0, fy, w, fy);
      line(c, fx, 0, fx, h);
      const step = l / 2;
      for (let x = fx % step; x < w; x += step) line(c, x, fy - 3, x, fy + 3);
      for (let y = fy % step; y < h; y += step) line(c, fx - 3, y, fx + 3, y);

      // directrix
      const dx = fx - l / e;
      c.setLineDash([7, 7]);
      c.strokeStyle = ink(0.6);
      line(c, dx, 0, dx, h);
      c.setLineDash([]);

      // the curve
      c.strokeStyle = YELLOW;
      c.lineWidth = narrow ? 2 : 2.5;
      conicPath(c, fx, fy, l, e, Math.max(w, h) * 2);
      c.stroke();

      // a point on it, with its distance to the focus and to the directrix
      const th = still ? 2.2 : t * 0.45;
      const r = radius(l, e, th);
      if (isFinite(r) && Math.abs(r) < Math.max(w, h)) {
        const px = fx + r * Math.cos(th);
        const py = fy + r * Math.sin(th);
        c.lineWidth = 1.25;
        c.strokeStyle = ink(0.95);
        line(c, fx, fy, px, py);
        c.setLineDash([3, 5]);
        line(c, dx, py, px, py);
        c.setLineDash([]);
        dot(c, dx, py, 3, ink(0.95));
        dot(c, px, py, 6, YELLOW);
        c.font = mono(11);
        c.fillStyle = ink(0.9);
        c.fillText("P", px + 10, py - 10);
        c.fillText("D", dx + 8, py - 8);
      }

      dot(c, fx, fy, 4.5, ink(1));
      c.font = mono(11);
      c.fillStyle = ink(0.9);
      c.fillText("F", fx + 9, fy + 18);

      const name = e < 0.97 ? "ELLIPSE" : e <= 1.03 ? "PARABOLA" : "HYPERBOLA";
      if (nameEl.textContent !== name) nameEl.textContent = name;
      eEl.textContent = e.toFixed(2);
    }

    if (still) {
      draw(0);
      addEventListener("resize", () => draw(0));
      return;
    }
    const loop = (ms) => {
      if (visible) draw(ms);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /* -- one small drawing per project --------------------------------------- */

  // The same "random" points on every visit (mulberry32, fixed seed).
  const scatter = (() => {
    let a = 0x9e3779b9;
    const next = () => {
      a = (a + 0x6d2b79f5) | 0;
      let x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    return Array.from({ length: 1200 }, next);
  })();
  const ease = (p) => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);

  const demos = {
    "recursion-in-multiplication"(c, w, h, t) {
      const depth = Math.min(1, (t % 7) / 4.5) * 6;
      c.lineWidth = 1.3;
      const branch = (x, y, len, a, d) => {
        if (d >= depth) return;
        const k = Math.min(1, depth - d);
        const x2 = x + Math.cos(a) * len * k;
        const y2 = y + Math.sin(a) * len * k;
        c.strokeStyle = ink(0.95 - d * 0.1);
        line(c, x, y, x2, y2);
        if (k < 1) return;
        if (d === 5) return dot(c, x2, y2, 2, YELLOW);
        branch(x2, y2, len * 0.74, a - 0.48, d + 1);
        branch(x2, y2, len * 0.74, a + 0.48, d + 1);
      };
      branch(w / 2, h * 0.94, h * 0.24, -Math.PI / 2, 0);
    },

    ConicSections(c, w, h, t) {
      const e = 0.95 + 0.7 * Math.sin(t * 0.6);
      const fx = w * 0.55, fy = h * 0.5, l = h * 0.2;
      c.strokeStyle = ink(0.3);
      c.lineWidth = 1;
      line(c, 0, fy, w, fy);
      c.setLineDash([5, 5]);
      line(c, fx - l / e, 0, fx - l / e, h);
      c.setLineDash([]);
      c.strokeStyle = YELLOW;
      c.lineWidth = 2;
      conicPath(c, fx, fy, l, e, w * 2);
      c.stroke();
      dot(c, fx, fy, 3, ink(1));
    },

    "termlink-trials"(c, w, h, t) {
      const script = ['$ printf "\\e[1;33m"', "$ echo ACCESS GRANTED", "ACCESS GRANTED"];
      let n = Math.floor((t % 6.5) * 13);
      const x = w * 0.1;
      let y = h * 0.36;
      c.font = mono(Math.max(12, w * 0.036));
      const lh = Math.max(20, w * 0.062);
      for (let i = 0; i < script.length; i++) {
        const out = i === 2;
        if (out && n < 4) break;
        const shown = out ? script[i] : script[i].slice(0, n);
        c.fillStyle = out ? YELLOW : ink(0.92);
        c.fillText(shown, x, y);
        const done = out || n >= script[i].length;
        if (!done || i === script.length - 1) {
          if (Math.floor(t * 2.5) % 2 === 0) {
            const cx = out ? x : x + c.measureText(shown).width + 2;
            const cy = out ? y + lh : y;
            c.fillStyle = YELLOW;
            c.fillRect(cx, cy - lh * 0.55, lh * 0.38, lh * 0.68);
          }
          break;
        }
        n -= script[i].length;
        y += lh;
      }
    },

    TrigEqK(c, w, h, t) {
      const r = h * 0.3, cx = w * 0.25, cy = h * 0.5, a = t * 1.3;
      const px = cx + r * Math.cos(a), py = cy - r * Math.sin(a);
      const x0 = cx + r + w * 0.07;
      c.lineWidth = 1;
      c.strokeStyle = ink(0.3);
      line(c, w * 0.05, cy, w * 0.95, cy);
      line(c, cx, cy - r - 10, cx, cy + r + 10);
      c.strokeStyle = ink(0.8);
      c.lineWidth = 1.3;
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      for (let x = x0; x < w * 0.95; x += 2) {
        const y = cy - r * Math.sin(a - (x - x0) * 0.05);
        if (x === x0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
      c.setLineDash([3, 4]);
      c.strokeStyle = ink(0.5);
      line(c, px, py, x0, py);
      c.setLineDash([]);
      c.strokeStyle = YELLOW;
      c.lineWidth = 2;
      line(c, cx, cy, px, py);
      dot(c, px, py, 4, YELLOW);
      dot(c, x0, py, 3, YELLOW);
    },

    SimLoan(c, w, h, t) {
      const n = 18, pad = w * 0.1, base = h * 0.82, top = h * 0.58;
      const bw = (w - pad * 2) / n;
      const shown = ((t % 7) / 2.6) * n;
      for (let i = 0; i < n; i++) {
        const grow = ease(shown - i);
        if (grow <= 0) break;
        const interest = 0.08 + 0.72 * Math.pow(1 - i / n, 1.4);
        const full = top * grow;
        c.fillStyle = YELLOW;
        c.fillRect(pad + i * bw + 2, base - full * (1 - interest), bw - 4, full * (1 - interest));
        c.fillStyle = ink(0.35);
        c.fillRect(pad + i * bw + 2, base - full, bw - 4, full * interest - 2);
      }
      c.strokeStyle = ink(0.8);
      c.lineWidth = 1;
      line(c, pad, base + 0.5, w - pad, base + 0.5);
    },

    Taboo(c, w, h, t) {
      const s = h * 0.7, x0 = w * 0.1, y0 = (h - s) / 2;
      const n = Math.min(600, Math.floor((t % 10) * 80) + 1);
      let inside = 0;
      c.strokeStyle = ink(0.8);
      c.lineWidth = 1.2;
      c.strokeRect(x0, y0, s, s);
      c.beginPath();
      c.arc(x0 + s / 2, y0 + s / 2, s / 2, 0, Math.PI * 2);
      c.stroke();
      for (let i = 0; i < n; i++) {
        const x = scatter[i * 2], y = scatter[i * 2 + 1];
        const hit = (x - 0.5) ** 2 + (y - 0.5) ** 2 <= 0.25;
        if (hit) inside++;
        c.fillStyle = hit ? YELLOW : ink(0.55);
        c.fillRect(x0 + x * s - 1.2, y0 + y * s - 1.2, 2.4, 2.4);
      }
      const tx = x0 + s + w * 0.07;
      c.fillStyle = ink(0.6);
      c.font = mono(Math.max(10, w * 0.028));
      c.fillText("π ≈", tx, h * 0.42);
      c.fillText(`n = ${n}`, tx, h * 0.72);
      c.fillStyle = ink(1);
      c.font = mono(Math.max(20, w * 0.075), 700);
      c.fillText(((4 * inside) / n).toFixed(3), tx, h * 0.58);
    },

    nBase(c, w, h, t) {
      const n = Math.floor(t * 3.5) % 256;
      const gap = 6, s = Math.min(30, (w * 0.8 - gap * 7) / 8);
      const x0 = (w - (s * 8 + gap * 7)) / 2, y0 = h * 0.26;
      c.lineWidth = 1.2;
      for (let i = 0; i < 8; i++) {
        const x = x0 + i * (s + gap);
        if ((n >> (7 - i)) & 1) {
          c.fillStyle = YELLOW;
          c.fillRect(x, y0, s, s);
        } else {
          c.strokeStyle = ink(0.45);
          c.strokeRect(x + 0.5, y0 + 0.5, s - 1, s - 1);
        }
      }
      const cols = [
        ["HEX", n.toString(16).toUpperCase().padStart(2, "0")],
        ["OCT", n.toString(8).padStart(3, "0")],
        ["DEC", String(n).padStart(3, "0")],
      ];
      const span = s * 8 + gap * 7;
      cols.forEach(([label, value], i) => {
        const x = x0 + (span / 3) * i;
        c.font = mono(Math.max(9, w * 0.026));
        c.fillStyle = ink(0.6);
        c.fillText(label, x, h * 0.64);
        c.font = mono(Math.max(18, w * 0.062), 700);
        c.fillStyle = ink(1);
        c.fillText(value, x, h * 0.8);
      });
    },

    BankVsRelative(c, w, h, t) {
      const x0 = w * 0.1, x1 = w * 0.84, base = h * 0.82, H = h * 0.6;
      const p = Math.min(1, (t % 6.5) / 3.5);
      const bank = (x) => base - (H * (Math.exp(1.9 * x) - 1)) / (Math.exp(1.9) - 1);
      const rel = (x) => base - H * 0.3 * x;
      c.strokeStyle = ink(0.4);
      c.lineWidth = 1;
      line(c, x0, base + 0.5, w * 0.92, base + 0.5);
      line(c, x0 + 0.5, h * 0.14, x0 + 0.5, base);
      const curve = (f, colour) => {
        c.strokeStyle = colour;
        c.lineWidth = 2;
        c.beginPath();
        for (let x = 0; x <= p + 0.001; x += 0.02) {
          const X = x0 + (x1 - x0) * x;
          if (x === 0) c.moveTo(X, f(x));
          else c.lineTo(X, f(x));
        }
        c.stroke();
        dot(c, x0 + (x1 - x0) * p, f(p), 4, colour);
      };
      curve(bank, ink(0.95));
      curve(rel, YELLOW);
      if (p > 0.6) {
        c.font = mono(Math.max(9, w * 0.026));
        c.fillStyle = ink(0.9);
        c.fillText("BANK", x0 + (x1 - x0) * p + 9, bank(p) + 4);
        c.fillStyle = YELLOW;
        c.fillText("KIN", x0 + (x1 - x0) * p + 9, rel(p) + 4);
      }
    },

    NameCodes(c, w, h, t) {
      const word = "MANISH";
      const gap = 6, s = Math.min(46, (w * 0.8 - gap * 5) / 6);
      const x0 = (w - (s * 6 + gap * 5)) / 2, y0 = (h - s) / 2;
      c.textAlign = "center";
      c.textBaseline = "middle";
      for (let i = 0; i < 6; i++) {
        const x = x0 + i * (s + gap);
        const coded = (((t * 0.8 - i * 0.22) % 4) + 4) % 4 > 2;
        if (coded) {
          c.fillStyle = YELLOW;
          c.fillRect(x, y0, s, s);
          c.fillStyle = "#0b1a78";
          c.font = mono(s * 0.42, 700);
          c.fillText(String(word.charCodeAt(i) - 64).padStart(2, "0"), x + s / 2, y0 + s / 2 + 1);
        } else {
          c.strokeStyle = ink(0.6);
          c.lineWidth = 1.2;
          c.strokeRect(x + 0.5, y0 + 0.5, s - 1, s - 1);
          c.fillStyle = ink(1);
          c.font = display(s * 0.56);
          c.fillText(word[i], x + s / 2, y0 + s / 2 + 1);
        }
      }
      c.textAlign = "start";
      c.textBaseline = "alphabetic";
    },

    Anticipator(c, w, h, t) {
      const marks = [0.92, 0.74, 0.86, 0.63, 0.9];
      const tt = t % 6.5;
      const x0 = w * 0.1, len = w * 0.5, y0 = h * 0.24, gap = (h * 0.52) / (marks.length - 1);
      marks.forEach((m, i) => {
        const y = y0 + i * gap;
        c.fillStyle = ink(0.22);
        c.fillRect(x0, y - 1, len, 2);
        c.fillStyle = ink(0.95);
        c.fillRect(x0, y - 4, len * m * ease(tt / 1.6 - i * 0.18), 8);
      });
      const show = ease((tt - 2.3) / 0.5);
      if (show > 0) {
        c.globalAlpha = show;
        c.fillStyle = YELLOW;
        c.font = display(h * 0.5);
        c.fillText("A", w * 0.7, h * 0.66);
        c.font = mono(Math.max(10, w * 0.03));
        c.fillText("GPA 3.6", w * 0.7, h * 0.8);
        c.globalAlpha = 1;
      }
    },

    TimePass(c, w, h, t) {
      const sums = [[7, 8], [12, 9], [6, 13], [15, 4]];
      const [a, b] = sums[Math.floor(t / 3.2) % sums.length];
      const p = (t % 3.2) / 3.2;
      const answered = p > 0.68;
      c.textAlign = "center";
      c.font = display(h * 0.3);
      const left = `${a} × ${b} = `;
      const right = answered ? String(a * b) : "?";
      const lw = c.measureText(left).width, rw = c.measureText(right).width;
      const x = (w - lw - rw) / 2;
      c.textAlign = "start";
      c.fillStyle = ink(1);
      c.fillText(left, x, h * 0.56);
      c.fillStyle = YELLOW;
      c.fillText(right, x + lw, h * 0.56);
      c.fillStyle = ink(0.22);
      c.fillRect(w * 0.15, h * 0.76, w * 0.7, 4);
      c.fillStyle = answered ? YELLOW : ink(0.95);
      c.fillRect(w * 0.15, h * 0.76, w * 0.7 * (1 - Math.min(p, 0.68) / 0.9), 4);
    },

    BetterHome(c, w, h, t) {
      const bw = w * 0.74, bh = Math.max(38, h * 0.2), x = (w - bw) / 2, y = (h - bh) / 2;
      c.strokeStyle = ink(0.9);
      c.lineWidth = 1.4;
      c.beginPath();
      c.roundRect(x, y, bw, bh, bh / 2);
      c.stroke();
      const ix = x + bh * 0.52, iy = y + bh * 0.46, ir = bh * 0.16;
      c.beginPath();
      c.arc(ix, iy, ir, 0, Math.PI * 2);
      c.stroke();
      line(c, ix + ir * 0.7, iy + ir * 0.7, ix + ir * 1.6, iy + ir * 1.6);
      const query = "why is the sky blue";
      const tt = t % 7;
      const shown = query.slice(0, Math.floor(tt * 6));
      c.font = mono(Math.max(12, bh * 0.32));
      c.fillStyle = ink(1);
      c.textBaseline = "middle";
      const tx = x + bh;
      c.fillText(shown, tx, y + bh / 2 + 1);
      if (Math.floor(t * 2.5) % 2 === 0) {
        c.fillStyle = YELLOW;
        c.fillRect(tx + c.measureText(shown).width + 3, y + bh * 0.28, 2, bh * 0.44);
      }
      c.textBaseline = "alphabetic";
    },
  };

  function figures() {
    const live = new Map(); // canvas -> { ctx, size, draw }
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const fig = entry.target;
          if (entry.isIntersecting) fig.classList.add("in");
          if (fig._demo) {
            if (entry.isIntersecting) live.set(fig, fig._demo);
            else live.delete(fig);
          }
        }
      },
      { rootMargin: "0px 0px -6% 0px" },
    );

    document.querySelectorAll(".fig").forEach((fig, i) => {
      fig.style.transitionDelay = `${(i % 3) * 70}ms, ${(i % 3) * 70}ms, 0ms`;
      const draw = demos[fig.dataset.demo];
      const canvas = fig.querySelector("canvas");
      if (draw && canvas) {
        fig._demo = { ...fit(canvas), draw, offset: i * 1.3 };
        if (still) new ResizeObserver(() => paint(fig._demo, 3.4)).observe(canvas);
      }
      seen.observe(fig);
    });

    function paint({ ctx, size, draw }, t) {
      if (!size.w) return;
      ctx.clearRect(0, 0, size.w, size.h);
      draw(ctx, size.w, size.h, t);
    }

    if (still) return;
    const loop = (ms) => {
      for (const demo of live.values()) paint(demo, ms / 1000 + demo.offset);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /* -- section headings draw themselves in --------------------------------- */

  function headings() {
    const seen = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) entry.target.classList.add("in");
    });
    document.querySelectorAll(".dim").forEach((el) => seen.observe(el));
  }

  /* -- the Index: a strip of its categories, and a filter ------------------ */

  function index() {
    const list = document.getElementById("repo-list");
    const input = document.getElementById("repo-filter");
    const strip = document.getElementById("spectrum");
    const total = document.getElementById("index-n");
    if (!list || !input) return;

    const groups = () => [...list.querySelectorAll(".lang-group")];
    const rowsOf = (group) => group.querySelectorAll(".index-row").length;

    function built() {
      const all = groups();
      if (!all.length) return false;
      const count = all.reduce((n, g) => n + rowsOf(g), 0);
      if (total) total.textContent = count;
      input.placeholder = `filter ${count} repos`;

      if (strip) {
        strip.textContent = "";
        for (const group of all) {
          const label = group.querySelector("h4").textContent;
          const b = document.createElement("button");
          b.type = "button";
          b.tabIndex = -1;
          b.style.flexGrow = rowsOf(group);
          b.title = `${label} · ${rowsOf(group)}`;
          b.textContent = label;
          b.addEventListener("click", () => {
            if (input.value) {
              input.value = "";
              filter();
            }
            group.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
            group.classList.add("flash");
            setTimeout(() => group.classList.remove("flash"), 1600);
          });
          strip.appendChild(b);
        }
        // too narrow for its name: show how many it holds instead
        const narrow = [...strip.children].filter((b) => b.scrollWidth > b.clientWidth);
        for (const b of narrow) b.textContent = b.title.split(" · ").pop();
      }
      return true;
    }

    function filter() {
      const q = input.value.trim().toLowerCase();
      for (const group of groups()) {
        const heading = group.querySelector("h4").textContent.toLowerCase();
        let any = false;
        let sub = null; // the sub-heading the rows below belong to
        let subText = "";
        let subAny = false;
        const closeSub = () => {
          if (sub) sub.hidden = !subAny;
        };
        for (const el of [...group.children].slice(1)) {
          if (el.classList.contains("index-sub")) {
            closeSub();
            sub = el;
            subText = el.textContent.toLowerCase();
            subAny = false;
            continue;
          }
          const hit =
            !q || heading.includes(q) || subText.includes(q) || el.textContent.toLowerCase().includes(q);
          el.hidden = !hit;
          if (hit) any = subAny = true;
        }
        closeSub();
        group.hidden = !any;
      }
    }

    input.addEventListener("input", filter);
    addEventListener("keydown", (ev) => {
      if (ev.key === "/" && document.activeElement !== input && !ev.ctrlKey && !ev.metaKey) {
        ev.preventDefault();
        input.focus();
      } else if (ev.key === "Escape" && document.activeElement === input) {
        input.value = "";
        filter();
        input.blur();
      }
    });

    if (!built()) {
      const watch = new MutationObserver(() => {
        if (built()) watch.disconnect();
      });
      watch.observe(list, { childList: true });
    }
  }

  /* -- contact ------------------------------------------------------------- */

  function contact() {
    const button = document.getElementById("copy-mail");
    if (!button) return;
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.mail);
        button.textContent = "Copied ✓";
      } catch (e) {
        location.href = `mailto:${button.dataset.mail}`;
        return;
      }
      setTimeout(() => (button.textContent = "Copy"), 1800);
    });
  }

  hero();
  figures();
  headings();
  index();
  contact();
})();
