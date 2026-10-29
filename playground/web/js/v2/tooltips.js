// Tooltips on the tokens of the editor (spec 4.2). The editor draws its own hover tip and signature
// help; this module adds "First used in step N" to them, and shows its own tip (mv-tooltip) for
// numbers and for the token at the caret after 600 ms without typing.
import { tokenize } from "../editor/highlight.js";
import { VOCAB, BY_NAME } from "../editor/vocab.js";
import { h, showTip, hideTip } from "./ui.js";

const FIELD_NAMES = ["customer", "amount", "day"];

// What a number means, from the calls around it. tokens: from tokenize(); idx: index of the number.
// Returns a sentence or null. Pure.
export function describeNumber(tokens, idx) {
  const sig = tokens.map((t, i) => ({ ...t, i })).filter((t) => t.type !== "ws" && t.type !== "comment");
  const at = sig.findIndex((t) => t.i === idx);
  if (at < 0) return null;
  // walk back to the "(" that holds this number, counting commas at that depth
  let depth = 0, commas = 0, open = -1;
  for (let k = at - 1; k >= 0; k--) {
    const t = sig[k];
    if (t.type !== "punct") continue;
    if (t.text === ")" || t.text === "]" || t.text === "}") depth++;
    else if (t.text === "(" || t.text === "[" || t.text === "{") {
      if (depth === 0) { open = k; break; }
      depth--;
    } else if (t.text === "," && depth === 0) commas++;
  }
  if (open > 0 && sig[open].text === "(") {
    const callee = sig[open - 1];
    const name = callee.text;
    const owner = sig[open - 3];
    const field = owner && FIELD_NAMES.includes(owner.text) && sig[open - 2].text === "." ? owner.text : null;
    if (["eq", "ge", "gt", "le", "lt"].includes(name) && field) return `the value ${field} is compared with`;
    if (name === "between" && field) return commas === 0 ? `the lower end of the range of ${field}, included` : `the upper end of the range of ${field}, included`;
    if (name === "rnd") return "n in rnd(n): a random whole number from 0 up to n − 1";
    if (name === "zipf") return commas === 0 ? "how many different numbers zipf can pick" : "skew: 0 picks evenly, higher picks small numbers more often";
    if (name === "limit") return "how many rows to keep";
    if (name === "update") return commas === 0 ? "the row to change" : "its new amount";
    if (name === "churn") return ["the row to replace", "the customer of the new row", "the amount of the new row", "the day of the new row"][Math.min(commas, 3)];
    if (name === "for") {
      const prev = sig[at - 1];
      if (prev && (prev.text === "<" || prev.text === "<=")) return "how many times the loop runs";
    }
  }
  const prev = sig[at - 1];
  if (prev && (prev.text === "<" || prev.text === "<=") && sig[at - 2] && sig[at - 2].type === "ident") return "how many times the loop runs";
  return null;
}

// editorRoot: the .ed element. firstUse: word -> step number.
export function attachTokenTips(editorRoot, editor, firstUse) {
  const ta = editorRoot.querySelector(".ed-input");
  const measure = editorRoot.querySelector(".ed-measure");
  const sigBox = editorRoot.querySelector(".ed-sig");
  if (!ta || !measure) return () => {};
  const LINE_H = 20;

  // ---- "First used in step N" on the editor's own tip ----
  const bySig = new Map();
  for (const v of VOCAB) if (v.kind !== "snippet" && v.kind !== "keyword") bySig.set(v.signature, v);
  let annotating = false;
  const annotate = () => {
    if (annotating || !sigBox || sigBox.hidden) return;
    if (sigBox.querySelector(".pg-first-use")) return;
    const head = sigBox.querySelector(".ed-sig-head");
    if (!head) return;
    const entry = bySig.get(head.textContent.trim()) || [...bySig.values()].find((v) => head.textContent.trim().startsWith(v.signature.split("(")[0]) && v.signature.split("(")[0] === head.textContent.trim().split("(")[0]);
    if (!entry) return;
    const step = firstUse[entry.name];
    if (!step) return;
    annotating = true;
    sigBox.append(h("div", { class: "pg-first-use", text: `First used in step ${step}` }));
    queueMicrotask(() => { annotating = false; });
  };
  const mo = sigBox ? new MutationObserver(annotate) : null;
  if (mo) mo.observe(sigBox, { attributes: true, attributeFilter: ["hidden"], childList: true });

  // ---- own tip: numbers on hover, the token at the caret after 600 ms ----
  const metrics = () => {
    const cs = getComputedStyle(ta);
    return { padX: parseFloat(cs.paddingLeft) || 12, padY: parseFloat(cs.paddingTop) || 8, cw: measure.getBoundingClientRect().width / 100 || 7.8 };
  };
  const cellRect = (line, col) => {
    const r = ta.getBoundingClientRect(), m = metrics();
    const left = r.left + m.padX + (col - 1) * m.cw - ta.scrollLeft;
    const top = r.top + m.padY + (line - 1) * LINE_H - ta.scrollTop;
    return { left, top, bottom: top + LINE_H, right: left + m.cw, width: m.cw, height: LINE_H };
  };
  const tokenAt = (line, col) => tokenize(ta.value).find((t) => t.line === line && col >= t.col && col < t.col + t.text.length);
  const lcOf = (pos) => { const before = ta.value.slice(0, pos); return { line: before.split("\n").length, col: pos - (before.lastIndexOf("\n") + 1) + 1 }; };

  const textFor = (tok) => {
    if (!tok) return null;
    if (tok.type === "number") {
      const toks = tokenize(ta.value);
      const idx = toks.findIndex((t) => t.start === tok.start);
      return describeNumber(toks, idx);
    }
    const entry = BY_NAME.get(tok.text);
    if (entry && ["field", "pred", "query", "terminal", "write", "helper"].includes(tok.type)) {
      const step = firstUse[entry.name];
      return `${entry.signature}${entry.doc ? ": " + entry.doc : ""}${step ? ` First used in step ${step}.` : ""}`;
    }
    return null;
  };

  let hoverTimer = 0, caretTimer = 0, showing = false;
  const editorTipOpen = () => sigBox && !sigBox.hidden;
  const hide = () => { clearTimeout(hoverTimer); clearTimeout(caretTimer); if (showing) { hideTip(); showing = false; } };

  const onMove = (e) => {
    clearTimeout(hoverTimer);
    if (showing) { hideTip(); showing = false; }
    const r = ta.getBoundingClientRect(), m = metrics();
    const x = e.clientX - r.left + ta.scrollLeft - m.padX, y = e.clientY - r.top + ta.scrollTop - m.padY;
    if (x < 0 || y < 0) return;
    const line = Math.floor(y / LINE_H) + 1, col = Math.floor(x / m.cw) + 1;
    const tok = tokenAt(line, col);
    if (!tok || tok.type !== "number") return; // the editor's own tip covers the words
    hoverTimer = setTimeout(() => {
      const text = textFor(tok);
      if (text && !editorTipOpen()) { showTip(text, cellRect(tok.line, tok.col)); showing = true; }
    }, 400);
  };
  const onCaretIdle = () => {
    clearTimeout(caretTimer);
    if (showing) { hideTip(); showing = false; }
    if (document.activeElement !== ta || ta.selectionStart !== ta.selectionEnd) return;
    caretTimer = setTimeout(() => {
      if (editorTipOpen()) return;
      const { line, col } = lcOf(ta.selectionStart);
      const tok = tokenAt(line, col) || tokenAt(line, col - 1);
      const text = textFor(tok);
      if (text) { showTip(text, cellRect(tok.line, tok.col)); showing = true; }
    }, 600);
  };
  ta.addEventListener("pointermove", onMove);
  ta.addEventListener("pointerleave", hide);
  ta.addEventListener("input", hide);
  ta.addEventListener("keyup", (e) => { if (e.key === "Escape") hide(); else if (!e.ctrlKey && !e.metaKey) onCaretIdle(); });
  ta.addEventListener("click", onCaretIdle);
  ta.addEventListener("blur", hide);
  ta.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  return () => { hide(); if (mo) mo.disconnect(); ta.removeEventListener("pointermove", onMove); };
}
