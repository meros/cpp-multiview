// The v2 page: wiring, step navigation (#step-N), persistence of the code of each step.
import { createEditor } from "../editor/editor.js";
import { EXAMPLES } from "../editor/examples.js";
import { loadBridge } from "./bridge.js";
import { compileForRun, executeRun, warmUp } from "./run.js";
import { narrate } from "./narrate.js";
import { explainError } from "./errors.js";
import { chartModel, renderChart, captionCtx } from "./chart.js";
import { renderAnnotated } from "./annotate.js";
import { attachTokenTips } from "./tooltips.js";
import { createSyntaxDrawer } from "./syntax-card.js";
import { createLog, RUN_KEYS } from "./run-output.js";
import {
  STEPS, STEP_COUNT, FIRST_USE, ROW_CHOICES, DEFAULT_RENT, COMPARE_CHOICES, RENT_CHOICES, FREE_PLAY_EXAMPLES,
  LAB_HREF, LAB_TEXT, captionFor, stepById,
} from "./steps.js";
import { $, $$, h, ic, rich, store, tipOn } from "./ui.js";

// Smallest step of performance.now() in microseconds, with a hard budget of 30 ms of wall time
// (js/timer.js busy-waits 2 000 ticks, which takes seconds on a clock with a coarse tick).
function measureTick() {
  const t0 = Date.now();
  let best = Infinity;
  for (let i = 0; i < 200 && Date.now() - t0 < 30; i++) {
    const a = performance.now();
    let b = performance.now();
    let spins = 0;
    while (b === a && spins++ < 200000 && Date.now() - t0 < 30) b = performance.now();
    if (b > a) best = Math.min(best, (b - a) * 1000);
  }
  return isFinite(best) ? best : 1000;
}

const codeKey = (id) => `mv2:code:${id}`;
const rowLabel = (n) => (n >= 1000 ? `${n / 1000}k` : String(n));
const rowAria = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} rows`;
const narrowMq = matchMedia("(max-width: 599px)");
const phoneMq = matchMedia("(max-width: 759px)");
const desktopMq = matchMedia("(min-width: 1100px)");

const state = {
  stepId: 1,
  rows: 50000,
  compare: 1,           // step 10: the copy to compare with (null = none)
  rentMul: 1,           // step 10: index into RENT_CHOICES
  runNumber: 0,
  tableWarm: false,     // a table exists that "Run again" can reuse
  running: false,
  runToken: 0,
  stopRequested: false,
  lastRun: null,
  lastModel: null,
  undo: null,           // { code, label } for the Show me / example undo
  bridge: null,
  warm: null,
  clock: { tickUs: 5, isolated: false },
};

// ---- elements -------------------------------------------------------------------------------------
const el = {
  heading: $("#step-heading"), overline: $("#step-overline"), goal: $("#step-goal"),
  details: $("#step-details"), body: $("#step-body"), annotations: $("#step-annotations"), tryList: $("#step-try"), nav: $("#step-nav"),
  settings: $("#settings"), editorHost: $("#editor-host"), editorCard: $("#editor-card"),
  run: $("#run-button"), reset: $("#reset-button"), syntax: $("#syntax-chip"), again: $("#again-button"), show: $("#show-button"),
  tip: $("#tip-area"), done: $("#step-done"), examples: $("#examples"), examplesList: $("#examples-list"),
  logRoot: $("#run-log"), chart: $("#chart-host"), lab: $("#lab-link"),
  stepperList: $("#stepper-list"), count: $("#step-count"), countCompact: $("#step-count-compact"), titleCompact: $("#step-title-compact"),
  progress: $("#step-progress"), progressFill: $("#step-progress-fill"),
  prev: $$(".js-prev"), next: $$(".js-next"), live: $("#live-status"),
};

let editor = null;
let log = null;
let drawer = null;
let annotationFigs = [];

// ---- small helpers ---------------------------------------------------------------------------------------
const say = (text) => { el.live.textContent = ""; requestAnimationFrame(() => { el.live.textContent = text; }); };

function setRunButton(mode) {
  const label = el.run.querySelector(".mv-run-button__label");
  const set = (name, text) => {
    el.run.querySelector(".mv-run-button__icon").replaceWith(ic(name, 16, "mv-run-button__icon"));
    label.textContent = text;
  };
  if (mode === "loading") { el.run.setAttribute("aria-disabled", "true"); el.run.dataset.tooltip = "Loading the engine"; }
  else { el.run.removeAttribute("aria-disabled"); delete el.run.dataset.tooltip; }
  if (mode === "running") { el.run.setAttribute("aria-busy", "true"); el.editorCard.setAttribute("aria-busy", "true"); set("stop", "Stop"); }
  else { el.run.removeAttribute("aria-busy"); el.editorCard.removeAttribute("aria-busy"); set(mode === "loading" ? "clock" : "play", "Run"); }
}

// Swap every [data-icon] placeholder of the page for the SVG icon.
function hydrateIcons(root = document) {
  for (const ph of $$("[data-icon]", root)) {
    const svg = ic(ph.dataset.icon, Number(ph.dataset.size) || 16);
    for (const c of ph.classList) svg.classList.add(c);
    if (ph.dataset.class) for (const c of ph.dataset.class.split(" ")) svg.classList.add(c);
    ph.replaceWith(svg);
  }
}

function currentStep() { return stepById(state.stepId); }

function settingsFor(step) {
  const rent = step.id === 10 ? RENT_CHOICES[state.rentMul].value : step.settings.rent;
  return { rows: step.show.rows ? state.rows : step.settings.rows, rent };
}

function copiesFor(step) {
  if (step.id !== 10) return step.copies;
  return state.compare ? [0, state.compare] : [0];
}

function seriesFor(step) {
  if (step.id === 10) return state.compare ? [state.compare, 0] : null;
  return step.chart ? step.chart.series : null;
}

// ---- table state ---------------------------------------------------------------------------------------------
function coolTable(note) {
  state.tableWarm = false;
  state.lastRun = null;
  state.lastModel = null;
  el.chart.textContent = "";
  el.chart.hidden = true;
  log.clear();
  if (note) log.setStale(note);
  updateAgain();
}

// The step-complete moment (design-system 12.5): once per step, after the first good run.
function showDone(step) {
  if (el.done.firstChild) return;
  const box = h("section", { class: "mv-step-complete", role: "status" },
    h("span", { class: "mv-step-complete__mascot mv-mascot mv-mascot--coral mv-mascot--lg mv-mascot--wiggle", "aria-hidden": "true" }),
    h("div", {}, h("h3", { class: "mv-step-complete__title", text: `Step ${step.id} done` }), h("p", { class: "mv-step-complete__text", text: step.done })));
  if (step.id < STEP_COUNT) {
    const next = h("button", { class: "mv-button mv-button--secondary mv-step-complete__action", type: "button", text: "Next step" });
    next.addEventListener("click", () => go(step.id + 1));
    box.lastChild.append(next);
  }
  el.done.append(box);
}

function updateAgain() {
  const step = currentStep();
  el.again.hidden = !step.show.again;
  el.again.disabled = state.running || !step.show.again;
  el.again.title = state.tableWarm ? "" : "Runs on a fresh table, because there is none yet";
}

// ---- lesson ----------------------------------------------------------------------------------------------------------
function renderLesson(step) {
  el.overline.textContent = `Step ${step.id} of ${STEP_COUNT}`;
  el.heading.textContent = step.title;
  el.goal.textContent = step.goal;
  el.body.textContent = "";
  for (const p of step.text) el.body.append(h("p", {}, rich(p)));
  el.annotations.textContent = "";
  annotationFigs = step.annotations.map((a) => renderAnnotated(a, editor));
  for (const f of annotationFigs) el.annotations.append(f);
  el.tryList.textContent = "";
  step.tryNext.forEach((t, i) => el.tryList.append(h("li", { class: "mv-lesson-step__try-item" }, h("span", { class: "mv-lesson-step__try-num", text: String(i + 1) }), h("span", {}, rich(t)))));
  el.nav.querySelector(".mv-lesson-step__nav-prev").disabled = step.id === 1;
  const next = el.nav.querySelector(".mv-lesson-step__nav-next");
  next.disabled = step.id === STEP_COUNT;
  next.hidden = step.id === STEP_COUNT;
  if (desktopMq.matches) el.details.open = true; else el.details.open = false;
}

function renderStepper(step) {
  el.stepperList.textContent = "";
  STEPS.forEach((s) => {
    const done = s.id < step.id;
    const link = h("a", { class: "mv-stepper__link", href: `#step-${s.id}`, title: s.title, "aria-current": s.id === step.id ? "step" : null },
      h("span", { class: "mv-stepper__dot" }, h("span", { class: "mv-stepper__num", text: String(s.id) }), done ? ic("check", 14, "mv-stepper__check") : null),
      h("span", { class: "mv-stepper__title", text: s.title }),
      done ? h("span", { class: "mv-visually-hidden", text: "completed" }) : null);
    el.stepperList.append(h("li", { class: `mv-stepper__item${done ? " mv-stepper__item--done" : ""}` }, link));
  });
  const text = `Step ${step.id} of ${STEP_COUNT}`;
  el.count.textContent = text;
  el.countCompact.textContent = text;
  el.titleCompact.textContent = step.title;
  el.progress.setAttribute("aria-valuenow", String(step.id));
  el.progress.setAttribute("aria-valuemax", String(STEP_COUNT));
  el.progress.setAttribute("aria-valuetext", `${text}: ${step.title}`);
  el.progressFill.style.setProperty("--_n", String(step.id));
  el.progressFill.style.setProperty("--_total", String(STEP_COUNT));
  for (const b of el.prev) b.disabled = step.id === 1;
  for (const b of el.next) b.disabled = step.id === STEP_COUNT;
}

// ---- settings row (rows, chips) ------------------------------------------------------------------------------------------
function segmented(label, choices, current, onPick, ariaOf) {
  const g = h("div", { class: "mv-segmented", role: "group", "aria-label": label });
  choices.forEach((c) => {
    const b = h("button", { class: "mv-segmented__option", type: "button", "aria-pressed": String(c.value === current), "aria-label": ariaOf ? ariaOf(c) : null, text: c.label });
    b.addEventListener("click", () => {
      if (state.running) return;
      for (const o of $$(".mv-segmented__option", g)) o.setAttribute("aria-pressed", "false");
      b.setAttribute("aria-pressed", "true");
      onPick(c.value);
    });
    g.append(b);
  });
  return g;
}

function renderSettings(step) {
  el.settings.textContent = "";
  const parts = [];
  if (step.show.rows) {
    parts.push(h("div", { class: "pg-setting" }, h("span", { class: "pg-setting__label", text: "rows" }),
      segmented("Table size", ROW_CHOICES.map((n) => ({ value: n, label: rowLabel(n) })), state.rows, (n) => {
        if (n === state.rows) return;
        state.rows = n;
        editor.setRowCount(n);
        coolTable("The table size changed: Run to see it.");
      }, (c) => rowAria(c.value))));
  }
  if (step.show.chips.includes("rent") && step.id === 8) {
    parts.push(h("span", { class: "mv-chip mv-chip--warning pg-chip" }, h("span", { class: "mv-chip__label", text: "memory rent: 100 × default" })));
  }
  if (step.show.chips.includes("compare")) {
    parts.push(h("div", { class: "pg-setting" }, h("span", { class: "pg-setting__label", text: "compare with" }),
      segmented("Compare with", COMPARE_CHOICES.map((c) => ({ value: c.value, label: c.label })), state.compare, (v) => {
        state.compare = v;
        coolTable("The comparison changed: Run to see it.");
      })));
  }
  if (step.show.chips.includes("rent") && step.id === 10) {
    parts.push(h("div", { class: "pg-setting" }, h("span", { class: "pg-setting__label", text: "memory rent" }),
      segmented("Memory rent", RENT_CHOICES.map((c, i) => ({ value: i, label: c.label })), state.rentMul, (i) => {
        state.rentMul = i;
        coolTable("The rent changed: Run to see it.");
      })));
  }
  el.settings.hidden = parts.length === 0;
  for (const p of parts) el.settings.append(p);
}

function renderExamples(step) {
  el.examples.hidden = step.id !== 10;
  el.lab.hidden = step.id !== 10;
  if (step.id !== 10 || el.examplesList.childElementCount) return;
  for (const id of FREE_PLAY_EXAMPLES) {
    const ex = EXAMPLES.find((e) => e.id === id);
    if (!ex) continue;
    const b = h("button", { class: "mv-button mv-button--secondary pg-example", type: "button", title: ex.description, text: ex.title });
    b.addEventListener("click", () => loadCode(ex.script, `Loaded the example “${ex.title}”.`));
    el.examplesList.append(h("li", {}, b));
  }
}

// ---- code ---------------------------------------------------------------------------------------------------------------------
function savedCode(step) {
  const v = store.get(codeKey(step.id));
  return v == null ? step.code : v;
}

function loadCode(code, message) {
  state.undo = { code: editor.getValue() };
  editor.setValue(code);
  showTip(message, true);
}

function showTip(message, withUndo) {
  el.tip.textContent = "";
  const box = h("aside", { class: "mv-callout mv-callout--tip", role: "note" }, ic("tip", 20, "mv-callout__icon"), h("h3", { class: "mv-callout__title", text: "Tip" }), h("p", { class: "mv-callout__body", text: message }));
  if (withUndo) {
    const undo = h("button", { class: "mv-button mv-button--ghost mv-callout__action", type: "button", text: "Undo" });
    undo.addEventListener("click", () => {
      if (state.undo) editor.setValue(state.undo.code);
      state.undo = null;
      el.tip.textContent = "";
      editor.focus();
    });
    box.append(undo);
  }
  el.tip.append(box);
}

function selectLine(line) {
  const ta = el.editorHost.querySelector(".ed-input");
  if (ta) { ta.scrollTop = Math.max(0, (line - 3) * 20); }
  editor.highlightLines(line, line, "pg-link-hl");
  clearTimeout(selectLine.t);
  selectLine.t = setTimeout(() => editor.highlightLines(0, 0, null), 1600);
  el.editorCard.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

// ---- running -------------------------------------------------------------------------------------------------------------------
async function doRun({ again = false } = {}) {
  if (state.running) { state.stopRequested = true; return; }
  if (!state.bridge) return;
  const step = currentStep();
  const { rows, rent } = settingsFor(step);
  const code = editor.getValue();
  const compiled = compileForRun(code, rows);
  if (!compiled.ok) {
    const msg = explainError(compiled.error);
    log.showError(msg.text, msg.line);
    return;
  }
  log.clearError();
  log.setStale(null);
  state.running = true;
  state.stopRequested = false;
  const token = ++state.runToken;
  setRunButton("running");
  el.show.disabled = true; el.reset.disabled = true; updateAgain();
  const fresh = !(again && state.tableWarm);
  let run = null;
  try {
    await state.warm;
    run = await executeRun({
      bridge: state.bridge, compiled, code, rows, rent, copies: copiesFor(step), fresh, clock: { tickUs: state.clock.tickUs },
      shouldStop: () => state.stopRequested,
    });
  } catch (e) {
    console.error(e);
    log.showError(`The run failed: ${String((e && e.message) || e)}`);
  }
  state.running = false;
  setRunButton("ready");
  el.show.disabled = false; el.reset.disabled = false;
  if (run && token === state.runToken) {
    state.runNumber++;
    state.tableWarm = true;
    state.lastRun = run;
    const data = narrate(run, { runNumber: state.runNumber, ...step.narrate });
    const node = log.addRun(data, state.runNumber);
    if (phoneMq.matches) node.scrollIntoView({ block: "nearest", behavior: "smooth" });
    renderChartFor(step, run);
    if (!run.stopped) showDone(step);
    say(`Run ${state.runNumber} finished.`);
  }
  updateAgain();
}

function renderChartFor(step, run) {
  el.chart.textContent = "";
  state.lastModel = null;
  if (!step.show.chart) { el.chart.hidden = true; return; }
  const series = seriesFor(step);
  const model = series ? chartModel(run, { series, line: step.chart.line }) : null;
  state.lastModel = model;
  if (!model) { el.chart.hidden = true; return; }
  el.chart.hidden = false;
  drawChart(step);
}

function drawChart(step) {
  if (!state.lastModel) return;
  const caption = captionFor(step, captionCtx(step, state.lastModel));
  renderChart(el.chart, state.lastModel, { width: el.chart.clientWidth || 440, caption, narrow: narrowMq.matches });
}

// ---- steps ------------------------------------------------------------------------------------------------------------------------
function stepFromHash() {
  const m = /^#step-(\d+)$/.exec(location.hash);
  const n = m ? Number(m[1]) : 1;
  return n >= 1 && n <= STEP_COUNT ? n : 1;
}

function showStep(id, { focus = false } = {}) {
  const step = stepById(id);
  state.stepId = step.id;
  state.undo = null;
  state.runToken++;
  if (state.running) state.stopRequested = true;
  el.tip.textContent = "";
  el.done.textContent = "";
  document.title = `${step.title} · multiview playground`;
  editor.setRowCount(settingsFor(step).rows);
  editor.setValue(savedCode(step));
  renderLesson(step);
  renderStepper(step);
  renderSettings(step);
  renderExamples(step);
  el.show.hidden = !step.solution;
  coolTable(null);
  setRunButton(state.bridge ? "ready" : "loading");
  if (drawer) drawer.refresh();
  window.scrollTo({ top: 0 });
  if (focus) el.heading.focus({ preventScroll: true });
}

function go(id) {
  if (id < 1 || id > STEP_COUNT || id === state.stepId) return;
  if (state.running) state.stopRequested = true;
  location.hash = `#step-${id}`;
}

// ---- boot ----------------------------------------------------------------------------------------------------------------------------
function boot() {
  hydrateIcons();
  log = createLog(el.logRoot, { onSelectLine: selectLine });
  const step0 = stepById(stepFromHash());
  state.stepId = step0.id;
  editor = createEditor(el.editorHost, { value: savedCode(step0), rows: settingsFor(step0).rows, onRun: () => doRun() });
  const edRoot = el.editorHost.querySelector(".ed");
  attachTokenTips(edRoot, editor, FIRST_USE);
  drawer = createSyntaxDrawer({ trigger: el.syntax, getStep: () => state.stepId });

  editor.on("change", ({ value }) => {
    const step = currentStep();
    if (value === step.code) store.remove(codeKey(step.id)); else store.set(codeKey(step.id), value);
  });
  editor.on("cursor", ({ line }) => {
    if (!annotationFigs.length) return;
    const text = editor.getValue().split("\n")[line - 1] || "";
    for (const f of annotationFigs) f.pg.setActive(f.pg.markForLine(text));
  });

  el.run.addEventListener("click", () => { if (el.run.getAttribute("aria-disabled") !== "true") doRun(); });
  tipOn(el.run, () => (el.run.getAttribute("aria-disabled") === "true" ? "Loading the engine" : null));
  el.again.addEventListener("click", () => doRun({ again: true }));
  el.reset.addEventListener("click", () => {
    const step = currentStep();
    state.undo = { code: editor.getValue() };
    store.remove(codeKey(step.id));
    editor.setValue(step.code);
    showTip("The code is back to the start of this step.", true);
  });
  el.show.addEventListener("click", () => {
    const step = currentStep();
    if (step.solution) loadCode(step.solution, "This is the code of “Show me” for this step. Press Undo to get your code back.");
  });
  for (const b of el.prev) b.addEventListener("click", () => go(state.stepId - 1));
  for (const b of el.next) b.addEventListener("click", () => go(state.stepId + 1));
  el.nav.querySelector(".mv-lesson-step__nav-prev").addEventListener("click", () => go(state.stepId - 1));
  el.nav.querySelector(".mv-lesson-step__nav-next").addEventListener("click", () => go(state.stepId + 1));
  window.addEventListener("hashchange", () => { const id = stepFromHash(); if (id !== state.stepId) showStep(id, { focus: true }); });
  desktopMq.addEventListener("change", () => { el.details.open = desktopMq.matches; });
  let lastChartWidth = 0, drawing = false;
  const ro = new ResizeObserver(() => {
    const w = Math.round(el.chart.clientWidth);
    if (drawing || !state.lastModel || w === lastChartWidth) return; // height changes from our own redraw do not count
    lastChartWidth = w;
    drawing = true;
    try { drawChart(currentStep()); } finally { drawing = false; }
  });
  ro.observe(el.chart);
  narrowMq.addEventListener("change", () => drawChart(currentStep()));
  el.logRoot.querySelector(".mv-run-log__clear").addEventListener("click", () => { coolTable(null); });

  el.lab.querySelector("a").textContent = LAB_TEXT;
  el.lab.querySelector("a").setAttribute("href", LAB_HREF);
  el.run.querySelector(".mv-run-button__kbd").textContent = RUN_KEYS;

  showStep(step0.id);

  // The engine loads after the page is usable; Run is disabled until then.
  try { state.clock.tickUs = measureTick(); } catch { state.clock.tickUs = 100; }
  state.clock.isolated = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
  loadBridge().then((bridge) => {
    if (!bridge.ready) throw new Error("multiview.wasm is older than this page: rebuild it with make playground");
    state.bridge = bridge;
    setRunButton("ready");
    state.warm = new Promise((r) => setTimeout(r, 0)).then(() => warmUp(bridge)).catch((e) => console.warn("warm-up failed", e));
  }).catch((e) => {
    console.error(e);
    log.showError(`The engine did not load: ${String((e && e.message) || e)}`);
  });
}

boot();
