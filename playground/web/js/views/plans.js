// Plan view (spec 6.5): per query shape, the adaptive copy's plan string, a sentence and the cost reasoning.
import { h, clear } from "../dom.js";
import { parsePlan, planSentence, planCost } from "./plan-text.js";
import { passAggregate, lastPassNumber } from "../aggregate.js";

export function mountPlans({ store, root }) {
  const list = h("ol", { class: "plan-list" });
  root.append(list);

  function render(s) {
    clear(list);
    if (!s.plans.length) {
      list.append(h("li", { class: "empty" }, "Run the script to see how the adaptive copy answers each query shape."));
      return;
    }
    const last = lastPassNumber(s.samples);
    const agg = last ? passAggregate(s.samples, last, s.env.timerResMs) : null;
    for (const p of s.plans.slice(0, 12)) {
      const parsed = parsePlan(p.plan);
      let scanNs = NaN;
      if (agg) scanNs = agg.labelOps[p.label] > 0 ? agg.copies[1].labelNs[p.label] : agg.copies[1].ns;
      const cost = planCost(parsed, { indexes: s.indexes, scanNs });
      list.append(h("li", { class: "plan-row" },
        h("code", { class: "plan-shape" }, p.shapeText),
        h("code", { class: "plan-raw" }, p.plan),
        h("p", { class: "plan-words" }, planSentence(parsed)),
        cost ? h("p", { class: "plan-cost" }, cost) : null));
    }
  }

  store.subscribe(["plans"], render);
  render(store.get());
}
