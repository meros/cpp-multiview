// annotated-code (spec 4.1, design-system 6.7): code with numbered marks and a legend.
// Hover or focus on a legend item or a mark selects the matching line in the editor.
import { highlight } from "../editor/highlight.js";
import { h } from "./ui.js";

// annotation: { code, parts: [{ text, label }] }. editor: optional { getValue, highlightLines }.
export function renderAnnotated(annotation, editor) {
  const { code, parts } = annotation;
  const fig = h("figure", { class: "mv-annotated-code" });
  const codeEl = h("code");
  const legend = h("ol", { class: "mv-annotated-code__legend" });
  const marks = [];
  let from = 0;
  const frag = [];
  const ids = [];

  parts.forEach((p, i) => {
    const at = code.indexOf(p.text, from);
    if (at < 0) return;
    if (at > from) frag.push({ plain: code.slice(from, at) });
    frag.push({ part: p, index: i });
    from = at + p.text.length;
  });
  if (from < code.length) frag.push({ plain: code.slice(from) });

  const uid = Math.random().toString(36).slice(2, 7);
  for (const f of frag) {
    if (f.plain !== undefined) {
      const span = document.createElement("span");
      span.innerHTML = highlight(f.plain);
      codeEl.append(...span.childNodes);
      continue;
    }
    const n = marks.length + 1;
    const itemId = `ann-${uid}-${n}`;
    const mark = h("span", { class: "mv-annotated-code__mark", "aria-describedby": itemId });
    mark.innerHTML = highlight(f.part.text);
    mark.append(h("span", { class: "mv-annotated-code__mark-num", "aria-hidden": "true", text: String(n) }));
    codeEl.append(mark);
    const item = h("li", { class: "mv-annotated-code__legend-item", tabindex: "0", id: itemId },
      h("span", { class: "mv-annotated-code__legend-num", text: String(n) }),
      h("span", {}, h("code", { text: f.part.text.trim() }), " ", f.part.label));
    legend.append(item);
    marks.push({ mark, item, text: f.part.text.trim() });
  }

  const clearLink = () => { if (editor) editor.highlightLines(0, 0, null); };
  const activate = (m, on) => {
    m.mark.classList.toggle("mv-annotated-code__mark--active", on);
    if (!editor) return;
    if (!on) return clearLink();
    const lines = editor.getValue().split("\n");
    const at = lines.findIndex((l) => l.includes(m.text));
    if (at >= 0) editor.highlightLines(at + 1, at + 1, "pg-link-hl");
  };
  for (const m of marks) {
    for (const el of [m.item, m.mark]) {
      el.addEventListener("pointerenter", () => activate(m, true));
      el.addEventListener("pointerleave", () => activate(m, false));
    }
    m.item.addEventListener("focus", () => activate(m, true));
    m.item.addEventListener("blur", () => activate(m, false));
  }
  fig.append(h("pre", { class: "mv-annotated-code__code" }, codeEl), h("figcaption", {}, legend));
  // From the editor to the legend: the caret on a line that holds a part marks the part.
  fig.pg = {
    marks,
    // line text -> mark the caret line belongs to (or null)
    markForLine(text) { return marks.find((m) => text.includes(m.text)) || null; },
    setActive(m) { for (const x of marks) x.mark.classList.toggle("mv-annotated-code__mark--active", x === m); },
  };
  return fig;
}
