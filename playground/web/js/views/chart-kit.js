// Shared canvas helpers: dpr setup, colours, markers, swatches, tooltip box, resize observer.

export const COPIES = [
  { name: "adaptive", token: "--copy-0", dash: [], marker: "circle" },
  { name: "scan only", token: "--copy-1", dash: [6, 4], marker: "square" },
  { name: "grouped only", token: "--copy-2", dash: [2, 3], marker: "triangle" },
  { name: "sorted only", token: "--copy-3", dash: [8, 3, 2, 3], marker: "diamond" },
  { name: "grouped and sorted", token: "--copy-4", dash: [12, 4], marker: "cross" },
  { name: "yours", token: "--copy-5", dash: [4, 2, 1, 2], marker: "plus" },
];

const rootStyle = () => getComputedStyle(document.documentElement);
export const cssColor = (name) => rootStyle().getPropertyValue(name).trim();

// Colours read at draw time so a theme switch only needs a redraw.
export function palette() {
  const cs = rootStyle();
  const get = (n) => cs.getPropertyValue(n).trim();
  return {
    panel: get("--panel"), ink: get("--ink"), muted: get("--muted"), grid: get("--grid"), gridStrong: get("--grid-strong"),
    line: get("--line"), good: get("--good"), bad: get("--bad"), accent: get("--accent"), cueBg: get("--cue-bg"), cueInk: get("--cue-ink"),
    build: get("--event-build"), drop: get("--event-drop"), trial: get("--event-trial"), highlight: get("--highlight"),
    copy: COPIES.map((c) => get(c.token)),
    sans: get("--sans") || "system-ui, sans-serif", mono: get("--mono") || "monospace",
  };
}

export function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(canvas.clientWidth, 10);
  const h = Math.max(canvas.clientHeight, 10);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  g.setLineDash([]);
  return { g, w, h };
}

export function drawMarker(g, shape, x, y, r, color, hollow, panel) {
  g.save();
  g.setLineDash([]);
  g.lineWidth = 1.5;
  g.strokeStyle = color;
  g.fillStyle = hollow ? panel : color;
  g.beginPath();
  switch (shape) {
    case "circle": g.arc(x, y, r, 0, Math.PI * 2); break;
    case "square": g.rect(x - r, y - r, 2 * r, 2 * r); break;
    case "triangle": g.moveTo(x, y - r - 0.5); g.lineTo(x + r + 0.5, y + r); g.lineTo(x - r - 0.5, y + r); g.closePath(); break;
    case "diamond": g.moveTo(x, y - r - 1); g.lineTo(x + r + 1, y); g.lineTo(x, y + r + 1); g.lineTo(x - r - 1, y); g.closePath(); break;
    case "cross": g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); break;
    case "plus": g.moveTo(x - r - 1, y); g.lineTo(x + r + 1, y); g.moveTo(x, y - r - 1); g.lineTo(x, y + r + 1); break;
    default: g.arc(x, y, r, 0, Math.PI * 2);
  }
  if (shape === "cross" || shape === "plus") {
    g.globalAlpha = hollow ? 0.5 : 1;
    g.stroke();
  } else {
    g.fill();
    g.stroke();
  }
  g.restore();
}

const SVG = "http://www.w3.org/2000/svg";
const svgEl = (name, attrs) => {
  const el = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

// A small inline swatch: dash pattern with the marker on it, in the copy's colour token.
export function swatch(k, width = 28, height = 12) {
  const c = COPIES[k];
  const svg = svgEl("svg", { width, height, viewBox: `0 0 ${width} ${height}`, "aria-hidden": "true", class: "swatch" });
  const color = `var(${c.token})`;
  svg.append(svgEl("line", { x1: 1, y1: height / 2, x2: width - 1, y2: height / 2, stroke: color, "stroke-width": k === 0 ? 2.5 : 1.5, "stroke-dasharray": c.dash.join(" ") || "none" }));
  const cx = width / 2;
  const cy = height / 2;
  const r = 3;
  const common = { fill: color, stroke: color, "stroke-width": 1.5 };
  let m;
  switch (c.marker) {
    case "circle": m = svgEl("circle", { cx, cy, r, ...common }); break;
    case "square": m = svgEl("rect", { x: cx - r, y: cy - r, width: 2 * r, height: 2 * r, ...common }); break;
    case "triangle": m = svgEl("polygon", { points: `${cx},${cy - r - 1} ${cx + r + 1},${cy + r} ${cx - r - 1},${cy + r}`, ...common }); break;
    case "diamond": m = svgEl("polygon", { points: `${cx},${cy - r - 1} ${cx + r + 1},${cy} ${cx},${cy + r + 1} ${cx - r - 1},${cy}`, ...common }); break;
    case "cross": m = svgEl("path", { d: `M${cx - r} ${cy - r}L${cx + r} ${cy + r}M${cx + r} ${cy - r}L${cx - r} ${cy + r}`, fill: "none", stroke: color, "stroke-width": 1.5 }); break;
    default: m = svgEl("path", { d: `M${cx - r - 1} ${cy}H${cx + r + 1}M${cx} ${cy - r - 1}V${cy + r + 1}`, fill: "none", stroke: color, "stroke-width": 1.5 });
  }
  svg.append(m);
  return svg;
}

// Event glyph as a text character with the event colour class.
export const EVENT_CLASS = { build: "ev-build", drop: "ev-drop", "rent-drop": "ev-drop", trial: "ev-trial", disagree: "ev-drop" };

// Draw one event marker at (x, y) on the canvas.
export function drawEventMarker(g, type, x, y, pal) {
  g.save();
  g.setLineDash([]);
  const color = type === "build" ? pal.build : type === "trial" ? pal.trial : pal.drop;
  g.fillStyle = color;
  g.strokeStyle = color;
  g.beginPath();
  if (type === "build") { g.moveTo(x, y - 6); g.lineTo(x + 5, y + 3); g.lineTo(x - 5, y + 3); g.closePath(); g.fill(); }
  else if (type === "trial") { g.moveTo(x, y - 6); g.lineTo(x + 5, y); g.lineTo(x, y + 6); g.lineTo(x - 5, y); g.closePath(); g.fill(); }
  else if (type === "disagree") { g.font = `bold 13px ${pal.sans}`; g.textAlign = "center"; g.fillText("!", x, y + 5); }
  else {
    g.moveTo(x, y + 6); g.lineTo(x + 5, y - 3); g.lineTo(x - 5, y - 3); g.closePath(); g.fill();
    if (type === "rent-drop") { g.lineWidth = 2; g.beginPath(); g.moveTo(x - 6, y - 5); g.lineTo(x + 6, y - 5); g.stroke(); }
  }
  g.restore();
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// Cue label above the plot with a leader line to x.
export function drawCue(g, text, x, yTop, yPlot, left, right, pal) {
  g.save();
  g.font = `12px ${pal.sans}`;
  const pad = 6;
  const w = g.measureText(text).width + pad * 2;
  const bx = Math.min(Math.max(x - w / 2, left), right - w);
  g.strokeStyle = pal.cueInk;
  g.globalAlpha = 0.7;
  g.setLineDash([3, 3]);
  g.beginPath();
  g.moveTo(x, yTop + 20);
  g.lineTo(x, yPlot);
  g.stroke();
  g.globalAlpha = 1;
  g.setLineDash([]);
  g.fillStyle = pal.cueBg;
  roundRect(g, bx, yTop, w, 20, 6);
  g.fill();
  g.strokeStyle = pal.highlight;
  g.stroke();
  g.fillStyle = pal.cueInk;
  g.textBaseline = "middle";
  g.textAlign = "left";
  g.fillText(text, bx + pad, yTop + 10.5);
  g.restore();
}

export function drawEmpty(g, w, h, text, pal) {
  g.save();
  g.fillStyle = pal.muted;
  g.font = `13px ${pal.sans}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2);
  g.restore();
}

// Tooltip: a positioned div inside the chart wrapper. content is an array of nodes.
export function createTooltip(wrap) {
  const el = document.createElement("div");
  el.className = "chart-tip";
  el.setAttribute("role", "presentation");
  el.hidden = true;
  wrap.append(el);
  return {
    show(x, y, nodes) {
      el.textContent = "";
      el.append(...nodes);
      el.hidden = false;
      const ww = wrap.clientWidth;
      const tw = el.offsetWidth;
      const th = el.offsetHeight;
      let left = x + 14;
      if (left + tw > ww - 4) left = Math.max(4, x - tw - 14);
      let top = Math.min(Math.max(y - th / 2, 4), Math.max(4, wrap.clientHeight - th - 4));
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    },
    hide() { el.hidden = true; },
  };
}

export function observeResize(el, fn) {
  if (typeof ResizeObserver === "function") {
    let raf = 0;
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fn); });
    ro.observe(el);
    return () => ro.disconnect();
  }
  window.addEventListener("resize", fn);
  return () => window.removeEventListener("resize", fn);
}

// Coalesce redraw requests into one per animation frame.
export function frameScheduler(fn) {
  let raf = 0;
  return () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; fn(); });
  };
}
