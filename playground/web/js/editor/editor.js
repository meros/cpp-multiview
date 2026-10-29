// The editor widget: a textarea over a highlighted <pre>, with line numbers, error underlines,
// autocomplete, signature help, undo and editing keys. All DOM work is here; the logic it calls
// (tokenize, compile, complete) is pure and lives in the other modules of this folder.

import { tokenize, tokensToHtml } from "./highlight.js";
import { compile as compileDsl } from "./compile.js";
import { complete, applyInsert, signatureAt, hoverAt, insideLiteral } from "./complete.js";
import { GLYPH, sigParts } from "./vocab.js";

const LINE_H = 20;
const INDENT = "  ";
const PAIRS = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'", "`": "`" };
const CLOSERS = new Set([")", "]", "}", '"', "'", "`"]);
const WORD = /[\w$]/;
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta"]);
const MAX_SQUIGGLES = 200;
let uid = 0;

function el(tag, cls, attrs) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (attrs) for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]);
  return n;
}

export function createEditor(host, options = {}) {
  const n = ++uid;
  const opts = { value: "", readOnly: false, rows: 50000, onRun: null, ...options };
  let rowCount = opts.rows;
  let readOnly = !!opts.readOnly;

  // ---- DOM ----------------------------------------------------------------------
  const listId = `ed-list-${n}`, msgId = `ed-status-${n}`, hintId = `ed-hint-${n}`;
  const root = el("div", "ed", { role: "group", "aria-label": "Workload script editor" });
  const main = el("div", "ed-main");
  const gutter = el("div", "ed-gutter", { "aria-hidden": "true" });
  const gutterInner = el("div", "ed-gutter-inner");
  gutter.appendChild(gutterInner);
  const body = el("div", "ed-body");
  const lineHl = el("div", "ed-linehl", { "aria-hidden": "true" });
  const lineHlInner = el("div", "ed-linehl-inner");
  lineHl.appendChild(lineHlInner);
  const pre = el("pre", "ed-hl", { "aria-hidden": "true" });
  const code = el("code");
  pre.appendChild(code);
  const squig = el("div", "ed-squiggles", { "aria-hidden": "true" });
  const squigInner = el("div", "ed-squiggles-inner");
  squig.appendChild(squigInner);
  const ta = el("textarea", "ed-input", {
    spellcheck: "false", autocapitalize: "off", autocomplete: "off", autocorrect: "off", wrap: "off",
    "aria-label": "Workload script", role: "combobox", "aria-autocomplete": "list", "aria-expanded": "false",
    "aria-controls": listId, "aria-describedby": `${msgId} ${hintId}`, "aria-haspopup": "listbox",
  });
  const measureEl = el("span", "ed-measure", { "aria-hidden": "true" });
  measureEl.textContent = "0".repeat(100);
  body.append(lineHl, pre, squig, ta, measureEl);
  main.append(gutter, body);

  const pop = el("div", "ed-pop");
  pop.hidden = true;
  const list = el("ul", "ed-complete", { role: "listbox", id: listId, "aria-label": "Suggestions" });
  const docBox = el("div", "ed-doc");
  pop.append(list, docBox);
  const tip = el("div", "ed-sig", { role: "tooltip" });
  tip.hidden = true;

  const status = el("div", "ed-status");
  const posEl = el("span", "ed-pos");
  const msgEl = el("span", "ed-msg", { id: msgId, "aria-live": "polite" });
  const grip = el("div", "ed-grip", { role: "slider", tabindex: "0", "aria-label": "Editor height", "aria-orientation": "vertical" });
  const hint = el("span", "ed-sr-only", { id: hintId });
  hint.textContent = "Press Escape, then Tab, to leave the editor. Press Control and Enter to run.";
  status.append(posEl, msgEl, grip);
  root.append(main, pop, tip, status, hint);
  host.appendChild(root);

  ta.value = String(opts.value ?? "");
  ta.readOnly = readOnly;
  root.classList.toggle("ed-readonly", readOnly);

  // ---- helpers ---------------------------------------------------------------------
  const handlers = new Map();
  const cleanups = [];
  const listen = (target, type, fn, o) => { target.addEventListener(type, fn, o); cleanups.push(() => target.removeEventListener(type, fn, o)); };
  const emit = (name, detail) => {
    for (const fn of [...(handlers.get(name) || [])]) { try { fn(detail); } catch (e) { console.error(e); } }
  };

  let tokCache = { v: null, t: [] };
  const tokens = () => {
    const v = ta.value;
    if (tokCache.v !== v) tokCache = { v, t: tokenize(v) };
    return tokCache.t;
  };

  let cw = 0;
  const charW = () => {
    if (cw > 0) return cw;
    const w = measureEl.getBoundingClientRect().width / 100;
    if (w > 0) { cw = w; return w; }
    return 7.8;
  };
  let pads = null;
  const padX = () => (pads ??= readPads()).x;
  const padY = () => (pads ??= readPads()).y;
  function readPads() {
    const cs = getComputedStyle(ta);
    const x = parseFloat(cs.paddingLeft), y = parseFloat(cs.paddingTop);
    return { x: isFinite(x) ? x : 12, y: isFinite(y) ? y : 8 };
  }

  // 1-based line and column of an offset.
  function lc(pos, v = ta.value) {
    const line = v.slice(0, pos).split("\n").length;
    return { line, col: pos - (v.lastIndexOf("\n", pos - 1) + 1) + 1 };
  }

  // Pixel position of (line, col), relative to the root element.
  function pointOf(line, col) {
    const rr = root.getBoundingClientRect(), tr = ta.getBoundingClientRect();
    return {
      x: tr.left - rr.left + padX() + (col - 1) * charW() - ta.scrollLeft,
      y: tr.top - rr.top + padY() + (line - 1) * LINE_H - ta.scrollTop,
    };
  }

  // ---- rendering ---------------------------------------------------------------------
  let raf = 0, changePending = false, gutterCount = 0;
  function schedule() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame() {
    raf = 0;
    render();
    if (changePending) { changePending = false; emit("change", { value: ta.value }); }
  }

  function render() {
    code.innerHTML = tokensToHtml(tokens()) + " ";
    syncGutter(ta.value.split("\n").length);
    syncScroll();
  }

  function syncGutter(count) {
    if (count === gutterCount) return;
    if (count > gutterCount) {
      const frag = document.createDocumentFragment();
      for (let i = gutterCount + 1; i <= count; i++) { const d = el("div", "ed-ln"); d.textContent = String(i); frag.appendChild(d); }
      gutterInner.appendChild(frag);
    } else {
      while (gutterInner.childNodes.length > count) gutterInner.lastChild.remove();
    }
    gutterCount = count;
    applyGutterFlags();
  }

  function syncScroll() {
    const st = ta.scrollTop, sl = ta.scrollLeft;
    code.style.transform = `translate(${-sl}px, ${-st}px)`;
    squigInner.style.transform = `translate(${-sl}px, ${-st}px)`;
    gutterInner.style.transform = `translateY(${-st}px)`;
    lineHlInner.style.transform = `translateY(${-st}px)`;
  }

  // ---- markers -----------------------------------------------------------------------------
  let ownMarkers = [], extraMarkers = [], merged = [];

  function markersOf(res) {
    const out = [];
    if (!res.ok && res.error && res.error.line) {
      out.push({ line: res.error.line, col: res.error.col, endCol: res.error.endCol, severity: "error", message: res.error.message });
    }
    for (const w of res.warnings || []) out.push(w);
    return out;
  }

  function markerSpan(m, lineText) {
    const first = Math.max(1, /^\s*/.exec(lineText)[0].length + 1);
    const c0 = m.col ?? first;
    let c1 = m.endCol;
    if (c1 === undefined) {
      if (m.col === undefined) c1 = Math.max(lineText.length + 1, c0 + 1);
      else { const w = /^[\w$]+/.exec(lineText.slice(c0 - 1)); c1 = c0 + (w ? w[0].length : 1); }
    }
    return [c0, Math.max(c1, c0 + 1)];
  }

  function renderMarkers() {
    merged = ownMarkers.concat(extraMarkers);
    squigInner.textContent = "";
    const lines = ta.value.split("\n");
    const frag = document.createDocumentFragment();
    merged.slice(0, MAX_SQUIGGLES).forEach((m) => {
      const text = lines[m.line - 1];
      if (text === undefined) return;
      const [c0, c1] = markerSpan(m, text);
      const d = el("div", `ed-sq ed-sq-${m.severity === "error" ? "error" : "warning"}`);
      d.style.top = `calc(var(--ed-pad-y, 8px) + ${(m.line - 1) * LINE_H}px)`;
      d.style.left = `calc(var(--ed-pad-x, 12px) + ${c0 - 1}ch)`;
      d.textContent = " ".repeat(c1 - c0);
      frag.appendChild(d);
    });
    squigInner.appendChild(frag);
    applyGutterFlags();
    updateStatus();
  }

  function applyGutterFlags() {
    const kids = gutterInner.childNodes;
    for (let i = 0; i < kids.length; i++) kids[i].classList.remove("ed-ln-error", "ed-ln-warning");
    for (const m of merged) {
      const d = kids[m.line - 1];
      if (!d) continue;
      if (m.severity === "error") d.classList.add("ed-ln-error");
      else if (!d.classList.contains("ed-ln-error")) d.classList.add("ed-ln-warning");
    }
  }

  const lineHls = new Map(); // cls -> { from, to }
  function renderLineHls() {
    lineHlInner.textContent = "";
    for (const [cls, r] of lineHls) {
      const d = el("div", `ed-line-hl ${cls}`);
      d.style.top = `calc(var(--ed-pad-y, 8px) + ${(r.from - 1) * LINE_H}px)`;
      d.style.height = `${(r.to - r.from + 1) * LINE_H}px`;
      lineHlInner.appendChild(d);
    }
  }

  let lastCursor = { line: 0, col: 0 };
  function updateStatus() {
    const c = lc(ta.selectionStart);
    posEl.textContent = `Line ${c.line}, col ${c.col}`;
    const worst = merged.find((m) => m.severity === "error") || merged[0];
    let text = "";
    if (!worst) text = ownError;
    else text = (worst.line ? `Line ${worst.line}${worst.col ? `, column ${worst.col}` : ""}: ` : "") + worst.message;
    if (msgEl.textContent !== text) msgEl.textContent = text;
    msgEl.classList.toggle("ed-msg-error", !!worst && worst.severity === "error");
    msgEl.classList.toggle("ed-msg-warning", !!worst && worst.severity !== "error");
  }
  let ownError = ""; // an error without a position

  // ---- compile -----------------------------------------------------------------------------
  let lastResult = null, compiledKey = null, compileTimer = 0;
  function doCompile() {
    const key = rowCount + "\u0000" + ta.value;
    if (!lastResult || key !== compiledKey) {
      try { lastResult = compileDsl(ta.value, rowCount); }
      catch (e) { lastResult = { ok: false, error: { message: "internal error: " + (e && e.message) }, warnings: [] }; }
      compiledKey = key;
      ownError = !lastResult.ok && !lastResult.error.line ? lastResult.error.message : "";
      ownMarkers = markersOf(lastResult);
      renderMarkers();
    }
    return lastResult;
  }
  function scheduleCompile(delay = 400) {
    clearTimeout(compileTimer);
    compileTimer = setTimeout(() => { compileTimer = 0; emit("compiled", doCompile()); }, delay);
  }

  // ---- undo -----------------------------------------------------------------------------------
  const undo = { past: [], future: [], lastType: null, lastTime: 0 };
  const snapshot = () => ({ v: ta.value, s: ta.selectionStart, e: ta.selectionEnd });
  let pendingSnap = snapshot();

  function record(type, snap) {
    const now = performance.now();
    const mergeable = (type === "insert" || type === "delete") && type === undo.lastType && now - undo.lastTime < 1000 && undo.past.length;
    if (!mergeable) { undo.past.push(snap); if (undo.past.length > 500) undo.past.shift(); }
    undo.future.length = 0;
    undo.lastType = type;
    undo.lastTime = now;
  }

  // Replace the whole value with the smallest range edit, so the caret and scroll survive.
  function replaceValue(next) {
    const old = ta.value;
    if (old === next) return;
    let p = 0;
    const max = Math.min(old.length, next.length);
    while (p < max && old[p] === next[p]) p++;
    let q = 0;
    while (q < max - p && old[old.length - 1 - q] === next[next.length - 1 - q]) q++;
    ta.setRangeText(next.slice(p, next.length - q), p, old.length - q, "end");
  }

  function restore(snap) {
    const st = ta.scrollTop;
    replaceValue(snap.v);
    ta.setSelectionRange(snap.s, snap.e);
    ta.scrollTop = st;
    undo.lastType = null;
    afterEdit();
  }
  function undoStep() {
    if (!undo.past.length) return;
    undo.future.push(snapshot());
    restore(undo.past.pop());
  }
  function redoStep() {
    if (!undo.future.length) return;
    undo.past.push(snapshot());
    restore(undo.future.pop());
  }

  // ---- edits ------------------------------------------------------------------------------------
  function afterEdit() {
    pendingSnap = snapshot();
    changePending = true;
    schedule();
    scheduleCompile();
    scrollCaretIntoView();
    onCursorMoved();
  }

  // A programmatic edit: replace [from, to) with text and place the selection.
  function applyEdit(from, to, text, selS, selE, type) {
    if (readOnly) return;
    record(type, snapshot());
    ta.setRangeText(text, from, to, "end");
    const s = selS ?? from + text.length;
    ta.setSelectionRange(s, selE ?? s);
    closeComplete();
    afterEdit();
  }

  function scrollCaretIntoView() {
    const { line, col } = lc(ta.selectionEnd);
    const top = padY() + (line - 1) * LINE_H, bottom = top + LINE_H + padY();
    if (top - padY() < ta.scrollTop) ta.scrollTop = Math.max(0, top - padY());
    else if (bottom > ta.scrollTop + ta.clientHeight) ta.scrollTop = bottom - ta.clientHeight;
    const x = padX() + (col - 1) * charW();
    if (x - 2 * charW() < ta.scrollLeft) ta.scrollLeft = Math.max(0, x - 2 * charW());
    else if (x + 3 * charW() > ta.scrollLeft + ta.clientWidth) ta.scrollLeft = x + 3 * charW() - ta.clientWidth;
    syncScroll();
  }

  function lineRange(v, s, e) {
    const ls = v.lastIndexOf("\n", s - 1) + 1;
    const end = e > s && v[e - 1] === "\n" ? e - 1 : e;
    let le = v.indexOf("\n", end);
    if (le < 0) le = v.length;
    return [ls, le];
  }

  // Indent, outdent or comment-toggle the lines touched by the selection.
  function editLines(mode) {
    const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    const [ls, le] = lineRange(v, s, e);
    const lines = v.slice(ls, le).split("\n");
    const edits = [];
    let allComment = false, minIndent = 0;
    if (mode === "comment") {
      const used = lines.filter((l) => l.trim());
      allComment = used.length > 0 && used.every((l) => /^\s*\/\//.test(l));
      minIndent = used.length ? Math.min(...used.map((l) => /^[ \t]*/.exec(l)[0].length)) : 0;
    }
    let off = ls;
    for (const l of lines) {
      if (mode === "indent") { if (l.length) edits.push({ at: off, del: 0, ins: INDENT }); }
      else if (mode === "outdent") { const m = /^( {1,2}|\t)/.exec(l); if (m) edits.push({ at: off, del: m[0].length, ins: "" }); }
      else if (allComment) { const m = /^([ \t]*)\/\/ ?/.exec(l); if (m) edits.push({ at: off + m[1].length, del: m[0].length - m[1].length, ins: "" }); }
      else if (l.trim()) edits.push({ at: off + minIndent, del: 0, ins: "// " });
      off += l.length + 1;
    }
    if (!edits.length) return;
    let out = "", p = ls;
    for (const ed of edits) { out += v.slice(p, ed.at) + ed.ins; p = ed.at + ed.del; }
    out += v.slice(p, le);
    const map = (pos) => {
      let d = 0;
      for (const ed of edits) {
        const end = ed.at + ed.del;
        if (pos >= end) d += ed.ins.length - ed.del;
        else if (pos > ed.at) return ed.at + d + ed.ins.length;
        else break;
      }
      return pos + d;
    };
    applyEdit(ls, le, out, map(s), map(e), mode);
  }

  function onEnter() {
    const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    const ls = v.lastIndexOf("\n", s - 1) + 1;
    const before = v.slice(ls, s);
    const indent = /^[ \t]*/.exec(before)[0];
    let ins, caret;
    if (s === e && v[s - 1] === "{" && v[e] === "}") {
      ins = "\n" + indent + INDENT + "\n" + indent;
      caret = s + 1 + indent.length + INDENT.length;
    } else {
      ins = "\n" + indent + (before.trimEnd().endsWith("{") ? INDENT : "");
      caret = s + ins.length;
    }
    applyEdit(s, e, ins, caret, caret, "enter");
  }

  // Returns true when the key was handled (the caller prevents the default).
  function onChar(ch) {
    const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    if (s !== e) {
      if (!PAIRS[ch]) return false;
      applyEdit(s, e, ch + v.slice(s, e) + PAIRS[ch], s + 1, e + 1, "pair");
      return true;
    }
    const next = v[s];
    if (CLOSERS.has(ch) && next === ch) { ta.setSelectionRange(s + 1, s + 1); onCursorMoved(); return true; }
    if (!PAIRS[ch]) return false;
    if (insideLiteral(tokens(), s)) return false;
    const prev = v[s - 1];
    const isQuote = ch === '"' || ch === "'" || ch === "`";
    if (isQuote && prev && WORD.test(prev)) return false;
    if (next && WORD.test(next)) return false;
    applyEdit(s, s, ch + PAIRS[ch], s + 1, s + 1, "pair");
    return true;
  }

  function onBackspace() {
    const v = ta.value, s = ta.selectionStart;
    if (s !== ta.selectionEnd || s === 0) return false;
    const a = v[s - 1], b = v[s];
    if (PAIRS[a] && PAIRS[a] === b) { applyEdit(s - 1, s + 1, "", s - 1, s - 1, "pair"); return true; }
    return false;
  }

  // ---- autocomplete ---------------------------------------------------------------------------------
  const cs = { open: false, items: [], sel: 0, start: 0, prefix: "" };

  function maybeComplete(force) {
    if (readOnly || ta.selectionStart !== ta.selectionEnd) return closeComplete();
    const r = complete(ta.value, ta.selectionStart, { force });
    if (!r) return closeComplete();
    const keep = cs.open ? cs.items[cs.sel]?.entry : null;
    cs.items = r.items;
    cs.start = r.start;
    cs.prefix = r.prefix;
    cs.sel = Math.max(0, keep ? r.items.findIndex((i) => i.entry === keep) : 0);
    cs.open = true;
    renderComplete();
  }

  function renderComplete() {
    list.textContent = "";
    const frag = document.createDocumentFragment();
    cs.items.forEach((it, i) => {
      const li = el("li", "ed-item", { role: "option", id: `ed-opt-${n}-${i}`, "aria-selected": "false" });
      const g = el("span", `ed-glyph ed-glyph-${it.entry.kind}`, { "aria-hidden": "true" });
      g.textContent = GLYPH[it.entry.kind];
      const name = el("span", "ed-item-name");
      const t = it.entry.name;
      name.append(t.slice(0, it.matchStart));
      if (it.matchEnd > it.matchStart) { const b = document.createElement("b"); b.textContent = t.slice(it.matchStart, it.matchEnd); name.appendChild(b); }
      name.append(t.slice(it.matchEnd));
      const sg = el("span", "ed-item-sig");
      sg.textContent = it.entry.signature;
      li.append(g, name, sg);
      li.dataset.i = String(i);
      frag.appendChild(li);
    });
    list.appendChild(frag);
    pop.hidden = false;
    ta.setAttribute("aria-expanded", "true");
    hideTip();
    selectItem(cs.sel, false);
    positionPop();
  }

  function selectItem(i, scroll = true) {
    const kids = list.children;
    if (!kids.length) return;
    cs.sel = (i + kids.length) % kids.length;
    for (let k = 0; k < kids.length; k++) kids[k].setAttribute("aria-selected", k === cs.sel ? "true" : "false");
    const li = kids[cs.sel];
    ta.setAttribute("aria-activedescendant", li.id);
    if (scroll) {
      if (li.offsetTop < list.scrollTop) list.scrollTop = li.offsetTop;
      else if (li.offsetTop + li.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = li.offsetTop + li.offsetHeight - list.clientHeight;
    }
    const e = cs.items[cs.sel].entry;
    docBox.textContent = e.doc;
    docBox.hidden = !e.doc;
  }

  function positionPop() {
    const { line, col } = lc(cs.start);
    const p = pointOf(line, col);
    const rootW = root.clientWidth;
    pop.style.left = `${Math.max(0, Math.min(p.x, rootW - pop.offsetWidth))}px`;
    let top = p.y + LINE_H;
    pop.style.top = `${top}px`;
    const r = pop.getBoundingClientRect();
    if (r.bottom > window.innerHeight && p.y > pop.offsetHeight) top = p.y - pop.offsetHeight;
    pop.style.top = `${top}px`;
  }

  function closeComplete() {
    if (!cs.open && pop.hidden) return;
    cs.open = false;
    pop.hidden = true;
    ta.setAttribute("aria-expanded", "false");
    ta.removeAttribute("aria-activedescendant");
  }

  function acceptItem(i) {
    const it = cs.items[i];
    if (!it) return;
    const caret = ta.selectionStart;
    const ed = applyInsert(it.entry, ta.value, cs.start, caret);
    applyEdit(ed.from, ed.to, ed.text, ed.selStart, ed.selEnd, "complete");
  }

  // ---- signature help and hover ----------------------------------------------------------------------
  let hovering = false;

  function hideTip() { tip.hidden = true; }

  function showTip(fill, line, col) {
    tip.textContent = "";
    fill(tip);
    tip.hidden = false;
    const p = pointOf(line, col);
    const left = Math.max(0, Math.min(p.x, root.clientWidth - tip.offsetWidth));
    let top = p.y - tip.offsetHeight - 2;
    if (top < 0) top = p.y + LINE_H + 2;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  function fillSignature(entry, argIndex) {
    return (box) => {
      box.className = "ed-sig";
      const head = el("div", "ed-sig-head");
      const parts = sigParts(entry);
      head.append(parts.head);
      parts.params.forEach((p, i) => {
        if (i) head.append(", ");
        if (i === argIndex) { const b = el("b", "ed-sig-arg"); b.textContent = p; head.appendChild(b); } else head.append(p);
      });
      head.append(parts.tail);
      box.appendChild(head);
      if (entry.doc) { const d = el("div", "ed-sig-doc"); d.textContent = entry.doc + (entry.name === "rows" ? ` Now ${rowCount}.` : ""); box.appendChild(d); }
    };
  }

  function updateSigHelp() {
    if (hovering) return;
    if (cs.open || document.activeElement !== ta || ta.selectionStart !== ta.selectionEnd) return hideTip();
    const s = signatureAt(ta.value, ta.selectionStart);
    if (!s) return hideTip();
    const c = lc(ta.selectionStart);
    showTip(fillSignature(s.entry, s.argIndex), c.line, c.col);
  }

  let hoverTimer = 0;
  function cellAt(clientX, clientY) {
    const r = ta.getBoundingClientRect();
    const x = clientX - r.left + ta.scrollLeft - padX(), y = clientY - r.top + ta.scrollTop - padY();
    if (x < 0 || y < 0) return null;
    return { line: Math.floor(y / LINE_H) + 1, col: Math.floor(x / charW()) + 1 };
  }

  function showHover(clientX, clientY) {
    const cell = cellAt(clientX, clientY);
    if (!cell || cs.open) return;
    const lines = ta.value.split("\n");
    const text = lines[cell.line - 1];
    if (text === undefined || cell.col > text.length) return;
    const m = merged.find((mk) => {
      if (mk.line !== cell.line) return false;
      const [c0, c1] = markerSpan(mk, text);
      return cell.col >= c0 && cell.col < c1;
    });
    if (m) {
      hovering = true;
      showTip((box) => {
        box.className = `ed-sig ed-sig-${m.severity === "error" ? "error" : "warning"}`;
        const d = el("div", "ed-sig-head");
        d.textContent = m.message;
        box.appendChild(d);
      }, cell.line, cell.col);
      return;
    }
    const h = hoverAt(tokens(), cell.line, cell.col);
    if (h) {
      hovering = true;
      showTip(fillSignature(h.entry, -1), h.token.line, h.token.col);
    }
  }

  function endHover() {
    clearTimeout(hoverTimer);
    if (hovering) { hovering = false; hideTip(); updateSigHelp(); }
  }

  // ---- cursor ---------------------------------------------------------------------------------------------
  function onCursorMoved() {
    const c = lc(ta.selectionStart);
    const pos = ta.selectionStart;
    if (cs.open && (pos !== ta.selectionEnd || pos < cs.start || pos > cs.start + cs.prefix.length)) closeComplete();
    updateStatus();
    updateSigHelp();
    if (c.line !== lastCursor.line || c.col !== lastCursor.col) {
      lastCursor = c;
      emit("cursor", { line: c.line, col: c.col });
    }
  }

  // ---- events -----------------------------------------------------------------------------------------------
  let escArmed = false;

  listen(ta, "scroll", () => { syncScroll(); if (cs.open) positionPop(); else if (!hovering) updateSigHelp(); });
  listen(ta, "beforeinput", (e) => {
    if (e.inputType === "historyUndo") { e.preventDefault(); undoStep(); return; }
    if (e.inputType === "historyRedo") { e.preventDefault(); redoStep(); return; }
    pendingSnap = snapshot();
  });
  listen(ta, "input", (e) => {
    const t = e.inputType || "";
    const type = t.startsWith("insert") && t !== "insertFromPaste" && t !== "insertFromDrop" ? "insert" : t.startsWith("delete") ? "delete" : "other";
    record(type, pendingSnap);
    pendingSnap = snapshot();
    changePending = true;
    schedule();
    scheduleCompile();
    scrollCaretIntoView();
    if (!readOnly) {
      if (t === "insertText" && e.data && e.data.length === 1) {
        if (/[\w$.]/.test(e.data)) maybeComplete(false); else closeComplete();
      } else if (t === "deleteContentBackward" && cs.open) maybeComplete(false);
      else closeComplete();
    }
    onCursorMoved();
  });

  listen(ta, "keydown", (e) => {
    if (e.isComposing) return;
    const k = e.key, mod = e.ctrlKey || e.metaKey;

    if (k === "Escape") {
      const wasOpen = cs.open || !tip.hidden;
      closeComplete(); hideTip();
      if (escArmed) { escArmed = false; ta.blur(); } else escArmed = true;
      if (wasOpen || escArmed) e.stopPropagation();
      return;
    }
    if (escArmed && k === "Tab") { escArmed = false; return; }
    if (!MODIFIER_KEYS.has(k)) escArmed = false;

    if (mod && k === "Enter") { e.preventDefault(); emit("run", {}); if (typeof opts.onRun === "function") opts.onRun(); return; }
    if (readOnly) return;

    const key = k.length === 1 ? k.toLowerCase() : k;
    if (mod && !e.altKey && key === "z") { e.preventDefault(); if (e.shiftKey) redoStep(); else undoStep(); return; }
    if (mod && !e.altKey && key === "y") { e.preventDefault(); redoStep(); return; }
    if (e.ctrlKey && !e.metaKey && (k === " " || e.code === "Space")) { e.preventDefault(); maybeComplete(true); return; }
    if (mod && (k === "/" || e.code === "Slash")) { e.preventDefault(); editLines("comment"); return; }

    if (cs.open) {
      const step = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 }[k];
      if (step) {
        e.preventDefault();
        if (Math.abs(step) === 1) selectItem(cs.sel + step);
        else selectItem(Math.max(0, Math.min(cs.items.length - 1, cs.sel + step)));
        return;
      }
      if ((k === "Enter" || k === "Tab") && !mod && !e.altKey) { e.preventDefault(); acceptItem(cs.sel); return; }
    }

    if (mod || e.altKey) return;

    if (k === "Tab") {
      e.preventDefault();
      const s = ta.selectionStart, en = ta.selectionEnd;
      if (e.shiftKey) editLines("outdent");
      else if (s !== en) editLines("indent");
      else applyEdit(s, en, INDENT, null, null, "tab");
      return;
    }
    if (k === "Enter") { e.preventDefault(); onEnter(); return; }
    if (k === "Backspace") { if (onBackspace()) e.preventDefault(); return; }
    if (k.length === 1 && onChar(k)) e.preventDefault();
  });

  listen(ta, "keyup", onCursorMoved);
  listen(ta, "mouseup", onCursorMoved);
  listen(ta, "click", () => { if (cs.open) closeComplete(); });
  listen(ta, "focus", () => { pendingSnap = snapshot(); onCursorMoved(); });
  listen(ta, "blur", () => { escArmed = false; closeComplete(); endHover(); hideTip(); });
  listen(document, "selectionchange", () => { if (document.activeElement === ta) onCursorMoved(); });

  listen(ta, "mousemove", (e) => {
    clearTimeout(hoverTimer);
    if (hovering) { hovering = false; hideTip(); }
    const { clientX, clientY } = e;
    hoverTimer = setTimeout(() => showHover(clientX, clientY), 400);
  });
  listen(ta, "mouseleave", endHover);
  listen(ta, "mousedown", endHover);

  // Keep focus in the textarea when the pointer picks a suggestion.
  listen(pop, "mousedown", (e) => {
    e.preventDefault();
    const li = e.target.closest(".ed-item");
    if (li) acceptItem(Number(li.dataset.i));
  });

  listen(grip, "pointerdown", (e) => {
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    const y0 = e.clientY, h0 = main.offsetHeight;
    const move = (ev) => { setHeight(h0 + ev.clientY - y0); };
    const up = () => { grip.removeEventListener("pointermove", move); grip.removeEventListener("pointerup", up); grip.removeEventListener("pointercancel", up); };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", up);
  });
  listen(grip, "keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setHeight(main.offsetHeight + (e.key === "ArrowDown" ? LINE_H : -LINE_H)); }
  });
  function setHeight(h) {
    const v = Math.max(120, Math.min(1000, Math.round(h)));
    main.style.height = `${v}px`;
    grip.setAttribute("aria-valuenow", String(v));
    grip.setAttribute("aria-valuemin", "120");
    grip.setAttribute("aria-valuemax", "1000");
  }
  grip.setAttribute("aria-valuenow", "360");
  grip.setAttribute("aria-valuemin", "120");
  grip.setAttribute("aria-valuemax", "1000");

  // ---- initial paint ---------------------------------------------------------------------------------------
  render();
  updateStatus();
  scheduleCompile(0);

  // ---- API --------------------------------------------------------------------------------------------------
  let destroyed = false;
  return {
    getValue: () => ta.value,

    setValue(text, { keepUndo = false } = {}) {
      const next = String(text ?? "");
      if (keepUndo) { if (next !== ta.value) record("set", snapshot()); }
      else { undo.past.length = 0; undo.future.length = 0; undo.lastType = null; }
      replaceValue(next);
      ta.setSelectionRange(0, 0);
      ta.scrollTop = 0; ta.scrollLeft = 0;
      closeComplete();
      pendingSnap = snapshot();
      tokCache = { v: null, t: [] };
      render();
      lastResult = null;
      scheduleCompile(0);
      onCursorMoved();
    },

    setReadOnly(flag) {
      readOnly = !!flag;
      ta.readOnly = readOnly;
      root.classList.toggle("ed-readonly", readOnly);
      if (readOnly) closeComplete();
    },

    setRowCount(count) {
      if (count === rowCount) return;
      rowCount = count;
      scheduleCompile(0);
    },

    focus() { ta.focus(); },

    compile() { return doCompile(); },

    setMarkers(markers) {
      extraMarkers = Array.isArray(markers) ? markers.filter((m) => m && m.line >= 1) : [];
      renderMarkers();
    },

    highlightLines(from, to, cls) {
      if (cls === null || cls === undefined) lineHls.clear();
      else if (from >= 1 && to >= from) lineHls.set(cls, { from, to });
      renderLineHls();
    },

    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(fn);
      return () => handlers.get(event)?.delete(fn);
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      clearTimeout(compileTimer);
      clearTimeout(hoverTimer);
      for (const off of cleanups) off();
      handlers.clear();
      root.remove();
    },
  };
}
