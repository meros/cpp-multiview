// Living style guide of the multiview playground: fills the swatches, the type scale, the icons, the stepper and the charts,
// swaps data-icon placeholders for real SVG icons, wires the theme switch and mounts the real editor.
import { icon, ICON_NAMES } from "./icons.js";
import { createEditor } from "../editor/editor.js";
import { EXAMPLES } from "../editor/examples.js";
import { highlight } from "../editor/highlight.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// ---- styles of the style guide page itself (constructed, so no inline <style> and no extra CSS file) ----
const SG_CSS = `
.sg-main { padding-top: var(--space-8); }
.sg-lead { max-width: 64ch; margin-top: var(--space-3); }
.sg-toc { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-3); margin-top: var(--space-6); font-size: var(--text-label-size); line-height: var(--text-label-lh); }
.sg-section { margin-top: var(--space-12); padding-top: var(--space-6); border-top: var(--border); }
.sg-section > h2 { margin-top: 0; }
.sg-classes, .sg-note { max-width: 100ch; margin-top: var(--space-2); color: var(--color-text-secondary); font-size: var(--text-small-size); line-height: var(--text-small-lh); }
.sg-classes code { display: inline-block; margin: 1px 2px; padding: 0 var(--space-1); background: var(--color-surface-sunken); border-radius: var(--radius-sm); font-size: var(--text-code-sm-size); line-height: var(--text-code-sm-lh); }
.sg-note { color: var(--color-text-muted); }
.sg-label { margin-top: var(--space-6); color: var(--color-text-muted); font-size: var(--text-overline-size); line-height: var(--text-overline-lh); font-weight: var(--text-overline-weight); letter-spacing: var(--text-overline-tracking); text-transform: uppercase; }
.sg-label code { text-transform: none; letter-spacing: 0; }
.sg-demo { margin-top: var(--space-4); min-width: 0; }
.sg-row { display: flex; flex-wrap: wrap; align-items: flex-start; gap: var(--space-4); }
.sg-stack { display: grid; gap: var(--space-4); max-width: 720px; }
.sg-state { display: grid; gap: var(--space-2); justify-items: start; }
.sg-state-name { color: var(--color-text-muted); font-size: var(--text-label-size); line-height: var(--text-label-lh); }
.sg-gap-top { margin-top: var(--space-6); }
.sg-narrow { max-width: 358px; }
.sg-column-demo { max-width: var(--layout-text-col); }
.sg-column-demo .mv-lesson-step__tasks { margin-top: var(--space-8); }
.sg-tip-static { position: relative; height: 40px; min-width: 300px; }
.sg-tip-static .mv-tooltip { position: absolute; left: 0; top: 4px; animation: none; }
.sg-swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: var(--space-3); margin-top: var(--space-3); }
.sg-swatch { display: grid; gap: 2px; min-width: 0; }
.sg-swatch-chip { height: 40px; border: var(--border); border-radius: var(--radius-md); }
.sg-swatch-name { overflow-wrap: anywhere; font-family: var(--font-mono); font-size: var(--text-code-sm-size); line-height: var(--text-code-sm-lh); color: var(--color-text); }
.sg-swatch-hex { font-family: var(--font-mono); font-size: var(--text-code-sm-size); line-height: var(--text-code-sm-lh); color: var(--color-text-muted); }
.sg-group-title { margin: var(--space-6) 0 0; color: var(--color-text-secondary); font-size: var(--text-heading-size); line-height: var(--text-heading-lh); font-weight: var(--text-heading-weight); }
.sg-type-row { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: var(--space-4); align-items: baseline; padding: var(--space-3) 0; border-top: var(--border); }
.sg-type-meta { font-family: var(--font-mono); font-size: var(--text-code-sm-size); line-height: var(--text-code-sm-lh); color: var(--color-text-muted); }
.sg-type-meta b { display: block; color: var(--color-text); font-weight: var(--font-weight-semibold); }
.sg-type-sample { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.sg-scale { display: grid; gap: var(--space-2); margin-top: var(--space-3); }
.sg-scale-row { display: grid; grid-template-columns: 96px 56px minmax(0, 1fr); gap: var(--space-3); align-items: center; font-family: var(--font-mono); font-size: var(--text-code-sm-size); line-height: var(--text-code-sm-lh); color: var(--color-text-muted); }
.sg-scale-bar { height: 12px; background: var(--color-accent); border-radius: var(--radius-xs); }
.sg-radii, .sg-shadows { display: flex; flex-wrap: wrap; gap: var(--space-4); margin-top: var(--space-3); }
.sg-box { display: grid; place-items: center; width: 112px; height: 72px; background: var(--color-surface); border: var(--border); font-family: var(--font-mono); font-size: var(--text-code-sm-size); color: var(--color-text-secondary); text-align: center; }
.sg-motion { display: grid; gap: var(--space-1); margin-top: var(--space-3); font-family: var(--font-mono); font-size: var(--text-code-sm-size); line-height: var(--text-code-sm-lh); color: var(--color-text-secondary); }
.sg-icons-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--space-3); margin-top: var(--space-3); }
.sg-icon-card { display: grid; gap: var(--space-2); justify-items: start; padding: var(--space-3); background: var(--color-surface); border: var(--border); border-radius: var(--radius-lg); }
.sg-icon-sizes { display: flex; align-items: center; gap: var(--space-3); color: var(--color-text); }
.sg-icon-name { font-family: var(--font-mono); font-size: var(--text-code-sm-size); line-height: var(--text-code-sm-lh); color: var(--color-text-muted); }
.sg-pair { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
/* section titles wear the display face and the squiggle underline */
.sg-main > h1, .sg-section > h2 { font-family: var(--text-display-font); font-weight: var(--text-display-weight); letter-spacing: var(--text-display-tracking); }
.sg-section > h2 { font-size: 26px; line-height: 32px; }
.sg-paper-demo { display: grid; gap: var(--space-3); justify-items: start; padding: var(--space-6); border: var(--border); border-radius: var(--radius-lg); }
.sg-paper-card { padding: var(--space-3) var(--space-4); background: var(--color-surface); border: var(--border); border-radius: var(--radius-lg); }
.sg-radii-demo { display: flex; flex-wrap: wrap; gap: var(--space-4); }
.sg-radii-demo .sg-box { border: var(--border-hand); }
.sg-pressed { box-shadow: var(--shadow-crayon-pressed); translate: var(--crayon-press) var(--crayon-press); }
.sg-squiggles > p { margin-top: var(--space-4); }
.sg-squiggles > p:first-child { margin-top: 0; }
.sg-mascots { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: var(--space-4); }
.sg-mascot-card { display: grid; gap: var(--space-1); justify-items: start; align-content: start; padding: var(--space-4); background: var(--color-surface); border: var(--border); border-radius: var(--radius-wobble-lg); font-size: var(--text-small-size); line-height: var(--text-small-lh); color: var(--color-text-secondary); }
.sg-mascot-card .mv-mascot { margin-bottom: var(--space-2); }
.sg-mascot-card b { color: var(--color-text); font-weight: var(--font-weight-semibold); }
.sg-specimen > * + * { margin-top: var(--space-3); }
.sg-stepper-demos { display: grid; gap: var(--space-3); }
.sg-stepper-demos .mv-stepper { overflow-x: auto; padding: var(--space-2) var(--space-3); background: var(--color-bg); border: var(--border); border-radius: var(--radius-lg); }
.sg-dont { padding: var(--space-2) 0; border: 2px dashed var(--color-error-border); border-radius: var(--radius-lg); }
.sg-dont-hand { font-family: var(--font-display); font-size: var(--text-hand-size); }
.sg-frames iframe { width: 100%; height: 980px; border: var(--border); border-radius: var(--radius-lg); background: var(--color-bg); }
.sg-kit { display: none; padding-block: var(--space-6); }
.sg-kit > * + * { margin-top: var(--space-4); }
.sg-kit-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
.sg-embed body > :not(.sg-kit) { display: none !important; }
.sg-embed .sg-kit { display: block; }
.sg-kit .mv-stepper { overflow-x: auto; }
@media (max-width: 599px) { .sg-pair { grid-template-columns: minmax(0, 1fr); } .sg-type-row { grid-template-columns: minmax(0, 1fr); gap: var(--space-1); } .mv-topbar__tools > .mv-text-label { display: none; } }
`;
{
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(SG_CSS);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null) e.append(kid);
  return e;
}

function s(tag, props = {}, parent) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(props)) e.setAttribute(k, String(v));
  if (parent) parent.appendChild(e);
  return e;
}

// ---- icons: replace every [data-icon] placeholder, keeping its classes ----
function hydrateIcons(root = document) {
  for (const ph of $$("[data-icon]", root)) {
    const svg = icon(ph.dataset.icon, { size: Number(ph.dataset.size) || 20 });
    for (const c of ph.classList) svg.classList.add(c);
    if (ph.dataset.class) for (const c of ph.dataset.class.split(" ")) svg.classList.add(c);
    ph.replaceWith(svg);
  }
}

// ---- theme switch (auto removes data-theme) ----
function initTheme() {
  const group = $("#sg-theme");
  const apply = (choice) => {
    if (choice === "light" || choice === "dark") document.documentElement.setAttribute("data-theme", choice);
    else document.documentElement.removeAttribute("data-theme");
    for (const b of $$("[data-theme-choice]", group)) b.setAttribute("aria-pressed", String(b.dataset.themeChoice === choice));
    try { localStorage.setItem("mv-sg-theme", choice); } catch { /* storage may be blocked */ }
    requestAnimationFrame(renderTokenValues);
  };
  group.addEventListener("click", (e) => {
    const b = e.target.closest("[data-theme-choice]");
    if (b) apply(b.dataset.themeChoice);
  });
  let saved = "auto";
  try { saved = localStorage.getItem("mv-sg-theme") || "auto"; } catch { /* ignore */ }
  apply(saved);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => requestAnimationFrame(renderTokenValues));
}

// ---- colour ramps and roles ----
const RAMPS = [
  ["Neutral ramp (light surfaces and text)", "neutral", [0, 25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]],
  ["Night ramp (dark surfaces and text)", "night", [950, 900, 850, 800, 750, 700, 600, 500, 400, 300, 200, 100]],
  ["Brand ramp (cobalt indigo)", "brand", [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]],
];
const ROLES = [
  ["Surfaces", ["color-bg", "color-surface", "color-surface-inset", "color-surface-sunken", "color-surface-raised", "color-surface-selected"]],
  ["Text and lines", ["color-text", "color-text-secondary", "color-text-muted", "color-faint", "color-border", "color-border-strong", "color-grid", "color-grid-strong"]],
  ["Interactive", ["color-accent", "color-accent-hover", "color-accent-active", "color-on-accent", "color-accent-subtle", "color-accent-border", "color-focus"]],
  ["Insight", ["color-insight", "color-insight-bg", "color-insight-border"]],
  ["Tip", ["color-tip", "color-tip-bg", "color-tip-border"]],
  ["Warning", ["color-warning", "color-warning-bg", "color-warning-border"]],
  ["Error", ["color-error", "color-error-bg", "color-error-border"]],
  ["Success", ["color-success", "color-success-bg", "color-success-border"]],
  ["Highlight and tooltip", ["color-highlight", "color-highlight-bg", "color-tooltip-bg", "color-tooltip-text"]],
  ["Data series and chart", ["series-1", "series-2", "series-3", "chart-axis", "chart-axis-line", "chart-grid", "chart-annotation", "chart-hatch-bg"]],
  ["Syntax", ["tk-com", "tk-str", "tk-num", "tk-kw", "tk-field", "tk-pred", "tk-query", "tk-term", "tk-write", "tk-help", "tk-punct"]],
];

function swatchGroup(title, names) {
  const grid = h("div", { class: "sg-swatches" });
  for (const n of names) {
    const chip = h("div", { class: "sg-swatch-chip" });
    chip.style.background = `var(--${n})`;
    grid.append(h("div", { class: "sg-swatch" }, chip, h("span", { class: "sg-swatch-name", text: `--${n}` }), h("span", { class: "sg-swatch-hex", "data-token": n, text: "" })));
  }
  return [h("h3", { class: "sg-group-title", text: title }), grid];
}

function renderRamps() {
  const root = $("#sg-ramps");
  for (const [title, prefix, steps] of RAMPS) root.append(...swatchGroup(title, steps.map((n) => `${prefix}-${n}`)));
  for (const [title, names] of ROLES) root.append(...swatchGroup(title, names));
  renderTokenValues();
}

function toHex(value) {
  const m = value.match(/rgba?\(([^)]+)\)/);
  if (!m) return value;
  const [r, g, b] = m[1].split(/[ ,/]+/).map(Number);
  return "#" + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
}

// getComputedStyle on a custom property returns the declared text; resolve through a probe element for the real colour.
function renderTokenValues() {
  const probe = $("#sg-probe") || document.body.appendChild(h("span", { id: "sg-probe", class: "mv-visually-hidden" }));
  for (const el of $$("[data-token]")) {
    probe.style.color = `var(--${el.dataset.token})`;
    el.textContent = toHex(getComputedStyle(probe).color);
  }
  for (const el of $$("[data-type-step]")) fillTypeMeta(el);
}

// ---- type scale ----
const TYPE = [
  ["display", "The lesson heading"],
  ["title", "Chart title and end-of-path heading"],
  ["heading", "Try this, callout title, drawer summary"],
  ["lead", "The goal line under the lesson heading"],
  ["body", "Lesson body text, written to be read at a steady pace."],
  ["small", "Callout body, chart caption, tooltip, drawer body"],
  ["label", "Buttons, segmented, chips, status line"],
  ["overline", "Step 3 of 9"],
  ["code", "where(customer.eq(42)).count();"],
  ["code-sm", "412 µs  12:03:11  axis tick 500"],
  ["stat", "412 µs"],
];
function fillTypeMeta(row) {
  const sample = $(".sg-type-sample", row);
  const cs = getComputedStyle(sample);
  $(".sg-type-meta-values", row).textContent = `${cs.fontSize} / ${cs.lineHeight} · ${cs.fontWeight}`;
}
function renderType() {
  const root = $("#sg-type");
  for (const [step, text] of TYPE) {
    const sample = h("p", { class: `sg-type-sample mv-text-${step}`, text });
    const row = h("div", { class: "sg-type-row", "data-type-step": step }, h("div", { class: "sg-type-meta" }, h("b", { text: `.mv-text-${step}` }), h("span", { class: "sg-type-meta-values" })), sample);
    root.append(row);
  }
  for (const row of $$("[data-type-step]")) fillTypeMeta(row);
}

// ---- spacing, radii, shadows, motion ----
function renderShape() {
  const root = $("#sg-shape");
  const spaces = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20];
  const scale = h("div", { class: "sg-scale" });
  for (const n of spaces) {
    const bar = h("span", { class: "sg-scale-bar" });
    bar.style.width = `var(--space-${n})`;
    bar.style.minWidth = "1px";
    scale.append(h("div", { class: "sg-scale-row" }, h("span", { text: `--space-${n}` }), h("span", { "data-space": n, text: "" }), bar));
  }
  root.append(h("h3", { class: "sg-group-title", text: "Spacing" }), scale);
  for (const el of $$("[data-space]", scale)) {
    const probe = h("span", {});
    probe.style.cssText = `position:absolute;visibility:hidden;width:var(--space-${el.dataset.space})`;
    document.body.append(probe);
    el.textContent = `${probe.getBoundingClientRect().width} px`;
    probe.remove();
  }

  const radii = h("div", { class: "sg-radii" });
  for (const r of ["xs", "sm", "md", "lg", "pill"]) {
    const b = h("div", { class: "sg-box", text: `--radius-${r}` });
    b.style.borderRadius = `var(--radius-${r})`;
    radii.append(b);
  }
  root.append(h("h3", { class: "sg-group-title", text: "Radii" }), radii);

  const sh = h("div", { class: "sg-shadows" });
  for (const n of [0, 1, 2, 3]) {
    const b = h("div", { class: "sg-box", text: `--shadow-${n}` });
    b.style.borderRadius = "var(--radius-lg)";
    b.style.boxShadow = `var(--shadow-${n})`;
    sh.append(b);
  }
  root.append(h("h3", { class: "sg-group-title", text: "Elevation (dark shows lightness and borders, not shadows)" }), sh);

  const dur = h("div", { class: "sg-motion", "data-motion": "" });
  root.append(h("h3", { class: "sg-group-title", text: "Motion durations (0 ms under reduced motion)" }), dur);
  const probe = h("span", {});
  probe.style.cssText = "position:absolute;visibility:hidden";
  document.body.append(probe);
  for (const t of ["instant", "fast", "base", "slow", "chart", "progress"]) {
    probe.style.transitionDuration = `var(--dur-${t})`;
    dur.append(h("div", { text: `--dur-${t}: ${getComputedStyle(probe).transitionDuration}` }));
  }
  probe.remove();
}

// ---- icon gallery ----
function renderIcons() {
  const grid = h("div", { class: "sg-icons-grid" });
  for (const name of ICON_NAMES) {
    grid.append(h("div", { class: "sg-icon-card" },
      h("div", { class: "sg-icon-sizes" }, icon(name, { size: 14 }), icon(name, { size: 16 }), icon(name, { size: 20 }), icon(name, { size: 24, title: `${name} icon` })),
      h("span", { class: "sg-icon-name", text: `mv-icon--${name}` })));
  }
  $("#sg-icons").append(grid);
}

// ---- stepper (wide): ten steps, upcoming / current / done ----
const STEP_TITLES = ["Run a query", "Read the log", "The container builds an index", "Ask about another field", "Two indexes", "Range queries", "Unused indexes", "Writes", "Compare two plans", "Your turn"];
function fillStepper(list, current) {
  list.textContent = "";
  STEP_TITLES.forEach((title, i) => {
    const n = i + 1;
    const done = n < current;
    const dot = h("span", { class: "mv-stepper__dot" }, h("span", { class: "mv-stepper__num", text: String(n) }));
    if (done) {
      const check = icon("check", { size: 14 });
      check.classList.add("mv-stepper__check");
      dot.append(check);
    }
    const link = h("a", { class: "mv-stepper__link", href: "#stepper", title, "aria-current": n === current ? "step" : null }, dot, h("span", { class: "mv-stepper__title", text: title }));
    if (done) link.append(h("span", { class: "mv-visually-hidden", text: "completed" }));
    list.append(h("li", { class: `mv-stepper__item${done ? " mv-stepper__item--done" : ""}` }, link));
  });
}
function renderStepper() {
  const host = $("[data-sg-steppers]");
  if (host) {
    for (const current of [1, 5, 10]) {
      const nav = h("nav", { class: "mv-stepper", "aria-label": `Lesson steps, step ${current} of 10` });
      const list = h("ol", { class: "mv-stepper__list" });
      nav.append(list);
      fillStepper(list, current);
      host.append(nav);
    }
  }
  for (const list of $$("[data-sg-stepper]")) fillStepper(list, Number(list.dataset.sgStepper));
  const fill = $("#sg-progress-fill");
  if (fill) {
    fill.style.setProperty("--_n", "3");
    fill.style.setProperty("--_total", "9");
  }
}

// ---- wobble radii ----
function renderWobble() {
  const host = $("#sg-wobble");
  for (const r of ["sm", "md", "lg", "blob"]) {
    const b = h("div", { class: "sg-box", text: `--radius-wobble-${r}` });
    b.style.borderRadius = `var(--radius-wobble-${r})`;
    host.append(b);
  }
}

// ---- light and dark frames (embed mode of this same page) ----
function renderFrames() {
  const host = $("#sg-frames");
  for (const theme of ["light", "dark"]) {
    host.append(h("iframe", { src: `styleguide.html?embed=1&theme=${theme}`, title: `Handmade components, ${theme} theme`, loading: "lazy" }));
  }
}

// ---- bar charts ----
const PATTERN_IDS = ["s1", "s2", "s3"];
function hatchDefs(svg) {
  const defs = s("defs", {}, svg);
  for (const k of PATTERN_IDS) {
    const p = s("pattern", { id: `mv-hatch-${k}`, width: 4, height: 4, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
    s("rect", { width: 4, height: 4, class: "mv-bar-chart__hatch-bg" }, p);
    s("line", { x1: 0, y1: 0, x2: 0, y2: 4, class: `mv-bar-chart__hatch-line mv-bar-chart__hatch-line--${k}` }, p);
  }
}
function marker(parent, kind, cx, cy, extra = "") {
  const cls = `mv-bar-chart__marker mv-bar-chart__marker--${kind}${extra}`;
  if (kind === "s1") return s("circle", { cx, cy, r: 4, class: cls }, parent);
  if (kind === "s2") return s("rect", { x: cx - 4, y: cy - 4, width: 8, height: 8, class: cls }, parent);
  return s("polygon", { points: `${cx},${cy - 4} ${cx + 4.5},${cy + 4} ${cx - 4.5},${cy + 4}`, class: cls }, parent);
}
function text(parent, cls, x, y, str, extra = {}) {
  const t = s("text", { x, y, class: cls, ...extra }, parent);
  t.textContent = str;
  return t;
}

function chartShell(cls, titleText, id) {
  const fig = h("figure", { class: `mv-bar-chart ${cls}` });
  fig.append(h("h3", { class: "mv-bar-chart__title", id: `${id}-t`, text: titleText }));
  return fig;
}

function renderRowsChart() {
  const host = $("#sg-chart-rows");
  const fig = chartShell("mv-bar-chart--rows", "Time per query, 50 000 rows", "sg-rows");
  const W = 640, x0 = 184, x1 = 600, rowH = 32, barH = 20, domain = 500, resolution = 100;
  const data = [
    { name: "multiview", kind: "s1", value: 38, label: "< 100 µs", below: true },
    { name: "scan only", kind: "s2", value: 412, label: "412 µs" },
    { name: "grouped only", kind: "s3", value: 190, label: "190 µs" },
  ];
  const H = data.length * rowH + 32;
  const svg = s("svg", { class: "mv-bar-chart__plot", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-labelledby": "sg-rows-t sg-rows-d" }, fig);
  hatchDefs(svg);
  const x = (v) => x0 + (v / domain) * (x1 - x0);
  for (let t = 0; t <= domain; t += 100) {
    s("line", { x1: x(t), y1: 0, x2: x(t), y2: data.length * rowH, class: "mv-bar-chart__grid" }, svg);
    text(svg, "mv-bar-chart__tick-label", x(t), data.length * rowH + 20, t === domain ? `${t} µs` : String(t), { "text-anchor": t === domain ? "end" : "middle" });
  }
  s("line", { x1: x0, y1: 0, x2: x0, y2: data.length * rowH, class: "mv-bar-chart__axis" }, svg);
  data.forEach((d, i) => {
    const y = i * rowH + (rowH - barH) / 2;
    const cy = i * rowH + rowH / 2;
    marker(svg, d.kind, 12, cy, d.below ? " mv-bar-chart__marker--below-res" : "");
    text(svg, "mv-bar-chart__category", 24, cy + 4, d.name);
    const end = x(d.below ? resolution : d.value);
    const bar = s("rect", { x: x0, y, width: end - x0, height: barH, rx: 2, class: `mv-bar-chart__bar mv-bar-chart__bar--${d.kind}${d.below ? " mv-bar-chart__bar--below-res" : ""}`, tabindex: 0 }, svg);
    bar.style.setProperty("--_bar-delay", `${i * 40}ms`);
    const v = text(svg, `mv-bar-chart__value${d.below ? " mv-bar-chart__value--below-res" : ""}`, end + 6, cy + 4, d.label);
    v.style.setProperty("--_bar-delay", `${i * 40}ms`);
  });
  fig.append(h("span", { class: "mv-bar-chart__desc", id: "sg-rows-d", text: "multiview: below 100 µs. Scan only: 412 µs. Grouped only: 190 µs." }));
  fig.append(h("figcaption", { class: "mv-bar-chart__caption", text: "multiview is the fastest. Hatched bars are below the clock resolution of 100 µs: the true time is somewhere inside the hatched range. Median of 200 queries." }));
  host.append(fig);
}

function renderColumnsChart() {
  const host = $("#sg-chart-columns");
  const fig = chartShell("mv-bar-chart--columns", "Time per query over runs, 50 000 rows", "sg-cols");
  const W = 640, x0 = 56, x1 = 624, plotH = 200, band = 24, domain = 500;
  const H = band + plotH + 32;
  const runs = [412, 405, 421, 14, 12, 11];
  const svg = s("svg", { class: "mv-bar-chart__plot", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-labelledby": "sg-cols-t sg-cols-d" }, fig);
  hatchDefs(svg);
  const y = (v) => band + plotH - (v / domain) * plotH;
  for (let t = 0; t <= domain; t += 100) {
    s("line", { x1: x0, y1: y(t), x2: x1, y2: y(t), class: t === 0 ? "mv-bar-chart__axis" : "mv-bar-chart__grid" }, svg);
    text(svg, "mv-bar-chart__tick-label", x0 - 8, y(t) + 4, t === domain ? `${t} µs` : String(t), { "text-anchor": "end" });
  }
  const slot = (x1 - x0) / runs.length;
  const bw = Math.min(32, slot * 0.6);
  runs.forEach((v, i) => {
    const cx = x0 + slot * (i + 0.5);
    const bar = s("rect", { x: cx - bw / 2, y: y(v), width: bw, height: y(0) - y(v), rx: 2, class: "mv-bar-chart__bar mv-bar-chart__bar--s1", tabindex: 0 }, svg);
    bar.style.setProperty("--_bar-delay", `${i * 40}ms`);
    const val = text(svg, "mv-bar-chart__value", cx, y(v) - 4, `${v} µs`, { "text-anchor": "middle" });
    val.style.setProperty("--_bar-delay", `${i * 40}ms`);
    text(svg, "mv-bar-chart__tick-label", cx, y(0) + 18, `run ${i + 1}`, { "text-anchor": "middle" });
  });
  const lx = x0 + slot * 3;
  s("line", { x1: lx, y1: 0, x2: lx, y2: y(0), class: "mv-bar-chart__annotation-line" }, svg);
  const ic = icon("index", { size: 14 });
  ic.classList.add("mv-bar-chart__annotation-icon--built");
  ic.setAttribute("x", String(lx + 4));
  ic.setAttribute("y", "5");
  svg.appendChild(ic);
  text(svg, "mv-bar-chart__annotation", lx + 22, 17, "index built");
  fig.append(h("span", { class: "mv-bar-chart__desc", id: "sg-cols-d", text: "Runs 1 to 3 take about 410 µs. Runs 4 to 6 take about 12 µs. The index was built before run 4." }));
  fig.append(h("figcaption", { class: "mv-bar-chart__caption", text: "Run 4 is the first run that used the index. Median of 200 queries per run." }));
  host.append(fig);
}

// ---- segmented groups ----
function initSegmented() {
  for (const g of $$("[data-sg-pressed]")) {
    g.addEventListener("click", (e) => {
      const b = e.target.closest(".mv-segmented__option");
      if (!b || b.disabled) return;
      for (const o of $$(".mv-segmented__option", g)) o.setAttribute("aria-pressed", String(o === b));
    });
  }
  for (const g of $$("[data-sg-tabs]")) {
    const tabs = $$("[role=tab]", g);
    const select = (t) => {
      for (const o of tabs) { o.setAttribute("aria-selected", String(o === t)); o.tabIndex = o === t ? 0 : -1; }
      t.focus();
    };
    g.addEventListener("click", (e) => { const t = e.target.closest("[role=tab]"); if (t) select(t); });
    g.addEventListener("keydown", (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      if (e.key === "ArrowRight") select(tabs[(i + 1) % tabs.length]);
      else if (e.key === "ArrowLeft") select(tabs[(i - 1 + tabs.length) % tabs.length]);
      else return;
      e.preventDefault();
    });
  }
  for (const chip of $$(".mv-chip--interactive[aria-pressed]")) {
    chip.addEventListener("click", () => chip.setAttribute("aria-pressed", String(chip.getAttribute("aria-pressed") !== "true")));
  }
}

// ---- annotated code: legend hover and focus activate the mark ----
function initAnnotated() {
  for (const item of $$(".mv-annotated-code__legend-item")) {
    const mark = document.getElementById(item.dataset.mark);
    const on = () => mark.classList.add("mv-annotated-code__mark--active");
    const off = () => mark.classList.remove("mv-annotated-code__mark--active");
    item.addEventListener("mouseenter", on); item.addEventListener("mouseleave", off);
    item.addEventListener("focus", on); item.addEventListener("blur", off);
  }
}

// ---- tooltip (400 ms on hover, at once on focus) ----
function initTooltip() {
  let tip = null, timer = 0;
  const hide = () => { clearTimeout(timer); if (tip) { tip.remove(); tip = null; } };
  const show = (trigger) => {
    hide();
    tip = h("div", { class: "mv-tooltip", role: "tooltip", id: "sg-tip-live", text: trigger.dataset.tooltip });
    document.body.append(tip);
    const r = trigger.getBoundingClientRect(), t = tip.getBoundingClientRect();
    let top = r.top - t.height - 6 + scrollY;
    if (r.top - t.height - 6 < 0) top = r.bottom + 6 + scrollY;
    tip.style.top = `${top}px`;
    tip.style.left = `${Math.max(8, r.left + scrollX)}px`;
  };
  for (const t of $$("[data-tooltip]")) {
    t.addEventListener("pointerenter", () => { timer = setTimeout(() => show(t), 400); });
    t.addEventListener("pointerleave", hide);
    t.addEventListener("focus", () => { if (t.matches(":focus-visible")) show(t); });
    t.addEventListener("blur", hide);
    t.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  }
}

// ---- run log: replay the log-in motion ----
function initLogReplay() {
  $("#sg-log-replay").addEventListener("click", () => {
    const run = $("#sg-log-new");
    run.classList.remove("mv-run-log__run--new");
    void run.offsetWidth;
    run.classList.add("mv-run-log__run--new");
  });
}

// ---- real editor inside the code-editor chrome ----
function initEditor() {
  const card = $("#sg-editor-card");
  const status = $("#sg-run-status");
  const run = $("#sg-run");
  const first = EXAMPLES[0];
  const ed = createEditor($("#sg-editor-host"), { value: first.script, rows: 50000 });
  let busyTimer = 0;
  const setBusy = (on) => {
    if (on) card.setAttribute("aria-busy", "true"); else card.removeAttribute("aria-busy");
    if (on) run.setAttribute("aria-busy", "true"); else run.removeAttribute("aria-busy");
    const label = $(".mv-run-button__label", run);
    label.textContent = on ? "Running" : "Run";
    const old = $("svg.mv-run-button__icon", run);
    const next = icon(on ? "clock" : "play", { size: 16 });
    next.classList.add("mv-run-button__icon");
    old.replaceWith(next);
    status.textContent = on ? "Running" : "Run finished";
  };
  const doRun = () => {
    if (run.hasAttribute("aria-busy")) return;
    setBusy(true);
    clearTimeout(busyTimer);
    busyTimer = setTimeout(() => setBusy(false), 1600);
  };
  run.addEventListener("click", doRun);
  ed.on("run", doRun);
  $("#sg-reset").addEventListener("click", () => ed.setValue(first.script));
  $("#sg-copy").addEventListener("click", () => navigator.clipboard?.writeText(ed.getValue()).catch(() => {}));

  const cppHost = $("#sg-cpp-host");
  const pre = h("pre", { class: "ed-code" });
  const code = h("code");
  code.innerHTML = highlight("auto n = mv::where(customer.eq(42)).count();\nconst auto rows = table.size();  // 50000", "cpp");
  pre.append(code);
  cppHost.append(pre);
  $(".ed-code", cppHost).style.cssText = "border:0;border-radius:0 0 var(--radius-lg) var(--radius-lg);";
}

// ---- table of contents ----
function renderToc() {
  const nav = $("#sg-toc");
  for (const sec of $$(".sg-section")) nav.append(h("a", { href: `#${sec.id}`, text: $("h2", sec).textContent }));
}

const params = new URLSearchParams(location.search);
const embed = params.get("embed") === "1";
if (embed) {
  document.documentElement.classList.add("sg-embed");
  const t = params.get("theme");
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  renderStepper();
  hydrateIcons();
} else {
  renderToc();
  renderRamps();
  renderType();
  renderShape();
  renderIcons();
  renderStepper();
  renderWobble();
  renderRowsChart();
  renderColumnsChart();
  renderFrames();
  hydrateIcons();
  initSegmented();
  initAnnotated();
  initTooltip();
  initLogReplay();
  initEditor();
  initTheme();
}
