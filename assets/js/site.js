/*
 * A sand mandala. A design is drawn from a number, with twelve outer petals,
 * then turned into loose grains that pour out from the
 * centre. Dragging moves the sand and it stays moved. Sweeping gathers every
 * grain back to the centre and pours a design that has not existed before.
 *
 * The number is kept in the address (#482913), so a mandala can be shared.
 * One page down, each work's screenshot is poured as a sand painting, and a
 * thread of spilled grains runs between them. The repository list there is
 * built by repo-index.js; this file only filters it.
 */

(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (id) => document.getElementById(id);

  // mulberry32
  const rng = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* -- drawing a design ---------------------------------------------------- */

  const PETALS = 12;
  const OUTER = 0.74; // where the twelve petals begin, as a fraction of the radius
  const CREAM = "#f4ecdc";

  const PALETTES = [
    ["#d63b2a", "#f2a81d", "#1f9c95", "#2449a8", "#3c8f4f", "#e58aa2", "#f4ecdc"],
    ["#e4572e", "#ffc857", "#17bebb", "#76b041", "#8f2d56", "#2e4057", "#f4ecdc"],
    ["#bf0603", "#f4d58d", "#1d4e89", "#00a5cf", "#7dcfb6", "#8d0801", "#f4ecdc"],
    ["#ff7b54", "#ffd56b", "#3a86a8", "#5e548e", "#e56b6f", "#2a9d8f", "#f4ecdc"],
    ["#c1121f", "#fdf0d5", "#669bbc", "#003049", "#e09f3e", "#606c38", "#f2a81d"],
  ];

  function paint(seed, S) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const g = cv.getContext("2d", { willReadFrequently: true });
    const R = S / 2;
    g.translate(R, R);

    const rand = rng(seed);
    const pick = (list) => list[Math.floor(rand() * list.length)];
    const palette = pick(PALETTES).slice();
    for (let i = palette.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [palette[i], palette[j]] = [palette[j], palette[i]];
    }
    let turn = 0;
    const next = () => palette[turn++ % palette.length];
    colours = palette;

    const at = (r, a) => [Math.cos(a) * r * R, Math.sin(a) * r * R];
    const ring = (r0, r1, colour) => {
      g.fillStyle = colour;
      g.beginPath();
      g.arc(0, 0, r1 * R, 0, TAU);
      g.arc(0, 0, r0 * R, 0, TAU, true);
      g.fill();
    };
    const disc = (r, a, size, colour) => {
      const [x, y] = at(r, a);
      g.fillStyle = colour;
      g.beginPath();
      g.arc(x, y, size * R, 0, TAU);
      g.fill();
    };
    // a lotus petal on the ray at angle a, from r0 out to its tip at r1
    const petal = (r0, r1, a, half, colour) => {
      const len = r1 - r0;
      g.fillStyle = colour;
      g.beginPath();
      g.moveTo(...at(r0, a - half));
      g.bezierCurveTo(...at(r0 + len * 0.55, a - half * 1.25), ...at(r0 + len * 0.86, a - half * 0.3), ...at(r1, a));
      g.bezierCurveTo(...at(r0 + len * 0.86, a + half * 0.3), ...at(r0 + len * 0.55, a + half * 1.25), ...at(r0, a + half));
      g.arc(0, 0, r0 * R, a + half, a - half, true);
      g.fill();
    };
    const cell = (r0, r1, a0, a1, colour) => {
      g.fillStyle = colour;
      g.beginPath();
      g.arc(0, 0, r1 * R, a0, a1);
      g.arc(0, 0, r0 * R, a1, a0, true);
      g.fill();
    };

    const motifs = {
      lotus(r0, r1, n) {
        ring(r0, r1, next());
        const outer = next(), inner = next();
        for (let i = 0; i < n; i++) petal(r0, r1 * 0.995, (i + 0.5) * (TAU / n), (Math.PI / n) * 0.96, CREAM);
        for (let i = 0; i < n; i++) petal(r0, r1 * 0.985 - (r1 - r0) * 0.06, (i + 0.5) * (TAU / n), (Math.PI / n) * 0.84, outer);
        for (let i = 0; i < n; i++) petal(r0, r0 + (r1 - r0) * 0.58, (i + 0.5) * (TAU / n), (Math.PI / n) * 0.45, inner);
      },
      teeth(r0, r1, n) {
        ring(r0, r1, next());
        const colour = next();
        for (let i = 0; i < n; i++) {
          const a = i * (TAU / n), half = Math.PI / n;
          g.fillStyle = colour;
          g.beginPath();
          g.moveTo(...at(r0, a - half));
          g.lineTo(...at(r1, a));
          g.lineTo(...at(r0, a + half));
          g.arc(0, 0, r0 * R, a + half, a - half, true);
          g.fill();
        }
      },
      beads(r0, r1, n) {
        ring(r0, r1, next());
        const bead = next(), eye = next();
        const mid = (r0 + r1) / 2;
        const size = Math.min((r1 - r0) * 0.38, mid * Math.sin(Math.PI / n) * 0.82);
        for (let i = 0; i < n; i++) {
          disc(mid, i * (TAU / n), size, CREAM);
          disc(mid, i * (TAU / n), size * 0.8, bead);
          disc(mid, i * (TAU / n), size * 0.34, eye);
        }
      },
      checker(r0, r1, n) {
        const a = next(), b = next();
        const mid = (r0 + r1) / 2, step = TAU / (n * 2);
        for (let i = 0; i < n * 2; i++) {
          cell(r0, mid, i * step, (i + 1) * step + 0.002, i % 2 ? a : b);
          cell(mid, r1, i * step, (i + 1) * step + 0.002, i % 2 ? b : a);
        }
      },
      rays(r0, r1, n) {
        const a = next(), b = next(), step = TAU / (n * 2);
        for (let i = 0; i < n * 2; i++) cell(r0, r1, i * step, (i + 1) * step + 0.002, i % 2 ? a : b);
      },
      scallop(r0, r1, n) {
        ring(r0, r1, next());
        const a = next(), b = next();
        const size = Math.min(r1 - r0, r0 * Math.sin(Math.PI / n) * 1.06);
        g.save();
        g.beginPath();
        g.arc(0, 0, r1 * R, 0, TAU);
        g.arc(0, 0, r0 * R, 0, TAU, true);
        g.clip();
        for (let i = 0; i < n; i++) {
          disc(r0, i * (TAU / n), size, CREAM);
          disc(r0, i * (TAU / n), size * 0.86, a);
          disc(r0, i * (TAU / n), size * 0.5, b);
        }
        g.restore();
      },
    };

    // The twelve petals, with a second row showing between them.
    const step = TAU / PETALS, up = -Math.PI / 2;
    const back = next(), face = next(), heart = next(), seedDot = next();
    for (let i = 0; i < PETALS; i++) petal(OUTER, 0.93, up + (i + 0.5) * step, step * 0.5, back);
    for (let i = 0; i < PETALS; i++) {
      const a = up + i * step;
      petal(OUTER, 0.995, a, step * 0.47, CREAM);
      petal(OUTER, 0.968, a, step * 0.41, face);
      petal(OUTER, 0.9, a, step * 0.25, heart);
      disc(OUTER + 0.045, a, 0.016, seedDot);
    }

    // Bands from the petals in to the centre.
    const names = Object.keys(motifs);
    let last = "";
    let r1 = OUTER;
    while (r1 > 0.14) {
      let width = 0.07 + rand() * 0.1;
      if (r1 - width < 0.2) width = r1 - 0.11;
      const r0 = r1 - width;
      const mid = (r0 + r1) / 2;
      const n = mid < 0.28 ? pick([8, 12]) : mid < 0.5 ? pick([12, 16, 24]) : pick([24, 32, 36]);
      let name;
      do name = pick(names);
      while (name === last);
      last = name;
      motifs[name](r0, r1, n);
      ring(r1 - 0.006, r1 + 0.006, CREAM);
      r1 = r0;
    }
    ring(r1 - 0.006, r1 + 0.006, CREAM);
    ring(0, r1 - 0.006, next());
    const core = next();
    for (let i = 0; i < 8; i++) petal(0.028, r1 - 0.012, i * (TAU / 8), (Math.PI / 8) * 0.9, i % 2 ? CREAM : core);
    disc(0, 0, 0.03, next());

    return g.getImageData(0, 0, S, S).data;
  }

  /* -- the sand ------------------------------------------------------------ */

  let colours = PALETTES[0]; // the palette of the mandala now on the table
  const stage = $("top");
  const canvas = $("sand");
  const ctx = canvas.getContext("2d");
  let BW = 0, BH = 0, scale = 1; // the pixel buffer, and buffer px per CSS px
  let image, pixels;
  let CX = 0, CY = 0, RAD = 0; // the mandala's centre and radius, in buffer px

  let measured = { w: 0, h: 0 };
  let pouredOnce = false;
  let onStage = true; // whether the first page is on screen

  let count = 0;
  let X, Y, VX, VY, HX, HY, HR, HA, DELAY, COL;

  let seed = 0;
  let phase = "form"; // form | rest | sweep
  let phaseStart = 0;
  let formEnd = 0;
  let awake = 0; // frames of physics left to run
  let tick = 0;
  let stale = true;

  const FLIGHT = 0.75; // seconds a grain takes from the centre to its place
  const SWEEP = 2.3;

  function measure() {
    const w = stage.clientWidth, h = stage.clientHeight;
    const small = Math.min(w, h) < 620;
    scale = small ? Math.min(devicePixelRatio || 1, 2) : 1;
    BW = Math.round(w * scale);
    BH = Math.round(h * scale);
    measured = { w, h };
    canvas.width = BW;
    canvas.height = BH;
    image = ctx.createImageData(BW, BH);
    pixels = new Uint32Array(image.data.buffer);
    const tall = BH > BW * 1.15;
    RAD = Math.floor(Math.min(BW * (tall ? 0.48 : 0.47), BH * (tall ? 0.36 : 0.43)));
    CX = BW / 2;
    CY = BH * (tall ? 0.47 : 0.5);
  }

  function pour(newSeed, instantly) {
    seed = newSeed;
    const S = RAD * 2;
    const data = paint(seed, S);
    const jitter = rng(seed ^ 0x51ed);
    const density = Math.min(0.66, 250000 / (Math.PI * RAD * RAD * 0.9));

    const max = Math.ceil(S * S * density * 0.9);
    X = new Float32Array(max); Y = new Float32Array(max);
    VX = new Float32Array(max); VY = new Float32Array(max);
    HX = new Float32Array(max); HY = new Float32Array(max);
    HR = new Float32Array(max); HA = new Float32Array(max);
    DELAY = new Float32Array(max);
    COL = new Uint32Array(max);

    let n = 0;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        if (data[i + 3] < 150 || jitter() > density || n >= max) continue;
        const dx = x - RAD, dy = y - RAD;
        const r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
        HX[n] = CX + dx;
        HY[n] = CY + dy;
        HR[n] = r;
        HA[n] = a;
        // laid down ring by ring from the centre, each ring a little unevenly
        DELAY[n] = (r / RAD) * 3.4 + jitter() * 0.5;
        const k = 0.8 + jitter() * 0.34;
        const cr = Math.min(255, data[i] * k), cg = Math.min(255, data[i + 1] * k), cb = Math.min(255, data[i + 2] * k);
        COL[n] = (255 << 24) | (cb << 16) | (cg << 8) | cr;
        n++;
      }
    }
    count = n;
    formEnd = 3.9 + FLIGHT;

    try {
      history.replaceState(null, "", `#${seed}`);
    } catch (e) {
      /* the address just keeps the old number */
    }

    if (pouredOnce) thread();
    pouredOnce = true;
    if (instantly || still) settle();
    else {
      phase = "form";
      phaseStart = performance.now();
    }
    stale = true;
  }

  function settle() {
    X.set(HX.subarray(0, X.length));
    Y.set(HY.subarray(0, Y.length));
    VX.fill(0);
    VY.fill(0);
    phase = "rest";
    stale = true;
  }

  const plot = (i) => {
    const px = X[i] | 0, py = Y[i] | 0;
    if (px >= 0 && px < BW && py >= 0 && py < BH) pixels[py * BW + px] = COL[i];
  };

  function frame(now) {
    requestAnimationFrame(frame);
    if (!onStage) return;
    tick++;

    if (phase === "form") {
      const t = (now - phaseStart) / 1000;
      pixels.fill(0);
      for (let i = 0; i < count; i++) {
        const k = (t - DELAY[i]) / FLIGHT;
        if (k <= 0) continue; // still in the funnel
        if (k >= 1) {
          X[i] = HX[i];
          Y[i] = HY[i];
        } else {
          const e = 1 - (1 - k) * (1 - k) * (1 - k);
          const a = HA[i] - (1 - e) * 1.5;
          X[i] = CX + Math.cos(a) * HR[i] * e;
          Y[i] = CY + Math.sin(a) * HR[i] * e;
        }
        plot(i);
      }
      ctx.putImageData(image, 0, 0);
      if (t > formEnd) settle();
      return;
    }

    if (phase === "sweep") {
      const k = Math.min(1, (now - phaseStart) / 1000 / SWEEP);
      const e = k * k * (3 - 2 * k);
      pixels.fill(0);
      for (let i = 0; i < count; i++) {
        // each grain spirals in, the outer ones turning further
        const r = HR[i] * (1 - e) * (1 - e * 0.5 * DELAY[i]);
        const a = HA[i] + e * e * (2.2 + DELAY[i] * 2.4);
        X[i] = CX + Math.cos(a) * r;
        Y[i] = CY + Math.sin(a) * r;
        plot(i);
      }
      ctx.putImageData(image, 0, 0);
      if (k >= 1) pour(freshSeed());
      return;
    }

    // at rest: move what has been pushed, and let a few grains catch the light
    if (awake > 0) {
      awake--;
      for (let i = 0; i < count; i++) {
        const vx = VX[i], vy = VY[i];
        if (vx === 0 && vy === 0) continue;
        X[i] += vx;
        Y[i] += vy;
        VX[i] = Math.abs(vx) < 0.02 ? 0 : vx * 0.86;
        VY[i] = Math.abs(vy) < 0.02 ? 0 : vy * 0.86;
      }
      stale = true;
    }
    if (!stale && (still || tick % 6)) return;
    pixels.fill(0);
    for (let i = 0; i < count; i++) plot(i);
    if (!still) {
      for (let g = 0; g < 260; g++) {
        const i = (Math.random() * count) | 0;
        const px = X[i] | 0, py = Y[i] | 0;
        if (px >= 0 && px < BW && py >= 0 && py < BH) pixels[py * BW + px] = 0xffffffff;
      }
    }
    ctx.putImageData(image, 0, 0);
    stale = false;
  }

  /* -- hands --------------------------------------------------------------- */

  // Push the sand along a stroke from (x0, y0) to (x1, y1).
  function drag(x0, y0, x1, y1) {
    const reach = RAD * 0.085, reach2 = reach * reach;
    const dx = x1 - x0, dy = y1 - y0;
    const speed = Math.min(1, 26 / (Math.hypot(dx, dy) || 1));
    for (let i = 0; i < count; i++) {
      const ox = X[i] - x1, oy = Y[i] - y1;
      const d2 = ox * ox + oy * oy;
      if (d2 > reach2) continue;
      const f = 1 - d2 / reach2;
      const d = Math.sqrt(d2) || 1;
      VX[i] += dx * speed * f * 0.3 + (ox / d) * f * 1.6 + (Math.random() - 0.5) * f * 1.4;
      VY[i] += dy * speed * f * 0.3 + (oy / d) * f * 1.6 + (Math.random() - 0.5) * f * 1.4;
    }
    awake = 80;
  }

  let held = null; // { x, y, moved, type } while a pointer is down
  const toBuffer = (ev) => {
    const box = canvas.getBoundingClientRect();
    return [(ev.clientX - box.left) * scale, (ev.clientY - box.top) * scale];
  };
  const onSand = (x, y) => Math.hypot(x - CX, y - CY) < RAD * 1.06;

  // A finger on the mandala moves sand; a finger anywhere else scrolls the page.
  canvas.addEventListener(
    "touchstart",
    (ev) => {
      const [x, y] = toBuffer(ev.touches[0]);
      if (phase === "rest" && onSand(x, y)) ev.preventDefault();
    },
    { passive: false },
  );

  canvas.addEventListener("pointerdown", (ev) => {
    if (phase !== "rest") return;
    const [x, y] = toBuffer(ev);
    if (ev.pointerType === "touch" && !onSand(x, y)) return;
    held = { x, y, moved: 0, type: ev.pointerType };
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener("pointermove", (ev) => {
    const [x, y] = toBuffer(ev);
    if (held && phase === "rest") {
      held.moved += Math.hypot(x - held.x, y - held.y);
      if (held.moved > 6 * scale) {
        canvas.classList.add("drag");
        drag(held.x, held.y, x, y);
      }
      held.x = x;
      held.y = y;
    }
  });
  const release = () => {
    held = null;
    canvas.classList.remove("drag");
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  const freshSeed = () => 1 + Math.floor(Math.random() * 999999);

  function sweep() {
    if (phase === "sweep") return;
    if (still) return pour(freshSeed());
    for (let i = 0; i < count; i++) {
      const dx = X[i] - CX, dy = Y[i] - CY;
      HR[i] = Math.hypot(dx, dy);
      HA[i] = Math.atan2(dy, dx);
      DELAY[i] = Math.min(1, HR[i] / RAD);
    }
    phase = "sweep";
    phaseStart = performance.now();
  }
  $("sweep").addEventListener("click", sweep);

  let resizing = 0;
  addEventListener("resize", () => {
    clearTimeout(resizing);
    resizing = setTimeout(() => {
      // a phone's address bar sliding away is not a reason to lose the sand
      const w = stage.clientWidth, h = stage.clientHeight;
      if (w !== measured.w || Math.abs(h - measured.h) > 120) {
        measure();
        pour(seed, true);
      }
      thread();
    }, 150);
  });

  new IntersectionObserver(([entry]) => {
    onStage = entry.isIntersecting;
    stale = true;
  }).observe(stage);

  /* -- one page down: the works as sand paintings -------------------------- */

  // Pour one screenshot into its canvas, from the middle outwards.
  function plate(holder) {
    const img = holder.querySelector("img");
    const cv = holder.querySelector("canvas");
    const begin = () => {
      const w = Math.min(760, Math.round(holder.clientWidth * Math.min(devicePixelRatio || 1, 2)));
      const h = Math.round((w * 602) / 1358);
      if (!w || !img.naturalWidth) return;
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const og = off.getContext("2d", { willReadFrequently: true });
      og.drawImage(img, 0, 0, w, h);
      let src;
      try {
        src = og.getImageData(0, 0, w, h).data;
      } catch (e) {
        return holder.classList.add("plain");
      }
      cv.width = w;
      cv.height = h;
      const g = cv.getContext("2d");
      const out = g.createImageData(w, h);
      const px = new Uint32Array(out.data.buffer);
      const rand = rng(w * 7919 + img.src.length);
      const edge = w * 0.03;

      // Each painting is poured in two sands: one colour from the mandala
      // for the dark of the screenshot, cream for its light.
      const order = [...document.querySelectorAll(".plate")].indexOf(holder);
      const strong = colours.filter((hex) => hex.toLowerCase() !== CREAM && hex.toLowerCase() !== "#fdf0d5");
      const ink = parseInt(strong[order % strong.length].slice(1), 16);
      const ir = ink >> 16, ig = (ink >> 8) & 255, ib = ink & 255;
      let lo = 255, hi = 0, sum = 0, seen = 0;
      for (let i = 0; i < src.length; i += 16) {
        const l = (src[i] * 3 + src[i + 1] * 6 + src[i + 2]) / 10;
        if (l < lo) lo = l;
        if (l > hi) hi = l;
        sum += l;
        seen++;
      }
      const range = Math.max(1, hi - lo);
      // a curve that keeps a dark screen mostly colour and a light one mostly
      // cream, while pulling what is drawn on it apart from its ground
      const mean = Math.min(0.97, Math.max(0.03, (sum / seen - lo) / range));
      const curve = Math.min(3, Math.max(0.3, Math.log(mean < 0.5 ? 0.2 : 0.82) / Math.log(mean)));

      const grains = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const light = Math.pow(((src[i] * 3 + src[i + 1] * 6 + src[i + 2]) / 10 - lo) / range, curve);
          // thinner toward the edge, so the painting has a ragged border
          const margin = Math.min(x, y, w - 1 - x, h - 1 - y) / edge;
          if (rand() > (0.5 + 0.36 * light) * Math.min(1, margin * margin + 0.08)) continue;
          const k = 0.8 + rand() * 0.34;
          const m = light * light * (3 - 2 * light);
          const r = Math.min(255, (ir + (244 - ir) * m) * k), gg = Math.min(255, (ig + (236 - ig) * m) * k), b = Math.min(255, (ib + (220 - ib) * m) * k);
          const dx = (x - w / 2) / w, dy = (y - h / 2) / w;
          grains.push(y * w + x, (255 << 24) | (b << 16) | (gg << 8) | r, Math.hypot(dx, dy) * 1.5 + rand() * 0.25);
        }
      }
      if (still) {
        for (let n = 0; n < grains.length; n += 3) px[grains[n]] = grains[n + 1];
        return g.putImageData(out, 0, 0);
      }
      const t0 = performance.now();
      const step = (now) => {
        const t = (now - t0) / 1500;
        for (let n = 0; n < grains.length; n += 3) if (grains[n + 2] < t) px[grains[n]] = grains[n + 1];
        g.putImageData(out, 0, 0);
        if (t < 1.2) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if (img.complete && img.naturalWidth) begin();
    else img.addEventListener("load", begin, { once: true });
  }

  const plates = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        plates.unobserve(entry.target);
        plate(entry.target);
      }
    },
    { rootMargin: "0px 0px -12% 0px" },
  );
  document.querySelectorAll(".plate").forEach((el) => {
    el.querySelector("img").loading = "eager";
    plates.observe(el);
  });

  // The thread of spilled sand the works hang from, in the mandala's colours.
  const trail = $("trail");
  const worksList = $("works");
  function thread() {
    if (!trail || !worksList) return;
    const width = 160;
    const height = Math.min(16000, worksList.offsetTop + worksList.offsetHeight - 40);
    trail.width = width;
    trail.height = height;
    trail.style.height = `${height}px`;
    const g = trail.getContext("2d");
    const out = g.createImageData(width, height);
    const px = new Uint32Array(out.data.buffer);
    const rand = rng(seed + 77);
    const inks = colours.concat(CREAM).map((hex) => {
      const v = parseInt(hex.slice(1), 16);
      return (255 << 24) | ((v & 255) << 16) | (v & 0xff00) | (v >> 16);
    });
    const narrow = innerWidth <= 760;
    for (let y = 0; y < height; y++) {
      const sway = narrow ? 0 : Math.sin(y / 210) * 34 + Math.sin(y / 67) * 6;
      const fade = Math.min(1, y / 240, (height - y) / 300);
      const grainsHere = (narrow ? 2.4 : 3.6) * fade;
      for (let n = 0; n < grainsHere; n++) {
        if (rand() > grainsHere - n) continue;
        // mostly close to the line, a few strays well off it
        const off = (rand() + rand() + rand() - 1.5) * (rand() < 0.08 ? 44 : 9);
        const x = Math.round((narrow ? 22 : width / 2) + sway + off);
        if (x >= 0 && x < width) px[y * width + x] = inks[(rand() * inks.length) | 0];
      }
    }
    g.putImageData(out, 0, 0);
  }

  /* -- the repositories: a filter ------------------------------------------ */

  const input = $("repo-filter");
  const list = $("repo-list");

  function filter() {
    const q = input.value.trim().toLowerCase();
    for (const group of list.querySelectorAll(".lang-group")) {
      const heading = group.querySelector("h4").textContent.toLowerCase();
      let any = false;
      let sub = null, subText = "", subAny = false;
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
        const hit = !q || heading.includes(q) || subText.includes(q) || el.textContent.toLowerCase().includes(q);
        el.hidden = !hit;
        if (hit) any = subAny = true;
      }
      closeSub();
      group.hidden = !any;
    }
  }
  input.addEventListener("input", filter);

  addEventListener("keydown", (ev) => {
    const typing = document.activeElement === input;
    if (ev.key === "Escape" && typing) {
      input.value = "";
      filter();
      input.blur();
    } else if (ev.key === "/" && !typing && !ev.ctrlKey && !ev.metaKey) {
      ev.preventDefault();
      input.focus();
    } else if (ev.key === " " && onStage && scrollY < 40 && document.activeElement === document.body) {
      ev.preventDefault();
      sweep();
    }
  });

  /* -- begin --------------------------------------------------------------- */

  measure();
  const asked = parseInt(location.hash.slice(1), 10);
  pour(asked > 0 && asked < 1e6 ? asked : freshSeed());
  thread();
  addEventListener("load", thread);
  requestAnimationFrame(frame);
})();
