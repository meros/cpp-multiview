// The chart panel: toolbar (timeline or sweep, log or speed-up, label select), axis title, canvases, data table.
import { h, clear } from "../dom.js";
import { fmtNs, fmtInt } from "../format.js";
import { passAggregate } from "../aggregate.js";
import { COPIES } from "./chart-kit.js";
import { createTimeline, AXIS_TITLE_LOG, AXIS_TITLE_SPEED } from "./timeline.js";
import { createSweep, SWEEP_TITLE } from "./sweep.js";

function segmented(label, items, onPick) {
  const el = h("div", { class: "seg", role: "group", "aria-label": label });
  const buttons = items.map((it) => {
    const b = h("button", { type: "button", "data-value": it.value, "aria-pressed": "false", onclick: () => onPick(it.value) }, it.text);
    el.append(b);
    return b;
  });
  return { el, set: (value) => buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === value))) };
}

export function mountChartPanel({ store, root }) {
  const setView = (patch) => store.set((s) => ({ view: { ...s.view, ...patch } }));

  const chartSeg = segmented("Chart", [{ value: "timeline", text: "Timeline" }, { value: "sweep", text: "Sweep" }], (v) => setView({ chart: v }));
  const modeSeg = segmented("Scale", [{ value: "log", text: "Log" }, { value: "speedup", text: "Speed-up vs scan" }], (v) => setView({ chartMode: v }));
  const labelSelect = h("select", { id: "chart-label", "aria-label": "Show", onchange: (e) => setView({ chartLabel: +e.target.value }) });
  const labelWrap = h("label", { class: "inline-field" }, "Show:", labelSelect);
  const toolbar = h("div", { class: "chart-toolbar" }, chartSeg.el, modeSeg.el, labelWrap);
  const axisTitle = h("p", { class: "axis-title", id: "chart-axis-title" }, AXIS_TITLE_LOG);

  const timelineHost = h("div", { id: "timeline", class: "chart-body" });
  const sweepHost = h("div", { id: "sweep", class: "chart-body" });
  const legend = h("p", { class: "chart-legend", "aria-hidden": "true" },
    h("span", { class: "ev-build" }, "▲ index built"), " ", h("span", { class: "ev-drop" }, "▼ dropped"), " ", h("span", { class: "ev-trial" }, "◆ trial"), " ", h("span", { class: "muted" }, "Hollow markers: below the clock's resolution."));
  const tableBtn = h("button", { type: "button", class: "link-btn", "aria-expanded": "false", onclick: () => toggleTable() }, "Show data table");
  const tableBox = h("div", { class: "data-table-box", hidden: true });
  root.append(toolbar, axisTitle, timelineHost, sweepHost, legend, tableBtn, tableBox);

  const timeline = createTimeline({ store, host: timelineHost });
  createSweep({ store, host: sweepHost });
  let tableOpen = false;

  function toggleTable() {
    tableOpen = !tableOpen;
    tableBtn.setAttribute("aria-expanded", String(tableOpen));
    tableBtn.textContent = tableOpen ? "Hide data table" : "Show data table";
    tableBox.hidden = !tableOpen;
    renderTable();
  }

  function renderTable() {
    if (!tableOpen) return;
    const s = store.get();
    clear(tableBox);
    const shown = s.shownCopies.map((v, k) => (v ? k : -1)).filter((k) => k >= 0);
    if (s.view.chart === "sweep") {
      const head = h("tr", null, h("th", { scope: "col" }, "Rows"), shown.map((k) => h("th", { scope: "col", class: "num" }, COPIES[k].name)));
      const rows = s.sweep.map((e) => h("tr", null, h("th", { scope: "row" }, fmtInt(e.rows)), shown.map((k) => h("td", { class: "num" }, fmtNs(e.ns[k])))));
      tableBox.append(h("table", { class: "data" }, h("caption", null, "Time per operation by table size"), h("thead", null, head), h("tbody", null, rows)));
      return;
    }
    const passes = [...new Set(s.samples.map((x) => x.pass))].slice(-40);
    const head = h("tr", null, h("th", { scope: "col" }, "Pass"), shown.map((k) => h("th", { scope: "col", class: "num" }, COPIES[k].name)));
    const rows = passes.map((p) => {
      const agg = passAggregate(s.samples, p, s.env.timerResMs);
      return h("tr", null, h("th", { scope: "row" }, String(p)), shown.map((k) => h("td", { class: "num" }, fmtNs(agg.copies[k].ns))));
    });
    tableBox.append(h("table", { class: "data" }, h("caption", null, "Time per operation by pass, all operations"), h("thead", null, head), h("tbody", null, rows)));
  }

  function sync(s) {
    const sweepMode = s.view.chart === "sweep";
    chartSeg.set(s.view.chart);
    modeSeg.set(s.view.chartMode);
    timelineHost.hidden = sweepMode;
    sweepHost.hidden = !sweepMode;
    modeSeg.el.hidden = sweepMode;
    labelWrap.hidden = sweepMode;
    legend.hidden = sweepMode;
    axisTitle.textContent = sweepMode ? SWEEP_TITLE : s.view.chartMode === "speedup" ? AXIS_TITLE_SPEED : AXIS_TITLE_LOG;
    // Label select: the labels of the latest sample that have operations.
    const last = s.samples[s.samples.length - 1];
    const labels = last ? last.labels : [];
    const used = labels.map((name, i) => ({ name, i })).filter((x) => s.samples.some((smp) => smp.labelOps[x.i] > 0));
    const sig = used.map((x) => x.name).join("\u0000");
    if (labelSelect.dataset.sig !== sig) {
      labelSelect.dataset.sig = sig;
      clear(labelSelect);
      labelSelect.append(h("option", { value: "-1" }, "All operations"));
      if (used.length > 1) for (const x of used) labelSelect.append(h("option", { value: String(x.i) }, x.name));
    }
    labelSelect.value = used.some((x) => x.i === s.view.chartLabel) ? String(s.view.chartLabel) : "-1";
    labelWrap.hidden = sweepMode || used.length < 2;
    renderTable();
  }

  store.subscribe(["view", "samples", "sweep", "shownCopies"], sync);
  sync(store.get());
  return { timeline };
}
