// Timeline chart (spec 6.1): time per operation by sample, events strip, cues, tooltip, keyboard.
import { h } from "../dom.js";
import { fmtNs, fmtRatio } from "../format.js";
import { passAggregate } from "../aggregate.js";
import { logRange } from "../aggregate.js";
import { logScale, linScale, logTicks, tickLabel, linTicks, niceCeil, spreadLabels, nearestIndex } from "./chart-math.js";
import { COPIES, palette, setupCanvas, drawMarker, drawEventMarker, drawCue, drawEmpty, createTooltip, observeResize, frameScheduler, swatch, EVENT_CLASS } from "./chart-kit.js";
import { EVENT_GLYPH } from "../events.js";

export const AXIS_TITLE_LOG = "time per operation (log scale: each line is 10× the one below)";
export const AXIS_TITLE_SPEED = "speed-up over scan only (linear scale: 10× means ten times faster)";

// The plotted value of one copy in one sample, or null when there is none.
function pointOf(s, smp, k, l) {
  let raw;
  let noisy;
  if (l >= 0) {
    if (!smp.labelOps[l]) return null;
    raw = smp.copies[k].labelNs[l];
    noisy = smp.copies[k].labelNoisy[l];
  } else {
    raw = smp.copies[k].ns;
    noisy = smp.copies[k].noisy;
  }
  return raw > 0 ? { raw, noisy } : null;
}

export function createTimeline({ store, host }) {
  const wrap = h("div", { class: "chart-wrap" });
  const canvas = h("canvas", { class: "chart-canvas timeline-canvas", role: "img", tabindex: "0", "aria-label": "Time per operation. No data yet." });
  wrap.append(canvas);
  host.append(wrap);
  const tip = createTooltip(wrap);
  let hover = -1;
  let xs = [];
  let plot = { L: 0, R: 0, T: 0, B: 0 };

  function geometry(s, w, h2, hasCue) {
    const L = w < 520 ? 52 : 64;
    const R = Math.min(170, Math.max(92, Math.round(w * 0.27)));
    const T = hasCue ? 32 : 12;
    return { L, R: w - R, T, B: h2 - 42, labelRight: w - R + 10 };
  }

  function model(s) {
    const last = s.samples[s.samples.length - 1];
    const label = s.view.chartLabel;
    const l = last && label >= 0 && label < last.labels.length ? label : -1;
    const shown = s.shownCopies.map((v, k) => (v ? k : -1)).filter((k) => k >= 0);
    const speed = s.view.chartMode === "speedup";
    const val = (smp, k) => {
      const p = pointOf(s, smp, k, l);
      if (!p || !speed) return p;
      const sc = pointOf(s, smp, 1, l);
      if (!sc) return null;
      return { raw: p.raw, v: sc.raw / p.raw, noisy: p.noisy || sc.noisy };
    };
    return { l, shown, speed, val };
  }

  function draw() {
    const s = store.get();
    const pal = palette();
    const { g, w, h: height } = setupCanvas(canvas);
    const m = model(s);
    const samples = s.samples;
    const cues = s.cues.filter((c) => c.seq !== undefined || c.pass !== undefined);
    const geo = geometry(s, w, height, cues.length > 0);
    plot = geo;
    const pw = geo.R - geo.L;
    const bottom = geo.B;
    const top = geo.T;
    xs = [];
    if (!samples.length) {
      drawEmpty(g, w, height, "Press Run to see one line per copy.", pal);
      canvas.setAttribute("aria-label", "Time per operation. No data yet.");
      return;
    }
    const n = Math.max(samples.length, 30);
    const xAt = (i) => geo.L + (i / (n - 1)) * pw;
    for (let i = 0; i < samples.length; i++) xs.push(xAt(i));

    // Values and y scale.
    const pts = m.shown.map((k) => samples.map((smp) => m.val(smp, k)));
    const flat = pts.flat().filter(Boolean).map((p) => (m.speed ? p.v : p.raw));
    let yOf;
    let tickDraw;
    if (!m.speed) {
      const [lo, hi] = logRange(flat);
      yOf = logScale(lo, hi, bottom, top);
      const t = logTicks(lo, hi);
      tickDraw = () => {
        g.lineWidth = 1;
        g.strokeStyle = pal.grid;
        g.globalAlpha = 0.6;
        for (const v of t.minor) { const y = yOf(v); g.beginPath(); g.moveTo(geo.L, y); g.lineTo(geo.R, y); g.stroke(); }
        g.globalAlpha = 1;
        g.fillStyle = pal.muted;
        g.font = `12px ${pal.sans}`;
        g.textAlign = "right";
        g.textBaseline = "middle";
        for (const v of t.major) {
          const y = yOf(v);
          g.strokeStyle = pal.gridStrong;
          g.beginPath(); g.moveTo(geo.L, y); g.lineTo(geo.R, y); g.stroke();
          g.fillText(tickLabel(v), geo.L - 6, y);
        }
      };
    } else {
      const maxV = Math.max(2, ...flat, 1);
      const minV = Math.min(1, ...flat);
      const hi = niceCeil(maxV * 1.05);
      const lo = minV < 1 ? Math.floor(minV * 10) / 10 : 1;
      yOf = linScale(lo, hi, bottom, top);
      const t = linTicks(hi, 5);
      tickDraw = () => {
        g.lineWidth = 1;
        g.font = `12px ${pal.sans}`;
        g.textAlign = "right";
        g.textBaseline = "middle";
        const ticks = [1, ...t.ticks.filter((v) => v > 1 && v >= lo)];
        for (const v of ticks) {
          const y = yOf(v);
          g.strokeStyle = v === 1 ? pal.gridStrong : pal.grid;
          g.beginPath(); g.moveTo(geo.L, y); g.lineTo(geo.R, y); g.stroke();
          g.fillStyle = pal.muted;
          g.fillText(`${v}×`, geo.L - 6, y);
        }
      };
    }
    const yv = (p) => yOf(m.speed ? p.v : p.raw);

    tickDraw();

    // Pass boundaries and labels.
    const starts = [];
    samples.forEach((smp, i) => { if (i === 0 || smp.pass !== samples[i - 1].pass) starts.push({ pass: smp.pass, i }); });
    g.strokeStyle = pal.gridStrong;
    g.lineWidth = 1;
    starts.forEach((st, j) => {
      if (j === 0) return;
      const x = (xAt(st.i - 1) + xAt(st.i)) / 2;
      g.beginPath(); g.moveTo(x, top); g.lineTo(x, bottom); g.stroke();
    });
    const perPass = starts.length > 1 ? (xAt(starts[1].i) - xAt(starts[0].i)) : pw / Math.max(1, starts.length);
    const stride = Math.max(1, Math.ceil(52 / Math.max(perPass, 1)));
    g.fillStyle = pal.muted;
    g.font = `12px ${pal.sans}`;
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    starts.forEach((st, j) => { if (j % stride === 0) g.fillText(`pass ${st.pass}`, xAt(st.i) - 3, bottom + 14); });

    // Pass bands from cues.
    for (const c of cues) {
      if (!c.band || c.pass === undefined) continue;
      const idxs = samples.map((smp, i) => (smp.pass === c.pass ? i : -1)).filter((i) => i >= 0);
      if (!idxs.length) continue;
      const x0 = idxs[0] > 0 ? (xAt(idxs[0] - 1) + xAt(idxs[0])) / 2 : geo.L;
      const x1 = idxs[idxs.length - 1] < samples.length - 1 ? (xAt(idxs[idxs.length - 1]) + xAt(idxs[idxs.length - 1] + 1)) / 2 : xAt(idxs[idxs.length - 1]) + 4;
      g.save();
      g.globalAlpha = 0.45;
      g.fillStyle = pal.cueBg;
      g.fillRect(x0, top, x1 - x0, bottom - top);
      g.restore();
    }

    // Event dotted lines first, so lines draw over them.
    const stripY = bottom + 30;
    samples.forEach((smp, i) => {
      for (const e of smp.events) {
        g.save();
        g.globalAlpha = 0.5;
        g.setLineDash([1, 3]);
        g.strokeStyle = e.type === "build" ? pal.build : e.type === "trial" ? pal.trial : pal.drop;
        g.beginPath(); g.moveTo(xAt(i), top); g.lineTo(xAt(i), stripY - 6); g.stroke();
        g.restore();
      }
    });

    // Series: others first, adaptive on top.
    const order = [...m.shown.keys()].sort((a, b) => m.shown[b] - m.shown[a]);
    for (const si of order) {
      const k = m.shown[si];
      g.save();
      g.setLineDash(COPIES[k].dash);
      g.lineWidth = k === 0 ? 2.5 : 1.5;
      g.strokeStyle = pal.copy[k];
      let prev = null;
      pts[si].forEach((p, i) => {
        if (!p) { prev = null; return; }
        const cur = { x: xAt(i), y: yv(p) };
        if (prev) {
          g.globalAlpha = p.noisy ? 0.4 : 1;
          g.beginPath(); g.moveTo(prev.x, prev.y); g.lineTo(cur.x, cur.y); g.stroke();
        }
        prev = cur;
      });
      g.restore();
      pts[si].forEach((p, i) => { if (p) drawMarker(g, COPIES[k].marker, xAt(i), yv(p), 3, pal.copy[k], p.noisy, pal.panel); });
    }

    // Event strip.
    samples.forEach((smp, i) => smp.events.forEach((e) => drawEventMarker(g, e.type, xAt(i), stripY, pal)));

    // Cues with a sample position.
    for (const c of cues) {
      if (c.seq === undefined) {
        if (c.band && c.pass !== undefined) {
          const i = samples.findIndex((smp) => smp.pass === c.pass);
          if (i >= 0) drawCue(g, c.text, xAt(i) + 30, 6, top, geo.L, geo.R, pal);
        }
        continue;
      }
      const i = samples.findIndex((smp) => smp.seq === c.seq);
      if (i >= 0) drawCue(g, c.text, xAt(i), 6, top, geo.L, geo.R, pal);
    }

    // Direct labels at the right end of each line.
    const ends = [];
    m.shown.forEach((k, si) => {
      for (let i = samples.length - 1; i >= 0; i--) {
        const p = pts[si][i];
        if (p) { ends.push({ k, y: yv(p), p }); break; }
      }
    });
    const ys = spreadLabels(ends.map((e) => e.y), 14, top + 6, bottom);
    g.font = `12px ${pal.sans}`;
    g.textBaseline = "middle";
    g.textAlign = "left";
    ends.forEach((e, j) => {
      g.save();
      g.setLineDash(COPIES[e.k].dash);
      g.strokeStyle = pal.copy[e.k];
      g.lineWidth = e.k === 0 ? 2.5 : 1.5;
      g.beginPath(); g.moveTo(geo.R + 2, e.y); g.lineTo(geo.R + 8, ys[j]); g.stroke();
      g.restore();
      g.fillStyle = pal.ink;
      const text = `${COPIES[e.k].name} ${m.speed ? fmtRatio(e.p.v) : fmtNs(e.p.raw)}`;
      g.fillText(text, geo.labelRight, ys[j], w - geo.labelRight - 2);
    });

    // Hover line.
    if (hover >= 0 && hover < samples.length) {
      g.save();
      g.strokeStyle = pal.ink;
      g.globalAlpha = 0.5;
      g.beginPath(); g.moveTo(xAt(hover), top); g.lineTo(xAt(hover), bottom); g.stroke();
      g.restore();
    }

    canvas.setAttribute("aria-label", ariaLabel(s));
  }

  function ariaLabel(s) {
    const last = s.samples[s.samples.length - 1];
    if (!last) return "Time per operation. No data yet.";
    const agg = passAggregate(s.samples, last.pass, s.env.timerResMs);
    const parts = s.shownCopies.map((v, k) => (v ? `${COPIES[k].name} ${fmtNs(agg.copies[k].ns)}` : null)).filter(Boolean);
    return `Time per operation. Last pass: ${parts.join(", ")}. ${s.counters.builds} builds, ${s.counters.drops} drops.`;
  }

  function tooltipNodes(s, i) {
    const m = model(s);
    const smp = s.samples[i];
    const nodes = [h("div", { class: "tip-head" }, `Pass ${smp.pass}, slice ${smp.slice + 1} (${smp.ops} ops)`)];
    let anyNoisy = false;
    const scan = pointOf(s, smp, 1, m.l);
    for (const k of m.shown) {
      const p = pointOf(s, smp, k, m.l);
      if (p && p.noisy) anyNoisy = true;
      let words = "";
      if (p && k === 1) words = "baseline";
      else if (p && scan) {
        const x = scan.raw / p.raw;
        words = x >= 1 ? `${fmtRatio(x)} faster than scan` : `${fmtRatio(1 / x)} slower than scan`;
      }
      nodes.push(h("div", { class: "tip-row" }, swatch(k, 26, 10), h("span", { class: "tip-name" }, COPIES[k].name), h("span", { class: "tip-val" }, p ? fmtNs(p.raw) : "—"), h("span", { class: "tip-words" }, words)));
    }
    for (const e of smp.events) nodes.push(h("div", { class: `tip-event ${EVENT_CLASS[e.type] || ""}` }, `${EVENT_GLYPH[e.type] || ""} ${e.text}`));
    if (anyNoisy) nodes.push(h("div", { class: "tip-note" }, "Values with hollow markers are below the clock's resolution."));
    return nodes;
  }

  function setHover(i, yHint) {
    const s = store.get();
    if (i < 0 || i >= s.samples.length) { hover = -1; tip.hide(); schedule(); return; }
    hover = i;
    schedule();
    requestAnimationFrame(() => tip.show(xs[i] ?? 0, yHint ?? plot.T + 40, tooltipNodes(s, i)));
  }

  canvas.addEventListener("pointermove", (ev) => {
    const r = canvas.getBoundingClientRect();
    const x = ev.clientX - r.left;
    if (!xs.length || x < plot.L - 8 || x > plot.R + 8) { if (hover >= 0) setHover(-1); return; }
    setHover(nearestIndex(xs, x), ev.clientY - r.top);
  });
  canvas.addEventListener("pointerleave", () => { if (document.activeElement !== canvas) setHover(-1); });
  canvas.addEventListener("focus", () => { const n = store.get().samples.length; if (n) setHover(n - 1); });
  canvas.addEventListener("blur", () => setHover(-1));
  canvas.addEventListener("keydown", (ev) => {
    const n = store.get().samples.length;
    if (!n) return;
    let i = hover < 0 ? n - 1 : hover;
    if (ev.key === "ArrowLeft") i = Math.max(0, i - 1);
    else if (ev.key === "ArrowRight") i = Math.min(n - 1, i + 1);
    else if (ev.key === "Home") i = 0;
    else if (ev.key === "End") i = n - 1;
    else if (ev.key === "Escape") { setHover(-1); return; }
    else return;
    ev.preventDefault();
    setHover(i);
  });

  const schedule = frameScheduler(draw);
  observeResize(wrap, schedule);
  store.subscribe(["samples", "shownCopies", "view", "cues", "theme"], () => {
    const n = store.get().samples.length;
    if (hover >= n) { hover = -1; tip.hide(); }
    schedule();
  });
  schedule();
  return { redraw: schedule, axisTitle: () => (store.get().view.chartMode === "speedup" ? AXIS_TITLE_SPEED : AXIS_TITLE_LOG) };
}
