/*
 * The homepage's moving parts. A fixed canvas paints one day over a
 * generated mountain range, and how far the page is scrolled sets the hour:
 * night, sunrise through the Work strip, noon over the Index, sunset, night.
 * At night every repository in the Index is a star you can point at.
 *
 * The Index itself is built by repo-index.js; this file only reads what that
 * puts on the page.
 */

(function () {
  "use strict";

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const $ = (id) => document.getElementById(id);

  /* -- the hour, from the scroll position ---------------------------------- */

  const sections = [...document.querySelectorAll("section[data-t]")].map((el) => {
    const [t0, t1] = el.dataset.t.split(" ").map(Number);
    return { el, t0, t1 };
  });

  function hourNow() {
    const max = document.documentElement.scrollHeight - innerHeight;
    if (max <= 0) return 0;
    // a probe that runs from the top of the page to its bottom
    const probe = scrollY + innerHeight * (scrollY / max);
    for (const s of sections) {
      const top = s.el.offsetTop;
      const height = s.el.offsetHeight;
      if (probe <= top + height) return lerp(s.t0, s.t1, clamp((probe - top) / height));
    }
    return 1;
  }

  /* -- the sky ------------------------------------------------------------- */

  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

  // t, sky top / middle / horizon, stars, far ridge, near ridge, snow, clock
  const KEYS = [
    [0.0, "#04050d", "#0a0f2c", "#18244f", 1.0, "#1c2752", "#04050c", "#44558a", 1.5],
    [0.2, "#0b0d2a", "#2a2358", "#7a4a7a", 0.7, "#3a3566", "#0a0818", "#9a88b8", 4.8],
    [0.32, "#27306e", "#b0608c", "#ffb07a", 0.08, "#8c6a96", "#1c1230", "#ffd9c2", 6.2],
    [0.5, "#2f7fd0", "#86bfee", "#e3f0fb", 0.0, "#9fbbd8", "#1f3d57", "#ffffff", 12.0],
    [0.68, "#3b6fc0", "#f0b48a", "#ffd27a", 0.0, "#b88f9a", "#2a1c38", "#ffe9c9", 16.5],
    [0.8, "#231f5c", "#c4476e", "#ff8a4a", 0.25, "#7a4a72", "#160b22", "#ffb590", 18.3],
    [0.9, "#0a0c28", "#2b2154", "#5a3a6e", 0.85, "#2c2a58", "#070612", "#7068a0", 19.6],
    [1.0, "#04050d", "#0a0f2c", "#18244f", 1.0, "#1c2752", "#04050c", "#44558a", 23.0],
  ].map(([t, top, mid, hor, star, far, near, snow, clock]) => ({
    t, top: rgb(top), mid: rgb(mid), hor: rgb(hor), star, far: rgb(far), near: rgb(near), snow: rgb(snow), clock,
  }));

  function skyAt(t) {
    let i = 0;
    while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const k = clamp((t - a.t) / (b.t - a.t));
    const out = { star: lerp(a.star, b.star, k), clock: lerp(a.clock, b.clock, k) };
    for (const key of ["top", "mid", "hor", "far", "near", "snow"]) out[key] = mix(a[key], b[key], k);
    return out;
  }

  // Terrain: value noise, summed over octaves. Ridged for the far peaks.
  const hash = (n) => {
    const s = Math.sin(n * 127.1 + 0.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const noise = (x, seed) => {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return hash(i + seed) * (1 - u) + hash(i + 1 + seed) * u;
  };
  const fbm = (x, seed, octaves) => {
    let amp = 0.5, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise(x, seed + o * 31);
      norm += amp;
      x *= 2.07;
      amp *= 0.5;
    }
    return sum / norm;
  };
  const peaks = (x, seed) => {
    const sharp = Math.pow(1 - Math.abs(2 * fbm(x, seed, 5) - 1), 1.7);
    return sharp * (0.45 + 0.55 * noise(x * 0.45, seed + 99));
  };

  // far to near: baseline and height as fractions of the viewport, feature
  // width in px, how much it moves against the pointer and the scroll
  const RIDGES = [
    { base: 0.71, amp: 0.4, span: 300, depth: 0.12, seed: 11, far: true },
    { base: 0.79, amp: 0.2, span: 330, depth: 0.28, seed: 47 },
    { base: 0.86, amp: 0.16, span: 270, depth: 0.5, seed: 83 },
    { base: 0.925, amp: 0.13, span: 220, depth: 0.75, seed: 131 },
    { base: 0.99, amp: 0.11, span: 180, depth: 1, seed: 173 },
  ];

  const canvas = $("sky");
  const c = canvas.getContext("2d");
  let W = 0, H = 0;
  let dust = []; // the anonymous stars
  let repoStars = []; // one per repository, in constellations by category
  let hovered = null;
  let pointer = { x: 0.5, y: 0.5, sx: 0.5 };
  let t = hourNow();
  let dirty = true;
  let meteor = null;
  let nextMeteor = 4;

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    W = innerWidth;
    H = innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(clamp((W * H) / 3200, 160, 520));
    dust = Array.from({ length: count }, (_, i) => ({
      x: hash(i * 3 + 1),
      y: Math.pow(hash(i * 3 + 2), 1.25) * 0.78,
      r: 0.4 + Math.pow(hash(i * 3 + 3), 6) * 1.5,
      phase: hash(i + 500) * 6.28,
      speed: 0.6 + hash(i + 900) * 1.8,
    }));
    dirty = true;
  }

  // A star sits at its cluster's centre plus an offset measured in widths,
  // so a constellation keeps its shape on a tall, narrow screen.
  const starXY = (s) => {
    const spread = W * clamp(1000 / W, 1, 1.7);
    return [s.cx * W + s.dx * spread - (pointer.sx - 0.5) * 26, s.cy * H + s.dy * spread - scrollY * 0.12];
  };

  function draw(time) {
    const sky = skyAt(t);
    const horizon = H * 0.74;

    const g = c.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, css(sky.top));
    g.addColorStop(0.62, css(sky.mid));
    g.addColorStop(1, css(sky.hor));
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    if (sky.star > 0.01) {
      const drift = (pointer.sx - 0.5) * 12;
      for (const s of dust) {
        const twinkle = still ? 0.8 : 0.62 + 0.38 * Math.sin(time * s.speed + s.phase);
        c.fillStyle = `rgba(255,255,255,${sky.star * twinkle * (0.35 + s.r * 0.4)})`;
        c.beginPath();
        c.arc(s.x * W - drift, s.y * H - scrollY * 0.06, s.r, 0, 6.3);
        c.fill();
      }

      // the constellations
      c.lineWidth = 1;
      for (const s of repoStars) {
        if (!s.link) continue;
        const lit = hovered && hovered.group === s.group;
        const [x1, y1] = starXY(s), [x2, y2] = starXY(s.link);
        c.strokeStyle = `rgba(200,215,255,${sky.star * (lit ? 0.75 : 0.2)})`;
        c.beginPath();
        c.moveTo(x1, y1);
        c.lineTo(x2, y2);
        c.stroke();
      }
      for (const s of repoStars) {
        const [x, y] = starXY(s);
        const lit = hovered && hovered.group === s.group;
        const twinkle = still ? 1 : 0.8 + 0.2 * Math.sin(time * 1.4 + s.phase);
        const r = s === hovered ? 4 : lit ? 2.6 : 1.9;
        c.fillStyle = `rgba(${lit ? "255,207,138" : "190,205,255"},${sky.star * 0.16})`;
        c.beginPath();
        c.arc(x, y, r * 3.6, 0, 6.3);
        c.fill();
        c.fillStyle = `rgba(${lit ? "255,226,180" : "255,255,255"},${sky.star * twinkle})`;
        c.beginPath();
        c.arc(x, y, r, 0, 6.3);
        c.fill();
      }

      if (meteor) {
        const k = (time - meteor.at) / 0.9;
        if (k > 1) meteor = null;
        else {
          const x = meteor.x + k * 260, y = meteor.y + k * 110;
          const trail = c.createLinearGradient(x, y, x - 130, y - 55);
          trail.addColorStop(0, `rgba(255,255,255,${sky.star * Math.sin(k * 3.14)})`);
          trail.addColorStop(1, "rgba(255,255,255,0)");
          c.strokeStyle = trail;
          c.lineWidth = 1.6;
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x - 130, y - 55);
          c.stroke();
        }
      }

      // a crescent moon
      if (sky.star > 0.3) {
        const mx = W * 0.84, my = H * 0.17 - scrollY * 0.04, mr = Math.max(13, W * 0.013);
        c.fillStyle = css([244, 236, 216], sky.star);
        c.beginPath();
        c.arc(mx, my, mr, 0, 6.3);
        c.fill();
        c.fillStyle = css(sky.top);
        c.beginPath();
        c.arc(mx + mr * 0.42, my - mr * 0.18, mr * 0.92, 0, 6.3);
        c.fill();
      }
    }

    // the sun, over an arc from the left of the range to the right
    const u = (t - 0.25) / 0.55;
    if (u > -0.12 && u < 1.12) {
      const lift = Math.sin(clamp(u) * Math.PI);
      const sx = W * lerp(0.2, 0.8, u);
      const sy = horizon - (lift * 0.62 - (u < 0 || u > 1 ? 0.06 : 0)) * H;
      const colour = mix([255, 170, 96], [255, 248, 224], lift);
      const glow = c.createRadialGradient(sx, sy, 0, sx, sy, H * 0.6);
      glow.addColorStop(0, css(colour, 0.55));
      glow.addColorStop(0.25, css(colour, 0.16));
      glow.addColorStop(1, css(colour, 0));
      c.fillStyle = glow;
      c.fillRect(0, 0, W, H);
      c.fillStyle = css(colour);
      c.beginPath();
      c.arc(sx, sy, lerp(46, 30, lift), 0, 6.3);
      c.fill();
    }

    // the range
    const unit = Math.max(W, 760) / 1440;
    RIDGES.forEach((ridge, i) => {
      const colour = mix(sky.far, sky.near, i / (RIDGES.length - 1));
      const shift = (scrollY * 0.14 + (pointer.sx - 0.5) * 70) * ridge.depth;
      const base = H * ridge.base, amp = H * ridge.amp;
      c.beginPath();
      c.moveTo(0, H);
      for (let x = 0; x <= W + 4; x += 4) {
        const nx = (x + shift) / (ridge.span * unit) + ridge.seed;
        const n = ridge.far ? peaks(nx, ridge.seed) : fbm(nx, ridge.seed, 4);
        c.lineTo(x, base - amp * n);
      }
      c.lineTo(W, H);
      c.closePath();
      if (ridge.far) {
        const snow = c.createLinearGradient(0, base - amp * 0.92, 0, base - amp * 0.3);
        snow.addColorStop(0, css(sky.snow));
        snow.addColorStop(1, css(colour));
        c.fillStyle = snow;
      } else c.fillStyle = css(colour);
      c.fill();

      // haze settling in the valley behind the next ridge
      if (i < RIDGES.length - 1) {
        const next = H * RIDGES[i + 1].base;
        const haze = c.createLinearGradient(0, base - amp * 0.35, 0, next);
        haze.addColorStop(0, css(sky.hor, 0));
        haze.addColorStop(1, css(sky.hor, 0.34));
        c.fillStyle = haze;
        c.fillRect(0, base - amp * 0.35, W, next - (base - amp * 0.35));
      }
    });
    return sky;
  }

  const clockTime = $("clock-time");
  const clockDot = $("clock-dot");
  function setClock(sky) {
    const minutes = Math.round((sky.clock * 60) / 5) * 5;
    const text = `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    if (clockTime.textContent !== text) {
      clockTime.textContent = text;
      const colour = css(mix([190, 205, 255], [255, 207, 138], 1 - sky.star));
      clockDot.style.background = colour;
      clockDot.style.boxShadow = `0 0 10px ${colour}`;
    }
  }

  function frame(ms) {
    const time = ms / 1000;
    const goal = hourNow();
    if (Math.abs(goal - t) > 0.0004) {
      t = still ? goal : lerp(t, goal, 0.14);
      dirty = true;
    }
    if (Math.abs(pointer.x - pointer.sx) > 0.001) {
      pointer.sx = lerp(pointer.sx, pointer.x, 0.06);
      dirty = true;
    }
    const night = skyAt(t).star > 0.01;
    if (night && !still && !document.hidden) {
      if (!meteor && time > nextMeteor) {
        meteor = { at: time, x: W * (0.1 + Math.random() * 0.6), y: H * (0.05 + Math.random() * 0.25) };
        nextMeteor = time + 5 + Math.random() * 9;
      }
      dirty = true; // stars twinkle
    }
    if (dirty) {
      setClock(draw(time));
      dirty = false;
    }
    requestAnimationFrame(frame);
  }

  addEventListener("resize", resize);
  addEventListener("scroll", () => (dirty = true), { passive: true });
  resize();
  requestAnimationFrame(frame);

  /* -- stars you can point at ---------------------------------------------- */

  const tip = $("star-tip");
  const frac = (x) => x - Math.floor(x);

  function chart(groups) {
    repoStars = [];
    groups.forEach((group, gi) => {
      const rows = [...group.querySelectorAll(".index-row a")];
      const label = group.querySelector("h4").textContent;
      // cluster centres spread evenly over the sky (the R2 sequence)
      const cx = 0.08 + 0.84 * frac(0.5 + (gi + 1) * 0.7548776662);
      const cy = 0.1 + 0.44 * frac(0.5 + (gi + 1) * 0.5698402909);
      const reach = 0.022 + 0.011 * Math.sqrt(rows.length);
      const members = rows.map((a, j) => {
        const angle = j * 2.39996 + gi;
        const d = reach * Math.sqrt((j + 0.5) / rows.length);
        return {
          cx, cy,
          dx: Math.cos(angle) * d,
          dy: Math.sin(angle) * d,
          title: a.firstChild.textContent,
          href: a.href,
          label,
          group: gi,
          phase: hash(gi * 100 + j) * 6.28,
          link: null,
        };
      });
      // each star joins the nearest one placed before it
      members.forEach((s, j) => {
        let best = Infinity;
        for (let k = 0; k < j; k++) {
          const d = (s.dx - members[k].dx) ** 2 + (s.dy - members[k].dy) ** 2;
          if (d < best) {
            best = d;
            s.link = members[k];
          }
        }
      });
      repoStars.push(...members);
    });
    const legend = $("legend");
    if (legend && repoStars.length) legend.hidden = false;
    dirty = true;
  }

  function point(ev) {
    pointer.x = ev.clientX / innerWidth;
    pointer.y = ev.clientY / innerHeight;
    let found = null;
    const overSky = !ev.target.closest || !ev.target.closest("a, button, input, nav, .glass");
    if (overSky && ev.pointerType !== "touch" && skyAt(t).star > 0.4) {
      let best = 22 * 22;
      for (const s of repoStars) {
        const [x, y] = starXY(s);
        const d = (x - ev.clientX) ** 2 + (y - ev.clientY) ** 2;
        if (d < best) {
          best = d;
          found = s;
        }
      }
    }
    if (found !== hovered) {
      hovered = found;
      document.body.classList.toggle("on-star", !!found);
      tip.classList.toggle("on", !!found);
      if (found) {
        tip.textContent = "";
        const small = document.createElement("small");
        small.textContent = found.label;
        tip.append(small, found.title);
      }
      dirty = true;
    }
    if (found) {
      const x = Math.min(ev.clientX + 16, innerWidth - tip.offsetWidth - 12);
      tip.style.transform = `translate(${x}px, ${ev.clientY + 18}px)`;
    }
  }
  addEventListener("pointermove", point);
  addEventListener("click", (ev) => {
    if (hovered && !ev.target.closest("a, button, input")) window.open(hovered.href, "_blank", "noopener");
  });

  /* -- Work: the strip travels sideways while the section is pinned -------- */

  function work() {
    const section = $("work");
    const strip = $("strip");
    if (!section || !strip) return;
    const pin = section.querySelector(".pin");
    const cards = [...strip.children];
    const bar = $("work-bar");
    const counter = $("work-n");
    let distance = 0; // how far the strip moves
    let travel = 0; // how far the page scrolls to move it

    const flat = () => still || innerWidth < 900 || matchMedia("(hover: none)").matches;

    function layout() {
      section.classList.toggle("flat", flat());
      if (flat()) {
        distance = travel = 0;
        section.style.removeProperty("--travel");
        strip.style.transform = "";
        return;
      }
      distance = Math.max(0, strip.offsetWidth - innerWidth);
      travel = distance * 0.7;
      section.style.setProperty("--travel", `${travel}px`);
      move();
    }

    function move() {
      if (!travel) return;
      const p = clamp((scrollY - section.offsetTop) / travel);
      strip.style.transform = `translate3d(${-p * distance}px,0,0)`;
      bar.style.transform = `scaleX(${p})`;
      // the card nearest the middle of the screen
      const mid = p * distance + innerWidth / 2;
      let near = 0;
      cards.forEach((card, i) => {
        if (Math.abs(card.offsetLeft + card.offsetWidth / 2 - mid) < Math.abs(cards[near].offsetLeft + cards[near].offsetWidth / 2 - mid)) near = i;
      });
      counter.textContent = String(near + 1).padStart(2, "0");
    }

    cards.forEach((card) => {
      // tabbing to a card that is off to the side brings the page to it
      card.addEventListener("focus", () => {
        if (!travel || !card.matches(":focus-visible")) return;
        pin.scrollLeft = 0;
        const want = clamp((card.offsetLeft + card.offsetWidth / 2 - innerWidth / 2) / distance);
        scrollTo({ top: section.offsetTop + want * travel, behavior: "auto" });
      });
      card.addEventListener("pointermove", (ev) => {
        if (still || ev.pointerType === "touch") return;
        const box = card.getBoundingClientRect();
        const x = (ev.clientX - box.left) / box.width, y = (ev.clientY - box.top) / box.height;
        card.style.setProperty("--ry", `${(x - 0.5) * 9}deg`);
        card.style.setProperty("--rx", `${(0.5 - y) * 7}deg`);
        card.style.setProperty("--mx", `${x * 100}%`);
        card.style.setProperty("--my", `${y * 100}%`);
      });
      card.addEventListener("pointerleave", () => {
        card.style.setProperty("--ry", "0deg");
        card.style.setProperty("--rx", "0deg");
      });
    });

    addEventListener("scroll", move, { passive: true });
    addEventListener("resize", layout);
    addEventListener("load", layout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
    layout();
  }

  /* -- the Index: its count, a filter, and the stars ----------------------- */

  function index() {
    const list = $("repo-list");
    const input = $("repo-filter");
    if (!list || !input) return;
    const groups = () => [...list.querySelectorAll(".lang-group")];

    function built() {
      const all = groups();
      if (!all.length) return false;
      const total = $("index-n");
      if (total) total.textContent = list.querySelectorAll(".index-row").length;
      chart(all);
      return true;
    }

    function filter() {
      const q = input.value.trim().toLowerCase();
      for (const group of groups()) {
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

  /* -- Path: a trail drawn through the four camps -------------------------- */

  function climb() {
    const box = $("climb");
    const trail = $("trail");
    if (!box || !trail) return;
    const dots = [...box.querySelectorAll("li > i")];

    function route() {
      const frame = box.getBoundingClientRect();
      const pts = dots.map((dot) => {
        const r = dot.getBoundingClientRect();
        return [r.left + r.width / 2 - frame.left, r.top + r.height / 2 - frame.top];
      });
      let d = `M${pts[0][0]},${pts[0][1]}`;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        const bend = (x1 - x0) * 0.5;
        d += ` C${x0 + bend},${y0} ${x1 - bend},${y1} ${x1},${y1}`;
      }
      trail.setAttribute("d", d);
    }

    route();
    addEventListener("resize", route);
    addEventListener("load", route);
    new IntersectionObserver(
      ([entry], seen) => {
        if (!entry.isIntersecting) return;
        route();
        box.classList.add("in");
        seen.disconnect();
      },
      { threshold: 0.3 },
    ).observe(box);
  }

  /* -- contact ------------------------------------------------------------- */

  function contact() {
    const button = $("copy-mail");
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

  work();
  index();
  climb();
  contact();
})();
