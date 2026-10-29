// Memory against time (spec 6.7): one point per shown copy, index KB on x, ns per op on y (log).
import { h, clear } from "../dom.js";
import { fmtNs, fmtKb } from "../format.js";
import { passAggregate, lastPassNumber, logRange } from "../aggregate.js";
import { logScale, linScale, logTicks, tickLabel, linTicks, niceCeil } from "./chart-math.js";
import { COPIES, palette, setupCanvas, drawMarker, drawEmpty, observeResize, frameScheduler } from "./chart-kit.js";

export function mountMemory({ store, root }) {
  const wrap = h("div", { class: "chart-wrap" });
  const canvas = h("canvas", { class: "chart-canvas memory-canvas", role: "img", "aria-label": "Memory against time. No data yet." });
  wrap.append(canvas);
  const tableBtn = h("button", { type: "button", class: "link-btn", "aria-expanded": "false", onclick: () => toggle() }, "Show data table");
  const tableBox = h("div", { class: "data-table-box", hidden: true });
  root.append(h("p", { class: "axis-title" }, "memory held by the indexes (x) against time per operation in the last pass (y, log scale)"), wrap, tableBtn, tableBox);
  let open = false;

  function points(s) {
    const last = lastPassNumber(s.samples);
    if (!last) return null;
    const agg = passAggregate(s.samples, last, s.env.timerResMs);
    const firstPass = s.samples[0].pass;
    const first = firstPass !== last ? passAggregate(s.samples, firstPass, s.env.timerResMs) : null;
    const shown = s.shownCopies.map((v, k) => (v ? k : -1)).filter((k) => k >= 0);
    return { agg, first, shown, last };
  }

  function draw() {
    const s = store.get();
    const pal = palette();
    const { g, w, h: height } = setupCanvas(canvas);
    const pts = points(s);
    if (!pts) { drawEmpty(g, w, height, "Press Run to place each copy.", pal); canvas.setAttribute("aria-label", "Memory against time. No data yet."); return; }
    const { agg, first, shown } = pts;
    const L = w < 520 ? 52 : 64;
    const R = w - 16;
    const T = 14;
    const B = height - 30;
    const kbs = shown.map((k) => agg.copies[k].bytes / 1024);
    if (first && shown.includes(0)) kbs.push(first.copies[0].bytes / 1024);
    const xMax = linTicks(niceCeil(Math.max(1, ...kbs) * 1.15), 4);
    const xAt = linScale(0, xMax.max, L + 14, R - 70);
    const ys = shown.map((k) => agg.copies[k].ns);
    if (first && shown.includes(0)) ys.push(first.copies[0].ns);
    const [lo, hi] = logRange(ys);
    const yOf = logScale(lo, hi, B, T);
    const t = logTicks(lo, hi);
    g.lineWidth = 1;
    g.font = `12px ${pal.sans}`;
    g.fillStyle = pal.muted;
    g.textAlign = "right";
    g.textBaseline = "middle";
    for (const v of t.major) { const y = yOf(v); g.strokeStyle = pal.gridStrong; g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke(); g.fillText(tickLabel(v), L - 6, y); }
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    for (const v of xMax.ticks) { const x = xAt(v); g.strokeStyle = pal.grid; g.beginPath(); g.moveTo(x, T); g.lineTo(x, B); g.stroke(); g.fillText(`${v} KB`, x, height - 10); }

    g.fillStyle = pal.muted;
    g.textAlign = "left";
    g.fillText("better: fast and small", L + 18, B - 8);

    // Arrow for the adaptive copy from its first pass to now.
    if (first && shown.includes(0)) {
      const x0 = xAt(first.copies[0].bytes / 1024);
      const y0 = yOf(first.copies[0].ns);
      const x1 = xAt(agg.copies[0].bytes / 1024);
      const y1 = yOf(agg.copies[0].ns);
      if (Math.hypot(x1 - x0, y1 - y0) > 8) {
        g.save();
        g.strokeStyle = pal.copy[0];
        g.fillStyle = pal.copy[0];
        g.globalAlpha = 0.55;
        g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        const a = Math.atan2(y1 - y0, x1 - x0);
        g.beginPath();
        g.moveTo(x1 - Math.cos(a) * 9 + Math.sin(a) * 4, y1 - Math.sin(a) * 9 - Math.cos(a) * 4);
        g.lineTo(x1 - Math.cos(a) * 9 - Math.sin(a) * 4, y1 - Math.sin(a) * 9 + Math.cos(a) * 4);
        g.lineTo(x1 - Math.cos(a) * 4, y1 - Math.sin(a) * 4);
        g.closePath(); g.fill();
        g.restore();
        drawMarker(g, "circle", x0, y0, 4, pal.copy[0], true, pal.panel);
      }
    }
    g.textBaseline = "middle";
    for (const k of shown) {
      const c = agg.copies[k];
      const x = xAt(c.bytes / 1024);
      const y = yOf(c.ns);
      drawMarker(g, COPIES[k].marker, x, y, 6, pal.copy[k], c.noisy, pal.panel);
      g.fillStyle = pal.ink;
      g.textAlign = "left";
      g.fillText(COPIES[k].name, Math.min(x + 10, w - 8 - g.measureText(COPIES[k].name).width), y - 12 + (k % 2) * 24);
    }
    canvas.setAttribute("aria-label", `Memory against time. ${shown.map((k) => `${COPIES[k].name}: ${fmtKb(agg.copies[k].bytes)} KB, ${fmtNs(agg.copies[k].ns)}`).join("; ")}.`);
  }

  function renderTable() {
    if (!open) return;
    const s = store.get();
    clear(tableBox);
    const pts = points(s);
    if (!pts) return;
    const rows = pts.shown.map((k) => h("tr", null, h("th", { scope: "row" }, COPIES[k].name), h("td", { class: "num" }, `${fmtKb(pts.agg.copies[k].bytes)} KB`), h("td", { class: "num" }, fmtNs(pts.agg.copies[k].ns))));
    tableBox.append(h("table", { class: "data" }, h("caption", null, "Index memory and time per operation, last pass"), h("thead", null, h("tr", null, h("th", { scope: "col" }, "Copy"), h("th", { scope: "col", class: "num" }, "Index memory"), h("th", { scope: "col", class: "num" }, "ns / op"))), h("tbody", null, rows)));
  }

  function toggle() {
    open = !open;
    tableBtn.setAttribute("aria-expanded", String(open));
    tableBtn.textContent = open ? "Hide data table" : "Show data table";
    tableBox.hidden = !open;
    renderTable();
  }

  const schedule = frameScheduler(() => { draw(); renderTable(); });
  observeResize(wrap, schedule);
  store.subscribe(["samples", "shownCopies", "theme"], schedule);
  schedule();
}
