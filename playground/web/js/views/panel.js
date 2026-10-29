// Collapsible panels: a view a lesson does not use collapses to its heading and a note.
import { prefersReducedMotion } from "../dom.js";

export function mountPanels({ store }) {
  const panels = [...document.querySelectorAll("[data-panel]")];
  for (const el of panels) {
    const id = el.dataset.panel;
    const btn = el.querySelector(".panel-toggle");
    btn.addEventListener("click", () => store.set((s) => ({ view: { ...s.view, openPanels: { ...s.view.openPanels, [id]: !s.view.openPanels[id] } } })));
  }
  function sync(s) {
    for (const el of panels) {
      const id = el.dataset.panel;
      const open = s.view.openPanels[id] !== false;
      const body = el.querySelector(".panel-body");
      const btn = el.querySelector(".panel-toggle");
      const note = el.querySelector(".panel-unused");
      body.hidden = !open;
      el.classList.toggle("collapsed", !open);
      btn.setAttribute("aria-expanded", String(open));
      btn.textContent = open ? "Hide" : "Show";
      note.hidden = open || s.mode !== "lesson";
    }
  }
  store.subscribe(["view", "mode"], sync);
  sync(store.get());
}

// The lesson focus ring: pulses twice, stays until the focus changes. Under reduced motion it is static for 3 s.
export function mountFocus({ store }) {
  let current = [];
  let timer = 0;
  function clearRing() {
    for (const el of current) el.classList.remove("lesson-focus");
    current = [];
    clearTimeout(timer);
  }
  function apply(s) {
    clearRing();
    if (!s.focus) return;
    for (const id of s.focus.split(/\s+/).filter(Boolean)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.classList.add("lesson-focus");
      current.push(el);
    }
    if (current.length) {
      current[0].scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      if (prefersReducedMotion()) timer = setTimeout(clearRing, 3000);
    }
  }
  store.subscribe(["focus", "focusStamp"], (s) => setTimeout(() => apply(s), 0));
}
