// The workload DSL: compile a script into 16-number op records, with error positions and lint
// warnings, plus the DSL and C++ texts of a query shape. Pure: no DOM.
//
// An op is 16 doubles (see playground.cpp):
//   0 opcode: 0 query, 1 update amount, 2 churn
//   query:  1 label, 2 npreds, 3 fieldA, 4 opA, 5 aLo, 6 aHi, 7 fieldB, 8 opB, 9 bLo, 10 bHi,
//           11 order field (-1 none), 12 descending, 13 limit (0 none), 14 terminal
//   update: 1 label, 2 row, 3 new amount
//   churn:  1 label, 2 row, 3 customer, 4 amount, 5 day

import { tokenize } from "./highlight.js";
import { BARE_NAMES, DOT_NAMES } from "./vocab.js";

export const FIELDS = ["customer", "amount", "day"];
export const KINDS = ["grouped", "swiss", "dense", "ordered", "sorted_array", "hash"];
export const MAX_OPS = 200000;

const PRED_NAMES = ["eq", "ge", "le", "between", "gt", "lt"]; // index = predicate op code
const TERMINALS = ["count", "exists", "first", "sumAmount"];
const LINE_FULL = 2000, LINE_STEP = 64;

// ---- running the script -----------------------------------------------------

class Pred {
  constructor(f, op, lo, hi) { this.f = f; this.op = op; this.lo = lo; this.hi = hi; }
}
class Field {
  constructor(index, num) {
    this.index = index;
    this.name = FIELDS[index];
    const p = (op, lo, hi) => new Pred(index, op, num(lo), num(hi ?? lo));
    this.eq = (v) => p(0, v);
    this.ge = (v) => p(1, v);
    this.le = (v) => p(2, v);
    this.between = (a, b) => p(3, a, b);
    this.gt = (v) => p(4, v);
    this.lt = (v) => p(5, v);
  }
}

const describe = (v) => (v && v.constructor && v.constructor.name === "Field" ? "a field" : typeof v === "object" ? "an object" : String(v));

// Run `code` against the DSL environment. Throws what the script throws.
function execute(code, rowCount, seed, options = {}) {
  const ops = [], labels = [], shapes = new Map();
  // options.lines: write the source line of each op into rec[15]. A stack capture costs about 4 µs,
  // so capture the first LINE_FULL ops and every LINE_STEP-th after; the others take the line last
  // seen for the same key (the shape of a query, or the kind of write).
  const lineOfKey = options.lines ? new Map() : null;
  const lineFor = (key) => {
    const n = ops.length;
    if (n < LINE_FULL || n % LINE_STEP === 0 || !lineOfKey.has(key)) {
      const pos = positionFromStack(new Error());
      lineOfKey.set(key, pos ? pos.line : 0);
    }
    return lineOfKey.get(key);
  };
  let cur = 0, s = seed >>> 0;
  const rnd = (n) => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return Math.floor(((t ^ (t >>> 14)) >>> 0) / 4294967296 * n); };
  const zipf = (n, sk) => Math.min(n - 1, Math.floor(Math.pow(rnd(1e9) / 1e9, 1 + 4 * (sk ?? 0.5)) * n));
  const label = (name) => { let i = labels.indexOf(name); if (i < 0) { labels.push(name); i = labels.length - 1; } cur = i; };
  label("(default)");
  const num = (v) => { if (typeof v !== "number" || !isFinite(v)) throw new Error("a value must be a finite number, got " + v); return v; };
  const push = (rec) => {
    if (ops.length >= MAX_OPS) throw new Error("too many operations (more than 200 000); keep it under 200 000");
    ops.push(rec);
  };
  const fields = FIELDS.map((_, i) => new Field(i, num));
  class Q {
    constructor(preds) {
      for (const p of preds) if (!(p instanceof Pred)) throw new Error("where() takes predicates such as customer.eq(1), got " + describe(p));
      if (preds.length > 2) throw new Error("the playground supports at most two predicates per query");
      if (preds.length === 2 && preds[0].f === preds[1].f) throw new Error("two predicates on the same field are not supported here; use between(a, b)");
      this.preds = preds; this.ord = -1; this.desc = 0; this.lim = 0;
    }
    orderBy(f, desc = false) {
      if (!(f instanceof Field)) throw new Error("orderBy() takes a field: customer, amount or day");
      this.ord = f.index; this.desc = desc ? 1 : 0; return this;
    }
    limit(n) { this.lim = Math.max(0, Math.floor(num(n))); return this; }
    _end(t) {
      const [a, b] = this.preds;
      const rec = [0, cur, this.preds.length, a ? a.f : 0, a ? a.op : 0, a ? a.lo : 0, a ? a.hi : 0, b ? b.f : 0, b ? b.op : 0, b ? b.lo : 0, b ? b.hi : 0, this.ord, this.desc, this.lim, t, 0];
      const key = [rec[2], rec[3], rec[4], rec[7], rec[8], rec[11], rec[12], rec[13] > 0, t].join(",");
      if (!shapes.has(key)) shapes.set(key, ops.length);
      if (lineOfKey) rec[15] = lineFor(key);
      push(rec);
    }
    count() { this._end(0); } exists() { this._end(1); } first() { this._end(2); } sumAmount() { this._end(3); }
  }
  const where = (...p) => new Q(p);
  const update = (row, v) => { const rec = [1, cur, Math.floor(num(row)), num(v), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; if (lineOfKey) rec[15] = lineFor("u"); push(rec); };
  const churn = (row, c, a, d) => { const rec = [2, cur, Math.floor(num(row)), num(c), num(a), num(d), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; if (lineOfKey) rec[15] = lineFor("c"); push(rec); };
  const env = { customer: fields[0], amount: fields[1], day: fields[2], where, all: () => where(), label, rnd, zipf, update, churn, rows: rowCount };
  const fn = new Function(...Object.keys(env), '"use strict";\n' + code);
  fn(...Object.values(env));
  if (ops.length === 0) throw new Error("the script recorded no operations");
  return { ops, labels, shapes: [...shapes.values()] };
}

// ---- error positions --------------------------------------------------------

// Engines report the line of an error inside `new Function` code with a fixed number of header
// lines. Measure that number once with a probe instead of hard-coding it per engine.
const FRAME_RE = /(?:<anonymous>|Function|eval):(\d+):(\d+)/;
let headerOffset; // user line = frame line - headerOffset; null when frames carry no position

function frameOffset() {
  if (headerOffset !== undefined) return headerOffset;
  headerOffset = null;
  try {
    const stack = new Function('"use strict";\nreturn new Error().stack')();
    const m = FRAME_RE.exec(String(stack));
    if (m) headerOffset = Number(m[1]) - 1;
  } catch (e) { /* no positions */ }
  return headerOffset;
}

function positionFromStack(err) {
  const off = frameOffset();
  if (off === null || !err || typeof err.stack !== "string") return null;
  const m = FRAME_RE.exec(err.stack);
  if (!m) return null;
  const line = Number(m[1]) - off;
  return line >= 1 ? { line, col: Number(m[2]) } : null;
}

// Extend a start position to a useful span: an identifier call `name(...)` to its closing
// parenthesis (when on one line), else the token itself. Returns an exclusive end column.
function spanEnd(tokens, line, col) {
  const idx = tokens.findIndex((t) => t.line === line && t.col === col);
  if (idx < 0) return col + 1;
  const t = tokens[idx];
  if (t.type === "ws") return col + 1;
  let end = t.col + t.text.length;
  if (t.type === "comment" || t.text.includes("\n")) return col + 1;
  let j = idx + 1;
  if (tokens[j] && tokens[j].text === "(" && tokens[j].line === line) {
    let depth = 0;
    for (; j < tokens.length; j++) {
      const u = tokens[j];
      if (u.line !== line) break;
      if (u.text === "(") depth++;
      else if (u.text === ")" && --depth === 0) { end = u.col + 1; break; }
    }
    if (depth !== 0) end = lineEndCol(tokens, idx);
  }
  return end;
}

function lineEndCol(tokens, idx) {
  const line = tokens[idx].line;
  let end = tokens[idx].col + tokens[idx].text.length;
  for (let j = idx; j < tokens.length && tokens[j].line === line; j++) if (tokens[j].type !== "ws") end = tokens[j].col + tokens[j].text.length;
  return end;
}

// Brackets that do not balance, found from tokens so that every engine gives the same answer.
function checkBrackets(tokens) {
  const closeOf = { "(": ")", "[": "]", "{": "}" };
  const stack = [];
  let prev = null;
  for (const t of tokens) {
    if (t.type === "string" && t.open && t.text[0] !== "`") {
      return { message: "Unterminated string: add the closing " + t.text[0], line: t.line, col: t.col, endCol: t.col + t.text.length };
    }
    if (t.type === "comment" && t.open) return { message: "Unterminated comment: add */", line: t.line, col: t.col, endCol: t.col + 2 };
    if (t.type === "punct") {
      const ch = t.text;
      if (closeOf[ch]) stack.push({ tok: t, forHead: ch === "(" && prev && prev.text === "for" });
      else if (ch === ")" || ch === "]" || ch === "}") {
        const top = stack.pop();
        if (!top) return { message: "Unexpected `" + ch + "`: there is nothing to close", line: t.line, col: t.col, endCol: t.col + 1 };
        if (closeOf[top.tok.text] !== ch) {
          return { message: "`" + ch + "` does not match the `" + top.tok.text + "` on line " + top.tok.line + "; expected `" + closeOf[top.tok.text] + "`", line: t.line, col: t.col, endCol: t.col + 1 };
        }
      } else if (ch === ";") {
        const top = stack[stack.length - 1];
        if (top && top.tok.text !== "{" && !top.forHead) {
          return { message: "Missing `" + closeOf[top.tok.text] + "`: the `" + top.tok.text + "` on line " + top.tok.line + ", column " + top.tok.col + " is not closed before this `;`", line: t.line, col: t.col, endCol: t.col + 1 };
        }
      }
    }
    if (t.type !== "ws" && t.type !== "comment") prev = t;
  }
  const top = stack.pop();
  if (top) return { message: "Missing `" + closeOf[top.tok.text] + "`: this `" + top.tok.text + "` is never closed", line: top.tok.line, col: top.tok.col, endCol: top.tok.col + 1 };
  return null;
}

const EOI_RE = /end of (input|script)|got end|unterminated template|unexpected eof/i;

// Find the line of a SyntaxError that the bracket check did not explain: compile growing prefixes.
function locateSyntaxError(code, err) {
  const lines = code.split("\n");
  const full = String(err.message);
  let lastNonEmpty = 1;
  lines.forEach((l, i) => { if (l.trim()) lastNonEmpty = i + 1; });
  if (EOI_RE.test(full)) return { line: lastNonEmpty };
  const limit = Math.min(lines.length, 400);
  for (let k = 1; k <= limit; k++) {
    try { new Function('"use strict";\n' + lines.slice(0, k).join("\n")); }
    catch (e) {
      if (!(e instanceof SyntaxError)) continue;
      if (EOI_RE.test(String(e.message)) && String(e.message) !== full) continue;
      return { line: k };
    }
  }
  return { line: lastNonEmpty };
}

// ---- suggestions and lint ---------------------------------------------------

// True when a and b differ by one insertion, deletion, substitution or adjacent swap.
function oneEdit(a, b) {
  if (a === b) return false;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

function suggest(name, pool) {
  if (name.length < 3) return null;
  return pool.find((p) => p.length >= 3 && oneEdit(name, p)) ?? null;
}

const JS_GLOBALS = new Set(("Math Number Array Object String Boolean Date JSON Infinity NaN parseInt parseFloat isFinite isNaN console Symbol Map Set BigInt Error " +
  "length push pop map filter reduce forEach floor ceil round abs min max pow sqrt random trunc sign log log2 log10 exp from of keys values entries slice splice join concat " +
  "toString toFixed indexOf includes fill apply call bind fromEntries assign").split(" "));

function declaredNames(sig) {
  const names = new Set();
  for (let i = 0; i < sig.length; i++) {
    const t = sig[i], nx = sig[i + 1];
    if (t.type === "keyword" && (t.text === "let" || t.text === "const" || t.text === "var" || t.text === "function") && nx) {
      if (nx.type === "ident" || nx.type === "field" || nx.type === "helper") names.add(nx.text);
      if (t.text === "function") { // parameters
        let j = i + 1;
        while (sig[j] && sig[j].text !== "(") j++;
        for (j++; sig[j] && sig[j].text !== ")"; j++) if (sig[j].type === "ident") names.add(sig[j].text);
      }
    }
    if ((t.type === "ident") && nx && nx.type === "op" && (nx.text === "=" || nx.text === "=>")) names.add(t.text);
    if (t.type === "punct" && t.text === ")" && nx && nx.text === "=>") { // arrow parameters
      for (let j = i - 1; j >= 0 && sig[j].text !== "("; j--) if (sig[j].type === "ident") names.add(sig[j].text);
    }
    if (t.type === "ident" && nx && (nx.text === "of" || nx.text === "in") && sig[i - 1] && ["let", "const", "var"].includes(sig[i - 1].text)) names.add(t.text);
  }
  return names;
}

function matchParen(sig, openIdx) {
  let depth = 0;
  for (let j = openIdx; j < sig.length; j++) {
    if (sig[j].text === "(" && sig[j].type === "punct") depth++;
    else if (sig[j].text === ")" && sig[j].type === "punct" && --depth === 0) return j;
  }
  return -1;
}

// Warnings from the tokens alone. Does not run the script.
export function lint(code, tokens = tokenize(code)) {
  const out = [];
  const sig = tokens.filter((t) => t.type !== "ws" && t.type !== "comment");
  const declared = declaredNames(sig);
  const isDot = (t) => t && t.type === "punct" && t.text === ".";
  const warn = (t, message, endCol) => out.push({ line: t.line, col: t.col, endCol: endCol ?? t.col + t.text.length, severity: "warning", message });

  for (let i = 0; i < sig.length; i++) {
    const t = sig[i], prev = sig[i - 1];
    const dot = isDot(prev);

    if (t.type === "pred" && !(prev && sig[i - 2] && (sig[i - 2].type === "field" || sig[i - 2].type === "ident"))) {
      warn(t, "`." + t.text + "` works on a field: customer, amount or day");
    }

    if (t.type === "ident" && !declared.has(t.text) && !JS_GLOBALS.has(t.text)) {
      const fix = suggest(t.text, dot ? DOT_NAMES : BARE_NAMES);
      if (fix) warn(t, "unknown name `" + t.text + "`; did you mean `" + fix + "`?");
    }

    // A query statement that never reaches a terminal records nothing.
    if (t.type === "query" && (t.text === "where" || t.text === "all") && !dot && sig[i + 1] && sig[i + 1].text === "(") {
      const atStatement = !prev || prev.text === ";" || prev.text === "{" || prev.text === "}";
      if (!atStatement) continue;
      let j = matchParen(sig, i + 1);
      if (j < 0) continue;
      let ended = false, bad = false;
      while (!ended) {
        const nx = sig[j + 1], name = sig[j + 2], op = sig[j + 3];
        if (isDot(nx) && name && op && op.text === "(") {
          if (name.type === "terminal") { ended = true; break; }
          if (name.text === "orderBy" || name.text === "limit") { j = matchParen(sig, j + 3); if (j < 0) { bad = true; break; } continue; }
          bad = true; break; // unknown method: the unknown-name warning covers it
        }
        break;
      }
      if (!ended && !bad) {
        const endTok = sig[j];
        const endCol = endTok.line === t.line ? endTok.col + 1 : undefined;
        warn(t, "this query records nothing: end it with .count(), .exists(), .first() or .sumAmount()", endCol);
      }
    }
  }
  return out;
}

// ---- compile ----------------------------------------------------------------

export function compile(code, rowCount, seed = 12345, options = {}) {
  let tokens;
  let warnings = [];
  try { tokens = tokenize(code); warnings = lint(code, tokens); } catch (e) { tokens = []; }

  const fail = (message, pos) => {
    const error = { message };
    if (pos && pos.line) {
      error.line = pos.line;
      if (pos.col) { error.col = pos.col; error.endCol = pos.endCol ?? spanEnd(tokens, pos.line, pos.col); }
    }
    return { ok: false, error, warnings };
  };

  const br = checkBrackets(tokens);
  if (br) return fail(br.message, br);

  try {
    const r = execute(code, rowCount, seed, options);
    const shapeText = r.shapes.map((i) => queryText(r.ops[i]));
    return { ok: true, ops: r.ops, labels: r.labels, shapes: r.shapes, shapeText, warnings };
  } catch (e) {
    if (e instanceof SyntaxError) {
      const pos = locateSyntaxError(code, e);
      return fail(String(e.message), pos);
    }
    let message = String((e && e.message) || e);
    const pos = positionFromStack(e);
    let m = /^(\w+) is not defined/.exec(message);
    if (m) { const fix = suggest(m[1], BARE_NAMES); if (fix) message += "; did you mean `" + fix + "`?"; }
    m = /(?:\.|^)(\w+) is not a function/.exec(message);
    if (m) { const fix = suggest(m[1], DOT_NAMES); if (fix) message += "; did you mean `" + fix + "`?"; }
    return fail(message, pos);
  }
}

// ---- texts of a query shape ---------------------------------------------------

function predShape(f, op, value) {
  const name = FIELDS[f] + "." + PRED_NAMES[op];
  return value ? name + "(?, ?)" : name + "(?)";
}

// DSL text of a record with `?` for the values, without a trailing semicolon.
export function queryText(r) {
  if (r[0] === 1) return "update(?, ?)";
  if (r[0] === 2) return "churn(?, ?, ?, ?)";
  const preds = [];
  if (r[2] >= 1) preds.push(predShape(r[3], r[4], r[4] === 3));
  if (r[2] >= 2) preds.push(predShape(r[7], r[8], r[8] === 3));
  let t = preds.length ? "where(" + preds.join(", ") + ")" : "all()";
  if (r[11] >= 0) t += ".orderBy(" + FIELDS[r[11]] + (r[12] ? ", true" : "") + ")";
  if (r[13] > 0) t += ".limit(?)";
  return t + "." + TERMINALS[r[14]] + "()";
}

// ---- the C++ equivalent ---------------------------------------------------------

const CPP_OPS = ["==", ">=", "<=", "between", ">", "<"];
function cppPred(f, op, lo, hi) {
  const n = FIELDS[f];
  return op === 3 ? `${n}.between(${lo}, ${hi})` : `${n} ${CPP_OPS[op]} ${lo}`;
}

function cppQuery(r) {
  const preds = [];
  if (r[2] >= 1) preds.push(cppPred(r[3], r[4], r[5], r[6]));
  if (r[2] >= 2) preds.push(cppPred(r[7], r[8], r[9], r[10]));
  let t = `table.${preds.length ? "where(" + preds.join(" && ") + ")" : "all()"}`;
  if (r[11] >= 0) t += `.order_by(${FIELDS[r[11]]}${r[12] ? ", true" : ""})`;
  if (r[13] > 0) t += `.limit(${r[13]})`;
  return t + [".count()", ".exists()", ".first()", ".for_each(sum_amount)"][r[14]] + ";";
}

// C++ view text for a compile result and the `yours` kind masks (3 ints, bit k = KINDS[k]).
export function cppText(result, yoursMask = [0, 0, 0]) {
  const yours = FIELDS.map((f, fi) => `    mv::field_decl<&Row::${f}${KINDS.filter((_, ki) => (yoursMask[fi] >> ki) & 1).map((k) => ", mv::" + k).join("")}>`);
  let t = `struct Row { std::uint64_t customer, amount, day; };\n\n` +
    `constexpr auto customer = mv::col<&Row::customer>;\nconstexpr auto amount = mv::col<&Row::amount>;\nconstexpr auto day = mv::col<&Row::day>;\n\n` +
    `// The adaptive copy: every built-in kind is allowed, the container chooses.\n` +
    `mv::indexed_all<Row, &Row::customer, &Row::amount, &Row::day> table;\n\n` +
    `// Your copy: the kinds you ticked, built once.\n` +
    `mv::multiview<Row,\n${yours.join(",\n")}> yours;\n`;
  if (result && result.ok) {
    const ops = result.ops;
    t += `\n// The distinct queries of your script:\n` + result.shapes.slice(0, 40).map((i) => cppQuery(ops[i])).join("\n") + "\n";
    const w = ops.filter((r) => r[0] === 1).length, c = ops.filter((r) => r[0] === 2).length;
    if (w) t += `table.modify(id, [&](Row& r) { r.amount = value; });   // ${w} times\n`;
    if (c) t += `table.erase(id); id = table.insert(Row{...});         // ${c} times\n`;
  }
  return t;
}
