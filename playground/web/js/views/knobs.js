// Knobs: rows, eagerness, memory limit, rent, seed, copy toggles. Locked knobs are disabled with a lock glyph.
import { h } from "../dom.js";
import { fmtInt } from "../format.js";
import { COPIES, swatch } from "./chart-kit.js";
import { mountKindGrid } from "./kind-grid.js";

export const ROW_CHOICES = [1000, 10000, 50000, 200000];
export const RENT_STEPS = [0, 1e-6, 1e-5, 3e-5, 1e-4, 1e-3];
export const rentText = (r) => (r === 0 ? "0" : r.toExponential(0));
const nearestRent = (r) => RENT_STEPS.reduce((best, v, i) => (Math.abs(v - r) < Math.abs(RENT_STEPS[best] - r) ? i : best), 0);

const SVG = "http://www.w3.org/2000/svg";
function lockIcon() {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 12 14");
  svg.setAttribute("width", "10");
  svg.setAttribute("height", "12");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "lock");
  const p = document.createElementNS(SVG, "path");
  p.setAttribute("d", "M3 6V4a3 3 0 016 0v2h1v7H2V6zm1.5 0h3V4a1.5 1.5 0 00-3 0z");
  p.setAttribute("fill", "currentColor");
  svg.append(p);
  return svg;
}

export function mountKnobs({ store, root }) {
  const setKnob = (key, value) => store.set((s) => ({ knobs: { ...s.knobs, [key]: value }, stale: true }));
  const lock = (name) => h("span", { class: "lock-wrap", hidden: true, title: "Locked in this lesson", "data-lock": name }, lockIcon());
  const field = (name, label, control, extra) => h("div", { class: "knob", dataset: { knob: name } }, h("label", { for: control.id }, label), control, extra || null, lock(name));

  const rows = h("select", { id: "knob-rows", onchange: (e) => setKnob("rows", +e.target.value) });
  const eagerValue = h("output", { class: "knob-value", for: "knob-eagerness" });
  const eager = h("input", { id: "knob-eagerness", type: "range", min: "0.1", max: "2", step: "0.1",
    oninput: (e) => { eagerValue.textContent = (+e.target.value).toFixed(1); }, onchange: (e) => setKnob("eagerness", +e.target.value) });
  const mem = h("input", { id: "knob-mem", type: "number", min: "0", step: "256", onchange: (e) => setKnob("maxIndexKb", Math.max(0, Math.round(+e.target.value) || 0)) });
  const rentValue = h("output", { class: "knob-value", for: "knob-rent" });
  const rent = h("input", { id: "knob-rent", type: "range", min: "0", max: String(RENT_STEPS.length - 1), step: "1",
    oninput: (e) => { rentValue.textContent = rentText(RENT_STEPS[+e.target.value]); }, onchange: (e) => setKnob("rent", RENT_STEPS[+e.target.value]) });
  const seed = h("input", { id: "knob-seed", type: "number", min: "1", step: "1", onchange: (e) => setKnob("seed", Math.max(1, Math.round(+e.target.value) || 1)) });

  const chips = h("div", { class: "chips", role: "group", "aria-label": "Copies shown" });
  const chipEls = COPIES.map((c, k) => {
    const b = h("button", { type: "button", class: "chip", "aria-pressed": "true", style: `--chip: var(${c.token})`,
      onclick: () => store.set((s) => ({ shownCopies: s.shownCopies.map((v, i) => (i === k ? !v : v)) })) },
    swatch(k, 24, 10), c.name);
    chips.append(b);
    return b;
  });

  const gridHost = h("div", { id: "kind-grid-host" });
  const copiesBox = h("div", { class: "knob knob-copies", dataset: { knob: "copies" } }, h("span", { class: "knob-label", id: "copies-label" }, "Copies"), chips, lock("copies"));
  root.append(
    h("div", { class: "knob-grid" },
      field("rows", "Rows", rows),
      field("seed", "Seed", seed),
      field("eagerness", "Eagerness", eager, eagerValue),
      field("maxIndexKb", "Memory limit (KB, 0 = none)", mem),
      field("rent", "Rent (ns per byte per op)", rent, rentValue)),
    copiesBox, gridHost);
  mountKindGrid({ store, root: gridHost });

  function sync(s) {
    const k = s.knobs;
    const have = [...rows.options].map((o) => +o.value);
    for (const r of ROW_CHOICES) if (!have.includes(r)) rows.append(h("option", { value: String(r) }, fmtInt(r)));
    if (!ROW_CHOICES.includes(k.rows) && !have.includes(k.rows)) rows.append(h("option", { value: String(k.rows) }, fmtInt(k.rows)));
    [...rows.options].sort((a, b) => +a.value - +b.value).forEach((o) => { rows.append(o); o.textContent = fmtInt(+o.value); });
    rows.value = String(k.rows);
    eager.value = String(k.eagerness);
    eagerValue.textContent = Number(k.eagerness).toFixed(1);
    mem.value = String(k.maxIndexKb);
    rent.value = String(nearestRent(k.rent));
    rentValue.textContent = rentText(k.rent);
    seed.value = String(k.seed);
    const busy = s.run.status !== "idle";
    const set = (el, lockedKey) => {
      el.disabled = s.locked[lockedKey] || busy;
      const w = el.closest(".knob");
      w.classList.toggle("locked", s.locked[lockedKey]);
      w.querySelector(".lock-wrap").hidden = !s.locked[lockedKey];
      el.title = s.locked[lockedKey] ? "Locked in this lesson" : "";
    };
    set(rows, "rows"); set(eager, "eagerness"); set(mem, "maxIndexKb"); set(rent, "rent"); set(seed, "seed");
    chipEls.forEach((b, i) => {
      b.setAttribute("aria-pressed", String(s.shownCopies[i]));
      b.disabled = s.locked.copies;
      b.title = s.locked.copies ? "Locked in this lesson" : "";
    });
    copiesBox.classList.toggle("locked", s.locked.copies);
    copiesBox.querySelector(".lock-wrap").hidden = !s.locked.copies;
  }

  store.subscribe(["knobs", "locked", "shownCopies", "run"], sync);
  sync(store.get());
}
