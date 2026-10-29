// Autocomplete, signature help and hover lookups. Pure: text in, data out. The editor draws it.

import { tokenize } from "./highlight.js";
import { VOCAB, BY_NAME, SIG_CALLS } from "./vocab.js";

const isSig = (t) => t.type !== "ws" && t.type !== "comment";
const CLOSE = { ")": "(", "]": "[", "}": "{" };

// True when `pos` is inside a string or a comment of the tokens (a token that ends before pos
// does not count; an unterminated string, a block comment or a line comment reaching pos does).
export function insideLiteral(tokens, pos) {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t.start >= pos) continue;
    if (t.type !== "string" && t.type !== "comment") return false;
    if (pos < t.end) return true;
    return pos === t.end && (!!t.open || t.text.startsWith("//"));
  }
  return false;
}

// Index of the "(" that matches the ")" at sig[closeIdx], or -1.
function openOf(sig, closeIdx) {
  let depth = 0;
  for (let i = closeIdx; i >= 0; i--) {
    const t = sig[i];
    if (t.type !== "punct") continue;
    if (t.text === ")") depth++;
    else if (t.text === "(" && --depth === 0) return i;
  }
  return -1;
}

// Open brackets at the end of `sig`, innermost last. A "(" also records the comma count at its depth.
function openBrackets(sig) {
  const stack = [];
  for (let i = 0; i < sig.length; i++) {
    const t = sig[i];
    if (t.type !== "punct") continue;
    if (t.text === "(" || t.text === "[" || t.text === "{") stack.push({ ch: t.text, idx: i, commas: 0 });
    else if (CLOSE[t.text]) { if (stack.length && stack[stack.length - 1].ch === CLOSE[t.text]) stack.pop(); }
    else if (t.text === "," && stack.length) stack[stack.length - 1].commas++;
  }
  return stack;
}

const NO_CTX = { ctx: "none", prefix: "", start: 0 };

// Where is the caret in the grammar of the DSL? Returns { ctx, prefix, start } where prefix is the
// identifier typed before the caret. ctx is one of: afterField, afterWhere, afterOrderBy,
// afterLimit, afterDot, expr (inside parentheses), orderArg, statement, exprOuter, none.
export function contextAt(text, caret) {
  const word = /[\w$]*$/.exec(text.slice(0, caret))[0];
  if (/^\d/.test(word)) return NO_CTX;
  const start = caret - word.length;
  const before = text.slice(0, start);
  const tokens = tokenize(before);
  if (insideLiteral(tokens, before.length)) return NO_CTX;
  const sig = tokens.filter(isSig);
  const last = sig[sig.length - 1];
  const res = (ctx) => ({ ctx, prefix: word, start });

  if (last && last.type === "punct" && last.text === ".") {
    const p = sig[sig.length - 2];
    if (p && p.type === "field") return res("afterField");
    if (p && p.type === "punct" && p.text === ")") {
      const o = openOf(sig, sig.length - 2);
      const callee = o > 0 ? sig[o - 1] : null;
      if (callee) {
        if (callee.text === "where" || callee.text === "all") return res("afterWhere");
        if (callee.text === "orderBy") return res("afterOrderBy");
        if (callee.text === "limit") return res("afterLimit");
      }
    }
    return res("afterDot");
  }

  const stack = openBrackets(sig);
  const top = stack[stack.length - 1];
  if (top && top.ch === "(") {
    const callee = top.idx > 0 ? sig[top.idx - 1] : null;
    if (callee && callee.text === "orderBy" && top.commas === 0) return res("orderArg");
    return res("expr");
  }
  if (top && top.ch === "[") return res("expr");

  // Statement level (top-level or inside braces).
  if (!last) return res("statement");
  if (last.type === "keyword" && ["let", "const", "var", "function"].includes(last.text)) return NO_CTX; // naming something
  if (last.type === "punct" && (last.text === ";" || last.text === "{" || last.text === "}")) return res("statement");
  if (last.type === "keyword" && (last.text === "else" || last.text === "do")) return res("statement");
  const lineOfStart = (before.match(/\n/g) || []).length + 1;
  const endsLine = lineOfStart > last.line + (last.text.match(/\n/g) || []).length;
  const continues = last.type === "op" || (last.type === "punct" && (last.text === "," || last.text === "."));
  if (endsLine && !continues) return res("statement");
  return res("exprOuter");
}

// Entries offered in a context for a typed prefix. Prefix matches first, then substring matches;
// vocabulary order within each group. Each item: { entry, matchStart, matchEnd }.
export function candidates(ctx, prefix) {
  const pool = VOCAB.filter((v) => v.after.includes(ctx));
  const p = prefix.toLowerCase();
  if (!p) return pool.map((entry) => ({ entry, matchStart: 0, matchEnd: 0 }));
  const starts = [], inside = [];
  for (const entry of pool) {
    const k = entry.name.toLowerCase().indexOf(p);
    if (k === 0) starts.push({ entry, matchStart: 0, matchEnd: p.length });
    else if (k > 0) inside.push({ entry, matchStart: k, matchEnd: k + p.length });
  }
  return starts.concat(inside);
}

// The popup state for a caret, or null when nothing should open.
// `force` (Ctrl+Space) opens with an empty prefix too.
export function complete(text, caret, { force = false } = {}) {
  const c = contextAt(text, caret);
  if (c.ctx === "none" || c.ctx === "afterDot") return null;
  if (!force && c.prefix === "" && text[caret - 1] !== ".") return null;
  const items = candidates(c.ctx, c.prefix);
  if (!items.length) return null;
  // An exact, complete match of the only candidate is not worth a popup.
  if (items.length === 1 && items[0].entry.name === c.prefix && !force) return null;
  return { ctx: c.ctx, prefix: c.prefix, start: c.start, items };
}

// The text edit for accepting `entry` where `prefix` was typed ending at `caret`.
// Returns { from, to, text, selStart, selEnd } in document offsets.
export function applyInsert(entry, text, start, caret) {
  const tail = /^[\w$]*/.exec(text.slice(caret))[0];
  const to = caret + tail.length;
  let ins = entry.insert;
  // The call already has its parentheses: insert only the name.
  if (text[to] === "(" && ins.includes("(")) ins = ins.slice(0, ins.indexOf("("));
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const indent = /^[ \t]*/.exec(text.slice(lineStart, start))[0];
  ins = ins.replace(/\n/g, "\n" + indent);
  const p1 = ins.indexOf("$1"), p0 = ins.indexOf("$0");
  let at;
  if (p1 >= 0) at = p1; else if (p0 >= 0) at = p0; else at = -1;
  // Remove markers, tracking where the chosen one lands.
  let out = "", pos = -1;
  for (let i = 0; i < ins.length; i++) {
    if (ins[i] === "$" && (ins[i + 1] === "1" || ins[i + 1] === "0")) {
      if (i === at) pos = out.length;
      i++;
    } else out += ins[i];
  }
  if (pos < 0) pos = out.length;
  return { from: start, to, text: out, selStart: start + pos, selEnd: start + pos };
}

// Signature help for a caret: the nearest enclosing call that the vocabulary knows.
// Returns { entry, argIndex } or null.
export function signatureAt(text, caret) {
  const tokens = tokenize(text.slice(0, caret));
  if (insideLiteral(tokens, caret)) return null;
  const sig = tokens.filter(isSig);
  const stack = openBrackets(sig);
  for (let k = stack.length - 1; k >= 0; k--) {
    const b = stack[k];
    if (b.ch !== "(" || b.idx === 0) continue;
    const callee = sig[b.idx - 1];
    if (callee && SIG_CALLS.has(callee.text) && callee.type !== "string") {
      const entry = BY_NAME.get(callee.text);
      if (entry) return { entry, argIndex: b.commas };
    }
  }
  return null;
}

// The vocabulary entry under a (line, col) position (both 1-based), or null.
export function hoverAt(tokens, line, col) {
  for (const t of tokens) {
    if (t.line !== line) continue;
    if (col < t.col || col >= t.col + t.text.length) continue;
    if (["field", "pred", "query", "terminal", "write", "helper"].includes(t.type)) {
      const entry = BY_NAME.get(t.text);
      return entry ? { entry, token: t } : null;
    }
    return null;
  }
  return null;
}
