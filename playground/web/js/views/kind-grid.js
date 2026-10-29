// The kind grid for the `yours` copy (spec 6.6): one checkbox per field and kind, written to knobs.yoursMask.
import { h } from "../dom.js";
import { KIND_ORDER, FIELD_NAMES } from "./inspector-logic.js";

export function mountKindGrid({ store, root }) {
  const cueHost = h("span", { id: "kind-grid-cue" });
  const title = h("p", { class: "knob-label", id: "kind-grid-title" }, "Index kinds for your copy", cueHost);
  const boxes = [];
  const head = h("tr", null, h("td"), KIND_ORDER.map((k) => h("th", { scope: "col" }, k)));
  const body = FIELD_NAMES.map((f, fi) => h("tr", null,
    h("th", { scope: "row" }, f),
    KIND_ORDER.map((k, ki) => {
      const box = h("input", { type: "checkbox", "aria-label": `${f}: ${k}`,
        title: k === "dense" && f === "amount" ? "Works at 50 000 rows; refuses ranges wider than 8 × rows + 1 024." : null,
        onchange: () => store.set((s) => {
          const mask = s.knobs.yoursMask.slice();
          mask[fi] ^= 1 << ki;
          return { knobs: { ...s.knobs, yoursMask: mask }, stale: true };
        }) });
      boxes.push({ box, fi, ki });
      return h("td", null, box);
    })));
  const note = h("p", { class: "caption" }, "Your copy builds these once and never changes them. Dense works only for integer keys in a small range.");
  const wrap = h("div", { id: "kind-grid", class: "kind-grid", tabindex: "-1" }, title, h("div", { class: "table-scroll" }, h("table", { class: "kinds" }, h("thead", null, head), h("tbody", null, body))), note);
  root.append(wrap);

  function sync(s) {
    wrap.hidden = !s.shownCopies[5];
    const lockedGrid = s.locked.yoursMask || s.run.status !== "idle";
    for (const { box, fi, ki } of boxes) {
      box.checked = !!(s.knobs.yoursMask[fi] >> ki & 1);
      box.disabled = lockedGrid;
    }
    wrap.classList.toggle("locked", s.locked.yoursMask);
    const cue = s.cues.find((c) => c.target === "kind-grid");
    cueHost.replaceChildren(...(cue ? [h("span", { class: "cue-tag inline", role: "note" }, cue.text)] : []));
  }
  store.subscribe(["knobs", "locked", "shownCopies", "run", "cues"], sync);
  sync(store.get());
}
