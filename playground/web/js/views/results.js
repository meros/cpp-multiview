// Results table (spec 6.3): last pass, one row per shown copy, best per column, noisy values greyed.
import { h, clear } from "../dom.js";
import { fmtNs, fmtBound, fmtKb, fmtRatio, slug } from "../format.js";
import { passAggregate, lastPassNumber, logRange } from "../aggregate.js";
import { noiseBoundNs } from "../timer.js";
import { COPIES, swatch } from "./chart-kit.js";

function bar(ns, range, k) {
  if (!(ns > 0)) return h("span", { class: "ns-bar", "aria-hidden": "true" });
  const [lo, hi] = range;
  const f = Math.min(1, Math.max(0.02, (Math.log10(ns) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))));
  const b = h("span", { class: "ns-bar", "aria-hidden": "true" }, h("i"));
  b.firstChild.style.width = `${(f * 100).toFixed(1)}%`;
  b.firstChild.style.background = `var(${COPIES[k].token})`;
  return b;
}

function cue(s, target) {
  const c = s.cues.find((x) => x.target === target);
  return c ? h("span", { class: "cue-tag", role: "note" }, c.text) : null;
}

export function mountResults({ store, root }) {
  const wrap = h("div", { class: "table-scroll" });
  const caption = h("p", { class: "caption" }, "Last pass. Lower is better. Best in each column in bold.");
  root.append(wrap, caption);
  const phone = typeof matchMedia === "function" ? matchMedia("(max-width: 767px)") : null;
  const open = new Set();

  function render(s) {
    clear(wrap);
    const last = lastPassNumber(s.samples);
    if (!last) {
      wrap.append(h("p", { class: "empty" }, "Press Run to fill this table."));
      return;
    }
    const res = s.env.timerResMs;
    const agg = passAggregate(s.samples, last, res);
    const shown = s.shownCopies.map((v, k) => (v ? k : -1)).filter((k) => k >= 0);
    const usedLabels = agg.labels.map((name, l) => ({ name, l })).filter((x) => agg.labelOps[x.l] > 0);
    const showLabels = usedLabels.length >= 2;

    // Same log scale as the chart: decades over every shown value in the run.
    const vals = [];
    for (const smp of s.samples) for (const k of shown) { vals.push(smp.copies[k].ns); for (const v of smp.copies[k].labelNs) vals.push(v); }
    const range = logRange(vals);
    const scan = agg.copies[1].ns;

    const best = (get, noisy) => {
      const c = shown.filter((k) => get(k) > 0 && !noisy(k));
      return c.length ? Math.min(...c.map(get)) : NaN;
    };
    const bestAll = best((k) => agg.copies[k].ns, (k) => agg.copies[k].noisy);
    const bestLabel = usedLabels.map((x) => best((k) => agg.copies[k].labelNs[x.l], (k) => agg.copies[k].labelNoisy[x.l]));

    const cell = (ns, noisy, bound, isBest, k) =>
      h("td", { class: `num ${isBest ? "best" : ""} ${noisy ? "noisy" : ""}` },
        h("span", { class: "ns-val" }, noisy ? fmtBound(bound) : fmtNs(ns)), bar(ns, range, k));

    const labelCell = (c, k, x, j) => {
      const noisy = c.labelNoisy[x.l];
      const isBest = !noisy && c.labelNs[x.l] === bestLabel[j];
      return h("td", { class: `num col-extra ${isBest ? "best" : ""} ${noisy ? "noisy" : ""}` },
        h("span", { class: "ns-val" }, noisy ? fmtBound(noiseBoundNs(agg.labelOps[x.l], res)) : fmtNs(c.labelNs[x.l])),
        bar(c.labelNs[x.l], range, k));
    };

    const head = h("tr", null,
      h("th", { scope: "col", class: "sw-col" }, h("span", { class: "visually-hidden" }, "Line")),
      h("th", { scope: "col" }, "Copy"),
      h("th", { scope: "col", class: "num" }, "ns / op"),
      h("th", { scope: "col", class: "num" }, "vs scan"),
      showLabels ? usedLabels.map((x) => h("th", { scope: "col", class: "num col-extra", id: `results-col-${slug(x.name)}` }, x.name, cue(s, `results-col-${slug(x.name)}`))) : null,
      h("th", { scope: "col", class: "num col-extra", id: "results-col-index-kb" }, "Index KB", cue(s, "results-col-index-kb")),
      h("th", { scope: "col", class: "col-ans" }, "Answers"));

    const body = [];
    for (const k of shown) {
      const c = agg.copies[k];
      const bound = noiseBoundNs(agg.ops, res);
      const detailParts = [`ns / op: ${c.noisy ? fmtBound(bound) : fmtNs(c.ns)}`];
      if (usedLabels.length) for (const x of usedLabels) detailParts.push(`${x.name}: ${c.labelNoisy[x.l] ? fmtBound(noiseBoundNs(agg.labelOps[x.l], res)) : fmtNs(c.labelNs[x.l])}`);
      detailParts.push(`index: ${fmtKb(c.bytes)} KB`);
      const isOpen = open.has(k);
      const nameCell = phone && phone.matches
        ? h("button", { type: "button", class: "row-toggle", "aria-expanded": String(isOpen), onclick: () => { open.has(k) ? open.delete(k) : open.add(k); render(store.get()); } }, COPIES[k].name)
        : COPIES[k].name;
      body.push(h("tr", { dataset: { copy: String(k) } },
        h("td", { class: "sw-col" }, swatch(k)),
        h("th", { scope: "row", class: "copy-name" }, nameCell),
        cell(c.ns, c.noisy, bound, !c.noisy && c.ns === bestAll, k),
        h("td", { class: "num" }, k === 1 ? "—" : c.ns > 0 && scan > 0 ? fmtRatio(scan / c.ns) : "—"),
        showLabels ? usedLabels.map((x, j) => labelCell(c, k, x, j)) : null,
        h("td", { class: "num col-extra" }, fmtKb(c.bytes)),
        h("td", { class: "col-ans" }, agg.agree ? h("span", { class: "ok-mark", role: "img", "aria-label": "all copies agree" }, "✓") : h("span", { class: "bad-mark", role: "img", "aria-label": "copies disagree" }, "✗"))));
      if (isOpen) body.push(h("tr", { class: "detail-row" }, h("td", { colspan: "7" }, detailParts.join(" · "))));
    }
    wrap.append(h("table", { class: "results" }, h("thead", null, head), h("tbody", null, body)));
  }

  store.subscribe(["samples", "shownCopies", "cues", "theme"], render);
  if (phone && phone.addEventListener) phone.addEventListener("change", () => render(store.get()));
  render(store.get());
}
