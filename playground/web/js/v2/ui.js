// Small DOM helpers for the v2 page. The only file of js/v2 that every view module imports.
import { icon } from "../ui/icons.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// h("div", { class: "x", text: "y", "aria-label": "z" }, child, [children])
export function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid);
  return e;
}

export function s(tag, props = {}, parent) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(props)) e.setAttribute(k, String(v));
  if (parent) parent.appendChild(e);
  return e;
}

export function ic(name, size = 16, cls) {
  const svg = icon(name, { size });
  if (cls) for (const c of cls.split(" ")) svg.classList.add(c);
  return svg;
}

// Text with `code` spans and **bold** to DOM nodes. No HTML is ever parsed.
export function rich(text) {
  const frag = document.createDocumentFragment();
  const re = /`([^`]+)`|\*\*([^*]+)\*\*/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) frag.append(text.slice(last, m.index));
    frag.append(m[1] !== undefined ? h("code", { text: m[1] }) : h("strong", { text: m[2] }));
    last = re.lastIndex;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// localStorage that never throws.
export const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* blocked or full */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* blocked */ } },
};

// A shared tooltip (spec 6.14) for elements with data-tooltip, for bars and for the editor.
let tipEl = null;
export function showTip(text, rect, { id = "pg-tip" } = {}) {
  hideTip();
  tipEl = h("div", { class: "mv-tooltip", role: "tooltip", id, text });
  document.body.append(tipEl);
  const t = tipEl.getBoundingClientRect();
  let top = rect.top - t.height - 6;
  if (top < 4) top = rect.bottom + 6;
  const left = Math.max(8, Math.min(rect.left, document.documentElement.clientWidth - t.width - 8));
  tipEl.style.top = `${top + window.scrollY}px`;
  tipEl.style.left = `${left + window.scrollX}px`;
  return tipEl;
}
export function hideTip() {
  if (tipEl) { tipEl.remove(); tipEl = null; }
}
export function tipOn(el, textOf, { delay = 400 } = {}) {
  let timer = 0;
  const show = () => {
    const text = typeof textOf === "function" ? textOf() : textOf;
    if (text) showTip(text, el.getBoundingClientRect(), { id: "pg-tip" });
  };
  el.addEventListener("pointerenter", () => { timer = setTimeout(show, delay); });
  el.addEventListener("pointerleave", () => { clearTimeout(timer); hideTip(); });
  el.addEventListener("focus", () => { if (el.matches(":focus-visible")) show(); });
  el.addEventListener("blur", () => { clearTimeout(timer); hideTip(); });
  el.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTip(); });
}
