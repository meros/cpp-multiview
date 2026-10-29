// Sweep chart (spec 6.2): ns per op against table size, log-log, with a proportional reference line.
import { h } from "../dom.js";
import { fmtNs, fmtRatio, fmtInt } from "../format.js";
import { logRange } from "../aggregate.js";
import { logScale, logTicks, tickLabel, spreadLabels, nearestIndex } from "./chart-math.js";
import { COPIES, palette, setupCanvas, drawMarker, drawCue, drawEmpty, createTooltip, observeResize, frameScheduler, swatch } from "./chart-kit.js";

export const SWEEP_TITLE = "time per operation against table size (log scale on both axes)";

export const sizeLabel = (n) => (n >= 1000 ? `${n / 1000}k` : String(n));

export function createSweep({ store, host }) {
  const wrap = h("div", { class: "chart-wrap" });
  const canvas = h("canvas", { class: "chart-canvas sweep-canvas", role: "img", tabindex: "0", "aria-label": "Sweep: time per operation against table size. No data yet." });
  wrap.append(canvas);
  host.append(wrap);
  const tip = createTooltip(wrap);
  let hover = -1;
  let xs = [];
  let plot = { L: 0, R: 0, T: 0, B: 0 };

  function draw() {
    const s = store.get();
    const pal = palette();
    const { g, w, h: height } = setupCanvas(canvas);
    const sizes = s.sweepSizes;
    const L = w < 520 ? 52 : 64;
    const R = w - Math.min(170, Math.max(92, Math.round(w * 0.27)));
    const T = 34;
    const B = height - 28;
    plot = { L, R, T, B };
    const shown = s.shownCopies.map((v, k) => (v ? k : -1)).filter((k) => k >= 0);
    const entries = s.sweep;
    const xLo = Math.log10(sizes[0]);
    const xHi = Math.log10(sizes[sizes.length - 1]);
    const xAt = (rows) => L + ((Math.log10(rows) - xLo) / (xHi - xLo || 1)) * (R - L - 24) + 12;
    xs = sizes.map(xAt);

    const scan0 = entries.find((e) => e.rows === sizes[0]);
    const refAt = (rows) => (scan0 && scan0.ns[1] > 0 ? (scan0.ns[1] * rows) / sizes[0] : NaN);
    const values = [];
    for (const e of entries) for (const k of shown) if (e.ns[k] > 0) values.push(e.ns[k]);
    if (scan0) values.push(refAt(sizes[sizes.length - 1]));
    if (!entries.length) {
      drawEmpty(g, w, height, "Press Run sweep to build the table at four sizes.", pal);
      g.fillStyle = pal.muted;
      g.font = `12px ${pal.sans}`;
      g.textAlign = "center";
      sizes.forEach((r, i) => g.fillText(sizeLabel(r), xs[i], height - 8));
      canvas.setAttribute("aria-label", "Sweep: time per operation against table size. No data yet.");
      return;
    }
    const [lo, hi] = logRange(values);
    const yOf = logScale(lo, hi, B, T);
    const t = logTicks(lo, hi);
    g.lineWidth = 1;
    g.strokeStyle = pal.grid;
    g.globalAlpha = 0.6;
    for (const v of t.minor) { const y = yOf(v); g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke(); }
    g.globalAlpha = 1;
    g.fillStyle = pal.muted;
    g.font = `12px ${pal.sans}`;
    g.textAlign = "right";
    g.textBaseline = "middle";
    for (const v of t.major) {
      const y = yOf(v);
      g.strokeStyle = pal.gridStrong;
      g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke();
      g.fillText(tickLabel(v), L - 6, y);
    }
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    sizes.forEach((r, i) => {
      g.strokeStyle = pal.grid;
      g.beginPath(); g.moveTo(xs[i], T); g.lineTo(xs[i], B); g.stroke();
      g.fillText(sizeLabel(r), xs[i], height - 8);
    });

    // Reference line: proportional to rows.
    if (scan0 && scan0.ns[1] > 0) {
      g.save();
      g.setLineDash([2, 4]);
      g.strokeStyle = pal.muted;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(xAt(sizes[0]), yOf(refAt(sizes[0])));
      g.lineTo(xAt(sizes[sizes.length - 1]), yOf(refAt(sizes[sizes.length - 1])));
      g.stroke();
      g.restore();
      g.fillStyle = pal.muted;
      g.textAlign = "left";
      g.fillText("proportional to rows", xAt(sizes[1] ?? sizes[0]) - 40, yOf(refAt(sizes[1] ?? sizes[0])) - 8);
    }

    // Lines and markers.
    for (const k of [...shown].reverse()) {
      g.save();
      g.setLineDash(COPIES[k].dash);
      g.lineWidth = k === 0 ? 2.5 : 1.5;
      g.strokeStyle = pal.copy[k];
      let prev = null;
      for (const e of entries) {
        if (!(e.ns[k] > 0)) { prev = null; continue; }
        const cur = { x: xAt(e.rows), y: yOf(e.ns[k]) };
        if (prev) {
          g.globalAlpha = e.noisy[k] ? 0.4 : 1;
          g.beginPath(); g.moveTo(prev.x, prev.y); g.lineTo(cur.x, cur.y); g.stroke();
        }
        prev = cur;
      }
      g.restore();
      for (const e of entries) if (e.ns[k] > 0) drawMarker(g, COPIES[k].marker, xAt(e.rows), yOf(e.ns[k]), 4, pal.copy[k], e.noisy[k], pal.panel);
    }

    // Lesson annotation at the last scan point.
    const cue = s.cues.find((c) => c.sweepRatio);
    const lastE = entries[entries.length - 1];
    if (cue && scan0 && lastE !== scan0 && lastE.ns[1] > 0) {
      const x = lastE.ns[1] / scan0.ns[1];
      drawCue(g, `${fmtRatio(x)} the cost at ${fmtInt(sizes[0])} rows`, xAt(lastE.rows), 6, yOf(lastE.ns[1]), L, R, pal);
    }

    // Direct labels.
    const ends = shown.map((k) => ({ k, e: [...entries].reverse().find((e) => e.ns[k] > 0) })).filter((x) => x.e);
    const ys = spreadLabels(ends.map((x) => yOf(x.e.ns[x.k])), 14, T + 6, B);
    g.font = `12px ${pal.sans}`;
    g.textAlign = "left";
    g.textBaseline = "middle";
    ends.forEach((x, j) => {
      g.fillStyle = pal.ink;
      g.fillText(`${COPIES[x.k].name} ${fmtNs(x.e.ns[x.k])}`, R + 10, ys[j], w - R - 12);
    });

    if (hover >= 0) {
      g.save();
      g.strokeStyle = pal.ink;
      g.globalAlpha = 0.5;
      g.beginPath(); g.moveTo(xs[hover], T); g.lineTo(xs[hover], B); g.stroke();
      g.restore();
    }
    const parts = shown.map((k) => `${COPIES[k].name} ${fmtNs(lastE.ns[k])}`);
    canvas.setAttribute("aria-label", `Sweep: time per operation at ${fmtInt(lastE.rows)} rows. ${parts.join(", ")}.`);
  }

  function tooltipNodes(s, i) {
    const rows = s.sweepSizes[i];
    const e = s.sweep.find((x) => x.rows === rows);
    const nodes = [h("div", { class: "tip-head" }, `${fmtInt(rows)} rows`)];
    if (!e) { nodes.push(h("div", { class: "tip-note" }, "Not measured yet.")); return nodes; }
    let anyNoisy = false;
    s.shownCopies.forEach((v, k) => {
      if (!v) return;
      if (e.noisy[k]) anyNoisy = true;
      const x = e.ns[k] > 0 && e.ns[1] > 0 ? e.ns[1] / e.ns[k] : NaN;
      const words = k === 1 ? "baseline" : !Number.isFinite(x) ? "" : x >= 1 ? `${fmtRatio(x)} faster than scan` : `${fmtRatio(1 / x)} slower than scan`;
      nodes.push(h("div", { class: "tip-row" }, swatch(k, 26, 10), h("span", { class: "tip-name" }, COPIES[k].name), h("span", { class: "tip-val" }, fmtNs(e.ns[k])), h("span", { class: "tip-words" }, words)));
    });
    if (anyNoisy) nodes.push(h("div", { class: "tip-note" }, "Values with hollow markers are below the clock's resolution."));
    return nodes;
  }

  function setHover(i, y) {
    const s = store.get();
    if (i < 0) { hover = -1; tip.hide(); schedule(); return; }
    hover = i;
    schedule();
    requestAnimationFrame(() => tip.show(xs[i], y ?? plot.T + 40, tooltipNodes(s, i)));
  }
  canvas.addEventListener("pointermove", (ev) => {
    const r = canvas.getBoundingClientRect();
    if (!xs.length) return;
    setHover(nearestIndex(xs, ev.clientX - r.left), ev.clientY - r.top);
  });
  canvas.addEventListener("pointerleave", () => { if (document.activeElement !== canvas) setHover(-1); });
  canvas.addEventListener("focus", () => setHover(store.get().sweepSizes.length - 1));
  canvas.addEventListener("blur", () => setHover(-1));
  canvas.addEventListener("keydown", (ev) => {
    const n = store.get().sweepSizes.length;
    let i = hover < 0 ? n - 1 : hover;
    if (ev.key === "ArrowLeft") i = Math.max(0, i - 1);
    else if (ev.key === "ArrowRight") i = Math.min(n - 1, i + 1);
    else if (ev.key === "Escape") { setHover(-1); return; }
    else return;
    ev.preventDefault();
    setHover(i);
  });

  const schedule = frameScheduler(draw);
  observeResize(wrap, schedule);
  store.subscribe(["sweep", "sweepSizes", "shownCopies", "cues", "theme", "view"], schedule);
  schedule();
  return { redraw: schedule };
}
