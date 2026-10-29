// Lesson navigation shared by the rail (desktop) and the stepper (tablet and phone).
import { h } from "../dom.js";
import { LESSONS } from "../lessons/lessons.js";

const SHORT = { L1: "Scan", L2: "Index", L3: "Cost", L4: "Kinds", L5: "Choose", L6: "Rent", L7: "Price" };

export function mountNav({ store, engine, root, variant }) {
  const list = h("ol", { class: `nav-list nav-${variant}` });
  const items = [];
  LESSONS.forEach((l, i) => {
    const num = h("span", { class: "nav-num", "aria-hidden": "true" }, String(i + 1));
    const state = h("span", { class: "visually-hidden" });
    const a = h("a", { href: `#lesson-${i + 1}`, title: l.title, onclick: (e) => { e.preventDefault(); engine.openLesson(l.id); } }, num, h("span", { class: "nav-title" }, SHORT[l.id]), state);
    const li = h("li", null, a);
    list.append(li);
    items.push({ id: l.id, a, num, state, n: i + 1 });
  });
  const freeNum = h("span", { class: "nav-num nav-free", "aria-hidden": "true" }, "…");
  const freeState = h("span", { class: "visually-hidden" });
  const freeA = h("a", { href: "#free", title: "Free play", onclick: (e) => { e.preventDefault(); engine.openFree(); } }, freeNum, h("span", { class: "nav-title" }, "Free play"), freeState);
  list.append(h("li", { class: "nav-free-item" }, freeA));
  root.append(list);

  function sync(s) {
    for (const it of items) {
      const current = s.mode === "lesson" && s.lessonId === it.id;
      const status = s.lessonProgress[it.id] || "new";
      it.a.classList.toggle("current", current);
      it.num.classList.toggle("done", status === "done");
      it.num.textContent = status === "done" ? "✓" : String(it.n);
      if (current) it.a.setAttribute("aria-current", "step");
      else it.a.removeAttribute("aria-current");
      it.state.textContent = status === "done" ? " (done)" : "";
    }
    freeA.classList.toggle("current", s.mode === "free");
    if (s.mode === "free") freeA.setAttribute("aria-current", "step");
    else freeA.removeAttribute("aria-current");
  }
  store.subscribe(["mode", "lessonId", "lessonProgress"], sync);
  sync(store.get());
}
