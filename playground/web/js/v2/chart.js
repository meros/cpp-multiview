// The bar chart of spec section 6: time per query, group by group, one pair of bars per group.
// chartModel() is pure (run data in, numbers out); renderChart() draws the SVG.

import { COPY_NAMES } from "./narrate.js";
import { int, sig, time, ratioWords } from "./format.js";
import { s, h, showTip, hideTip } from "./ui.js";

const NICE = [1, 2, 5, 10];
export const niceTop = (x) => {
  if (!(x > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  for (const n of NICE) if (n * p >= x * 0.9999) return n * p;
  return 10 * p;
};

// series: the copies to draw, other copy first and adaptive (0) last. line: a source line or null.
export function chartModel(run, { series, line = null } = {}) {
  if (!run || !run.blocks.length || !series || !series.length) return null;
  const tickNs = run.clock.tickUs * 1000;
  const B = run.B;
  const block = line ? run.blocks.find((b) => b.line === line) : run.blocks.reduce((a, b) => (b.ops.length > a.ops.length ? b : a), run.blocks[0]);
  if (!block) return null;
  const drawn = series.filter((c) => run.ranCopies.includes(c) && c !== undefined);
  if (!drawn.includes(0)) return null;

  const byG = new Map();
  block.ops.forEach((op, k) => {
    const g = Math.floor(op / B);
    const e = byG.get(g);
    if (e) { e.count++; e.qb = k + 1; } else byG.set(g, { g, count: 1, qa: k + 1, qb: k + 1 });
  });
  const groups = [...byG.values()];
  const pure = groups.filter((e) => e.count === run.groupOps[e.g]);
  const useGroups = pure.length >= 2 ? pure : groups;
  if (useGroups.length < 2) return null;
  const mixed = useGroups !== pure;

  const bars = useGroups.map((e) => {
    const ops = run.groupOps[e.g];
    const vals = {};
    for (const c of drawn) {
      const ns = run.groupNs[c][e.g];
      if (!(ns === ns)) continue;
      const bound = ns * ops < 10 * tickNs;
      vals[c] = { ns, draw: bound ? (10 * tickNs) / ops : ns, bound };
    }
    return { g: e.g, qa: e.qa, qb: e.qb, n: e.count, vals };
  });
  const top = niceTop(Math.max(...bars.flatMap((b) => Object.values(b.vals).map((v) => v.draw))));

  // markers: builds and drops of this block, at most 3, before the group that holds them
  const markers = [];
  for (const ev of run.events) {
    if (markers.length >= 3) break;
    if (ev.type === "trial") continue;
    const k = block.ops.indexOf(ev.op);
    if (k < 0) continue;
    const q = k + 1;
    let idx = bars.findIndex((b) => q >= b.qa && q <= b.qb);
    if (idx < 0) idx = bars.findIndex((b) => b.qa > q);
    if (idx < 0) continue;
    markers.push({ index: idx, type: ev.type, label: ev.type === "build" ? `built ${ev.kind} on ${ev.field}` : `dropped ${ev.kind}` });
  }

  const last = bars[bars.length - 1];
  const other = drawn.find((c) => c !== 0);
  let lastRatio = null;
  if (other !== undefined && last.vals[0] && last.vals[other]) {
    const a = last.vals[0], o = last.vals[other];
    const bound = a.bound && !o.bound;
    if (!(a.bound && o.bound)) lastRatio = { r: o.draw / a.draw, bound, words: ratioWords(o.draw / a.draw, { bound }) };
  }
  const noun = block.kind === "query" ? "queries" : block.kind === "update" ? "updates" : "operations";
  return {
    block, bars, top, markers, drawn, other, mixed, lastRatio, noun, B, tickUs: run.clock.tickUs,
    per: block.kind === "query" ? "query" : block.kind === "update" ? "update" : "operation",
    xLabel: `${noun} ${int(bars[0].qa)} to ${int(last.qb)}, in groups of ${int(B)}`,
    line: block.line,
  };
}

// The sentence parts the captions of spec section 6 need.
export function captionCtx(step, model) {
  if (!model) return {};
  const lr = model.lastRatio;
  if (step.id === 3) {
    if (!lr) return {};
    return { ratio: lr.words === "about the same" ? "about the same as" : `${lr.words} than` };
  }
  if (step.id === 9) {
    if (!lr) return {};
    return { ratio: lr.words === "about the same" ? "about the same" : `${sig(lr.r >= 1 ? lr.r : 1 / lr.r, 2)} times apart` };
  }
  if (step.id === 10) return { copy: model.other !== undefined ? COPY_NAMES[model.other] : null, line: model.line };
  return {};
}

const seriesClass = (c) => (c === 0 ? "s1" : c === 3 ? "s3" : "s2");

function hatchDefs(svg) {
  const defs = s("defs", {}, svg);
  for (const k of ["s1", "s2", "s3"]) {
    const p = s("pattern", { id: `mv-hatch-${k}`, width: 4, height: 4, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
    s("rect", { width: 4, height: 4, class: "mv-bar-chart__hatch-bg" }, p);
    s("line", { x1: 0, y1: 0, x2: 0, y2: 4, class: `mv-bar-chart__hatch-line mv-bar-chart__hatch-line--${k}` }, p);
  }
}

const us = (ns) => sig(ns / 1000, 2);

// Draws the chart into `host` (emptied). opts: { width, caption, narrow }
export function renderChart(host, model, { width = 480, caption = "", narrow = false } = {}) {
  hideTip();
  host.textContent = "";
  if (!model) return;
  const W = Math.max(260, Math.floor(width));
  const plotH = narrow ? 180 : 200, band = 24, axisH = 40;
  const H = band + plotH + axisH;
  const left = 44, right = narrow ? 76 : 92;
  const x0 = left, x1 = W - right;
  const n = model.bars.length;
  const slot = (x1 - x0) / n;
  const two = model.drawn.length > 1;
  const bw = Math.max(2, Math.min(two ? 14 : 24, (slot * 0.7) / (two ? 2 : 1)));
  const y = (ns) => band + plotH - (ns / model.top) * plotH;
  const title = `µs per ${model.per}`;

  const fig = h("figure", { class: "mv-bar-chart mv-bar-chart--columns" });
  const titleEl = h("h3", { class: "mv-bar-chart__title", id: "pg-chart-title", text: title });
  fig.append(titleEl);
  const svg = s("svg", { class: "mv-bar-chart__plot", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-labelledby": "pg-chart-title pg-chart-desc" }, fig);
  hatchDefs(svg);

  // grid and y labels: 0, half, top
  for (const f of [0, 0.5, 1]) {
    const v = model.top * f;
    s("line", { x1: x0, y1: y(v), x2: x1, y2: y(v), class: f === 0 ? "mv-bar-chart__axis" : "mv-bar-chart__grid" }, svg);
    const t = s("text", { x: x0 - 8, y: y(v) + 4, class: "mv-bar-chart__tick-label", "text-anchor": "end" }, svg);
    t.textContent = f === 0 ? "0" : us(v);
  }
  // events
  model.markers.forEach((m, i) => {
    const mx = x0 + slot * m.index;
    s("line", { x1: mx, y1: 4, x2: mx, y2: y(0), class: "mv-bar-chart__annotation-line" }, svg);
    const right_ = mx > x0 + (x1 - x0) * 0.66;
    const t = s("text", { x: right_ ? mx - 4 : mx + 4, y: 14 + (i % 2) * 0, class: "mv-bar-chart__annotation", "text-anchor": right_ ? "end" : "start" }, svg);
    t.textContent = m.label;
  });
  // bars
  const desc = [];
  const tableRows = [];
  model.bars.forEach((b, i) => {
    const cx = x0 + slot * (i + 0.5);
    const cs = model.drawn.filter((c) => b.vals[c]);
    cs.forEach((c, k) => {
      const v = b.vals[c];
      const bx = cx - (cs.length * bw) / 2 + k * bw;
      const cls = `mv-bar-chart__bar mv-bar-chart__bar--${seriesClass(c)}${v.bound ? " mv-bar-chart__bar--below-res" : ""}`;
      const hgt = Math.max(1, y(0) - y(v.draw));
      const rect = s("rect", { x: bx, y: y(v.draw), width: Math.max(1, bw - (cs.length > 1 ? 1 : 0)), height: hgt, rx: 2, class: cls, tabindex: 0 }, svg);
      rect.style.setProperty("--_bar-delay", `${Math.min(i, 30) * 15}ms`);
      const tipText = `${model.noun} ${int(b.qa)} to ${int(b.qb)}: ${v.bound ? "< " : ""}${time(v.draw)} each (${COPY_NAMES[c]})`;
      rect.setAttribute("aria-label", tipText);
      const show = () => showTip(tipText, rect.getBoundingClientRect());
      rect.addEventListener("pointerenter", show);
      rect.addEventListener("pointerleave", hideTip);
      rect.addEventListener("focus", show);
      rect.addEventListener("blur", hideTip);
      rect.addEventListener("click", show);
    });
    tableRows.push(h("tr", {}, h("td", { text: `${int(b.qa)} to ${int(b.qb)}` }), ...model.drawn.map((c) => h("td", { text: b.vals[c] ? `${b.vals[c].bound ? "< " : ""}${time(b.vals[c].draw)}` : "" }))));
  });
  // series names at the right end, next to the last bar
  const last = model.bars[n - 1];
  const names = model.drawn.filter((c) => last.vals[c]).map((c) => ({ c, y: y(last.vals[c].draw) }));
  names.sort((a, b) => a.y - b.y);
  for (let i = 1; i < names.length; i++) if (names[i].y - names[i - 1].y < 15) names[i].y = names[i - 1].y + 15;
  for (const nm of names) {
    const t = s("text", { x: x1 + 8, y: Math.min(nm.y + 4, band + plotH - 2), class: "mv-bar-chart__category" }, svg);
    t.textContent = COPY_NAMES[nm.c];
  }
  // x axis: ticks at the first, middle and last group (first and last only on narrow screens)
  const ticks = narrow ? [0, n - 1] : [...new Set([0, Math.floor((n - 1) / 2), n - 1])];
  for (const i of ticks) {
    const b = model.bars[i];
    const cx = x0 + slot * (i + 0.5);
    const t = s("text", { x: cx, y: band + plotH + 16, class: "mv-bar-chart__tick-label", "text-anchor": i === 0 ? "start" : i === n - 1 ? "end" : "middle" }, svg);
    t.textContent = int(i === n - 1 ? b.qb : b.qa);
  }
  const xl = s("text", { x: (x0 + x1) / 2, y: band + plotH + 34, class: "mv-bar-chart__tick-label", "text-anchor": "middle" }, svg);
  xl.textContent = model.xLabel;

  const bounds = model.bars.some((b) => Object.values(b.vals).some((v) => v.bound));
  desc.push(`Time per ${model.per} for ${model.xLabel}. ` + model.drawn.map((c) => `${COPY_NAMES[c]}: ${time(model.bars[0].vals[c] ? model.bars[0].vals[c].draw : 0)} in the first group, ${time(last.vals[c] ? last.vals[c].draw : 0)} in the last.`).join(" "));
  fig.append(h("span", { class: "mv-bar-chart__desc", id: "pg-chart-desc", text: desc.join(" ") }));
  fig.append(h("table", { class: "mv-bar-chart__table" }, h("caption", { text: title }), h("thead", {}, h("tr", {}, h("th", { text: model.noun }), ...model.drawn.map((c) => h("th", { text: COPY_NAMES[c] })))), h("tbody", {}, ...tableRows)));
  const extra = [];
  if (bounds) extra.push(`Hatched bars are below the clock resolution of ${time(model.tickUs * 1000)}: the true time is somewhere inside the hatched range.`);
  if (model.mixed) extra.push("Groups hold operations of more than one line, so a bar is their average.");
  fig.append(h("figcaption", { class: "mv-bar-chart__caption", text: [caption, ...extra].filter(Boolean).join(" ") }));
  host.append(fig);
}
