// Stand-in DSL compiler, DSL query text and C++ text, used only when js/editor/compile.js fails to load.
// Same 16-double record layout and the same rnd generator as the editor's compiler.

export const FIELDS = ["customer", "amount", "day"];
const KINDS = ["grouped", "swiss", "dense", "ordered", "sorted_array", "hash"];
const PRED_NAMES = ["eq", "ge", "le", "between", "gt", "lt"];

export function compile(code, rowCount, seed = 12345) {
  try {
    return compileOrThrow(code, rowCount, seed);
  } catch (e) {
    return { ok: false, error: { message: String(e && e.message ? e.message : e) } };
  }
}

function compileOrThrow(code, rowCount, seed) {
  const ops = [];
  const labels = [];
  const shapes = new Map();
  let cur = 0;
  let s = seed >>> 0;
  const rnd = (n) => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor(((t ^ (t >>> 14)) >>> 0) / 4294967296 * n);
  };
  const zipf = (n, sk) => Math.min(n - 1, Math.floor(Math.pow(rnd(1e9) / 1e9, 1 + 4 * (sk ?? 0.5)) * n));
  const label = (name) => {
    let i = labels.indexOf(name);
    if (i < 0) { labels.push(name); i = labels.length - 1; }
    cur = i;
  };
  label("(default)");
  const num = (v) => {
    if (typeof v !== "number" || !isFinite(v)) throw new Error("a value must be a finite number, got " + v);
    return v;
  };
  const mkField = (fi) => {
    const p = (op, lo, hi) => ({ f: fi, op, lo: num(lo), hi: num(hi ?? lo) });
    return { index: fi, name: FIELDS[fi], eq: (v) => p(0, v), ge: (v) => p(1, v), le: (v) => p(2, v), between: (a, b) => p(3, a, b), gt: (v) => p(4, v), lt: (v) => p(5, v) };
  };
  const fields = FIELDS.map((_, i) => mkField(i));
  class Q {
    constructor(preds) {
      if (preds.length > 2) throw new Error("the playground supports at most two predicates per query");
      if (preds.length === 2 && preds[0].f === preds[1].f) throw new Error("two predicates on the same field are not supported here; use between(a, b)");
      this.preds = preds; this.ord = -1; this.desc = 0; this.lim = 0;
    }
    orderBy(f, desc = false) { this.ord = f.index; this.desc = desc ? 1 : 0; return this; }
    limit(n) { this.lim = Math.max(0, Math.floor(num(n))); return this; }
    _end(t) {
      const [a, b] = this.preds;
      const rec = [0, cur, this.preds.length, a ? a.f : 0, a ? a.op : 0, a ? a.lo : 0, a ? a.hi : 0, b ? b.f : 0, b ? b.op : 0, b ? b.lo : 0, b ? b.hi : 0, this.ord, this.desc, this.lim, t, 0];
      const key = [rec[2], rec[3], rec[4], rec[7], rec[8], rec[11], rec[12], rec[13] > 0, t].join(",");
      if (!shapes.has(key)) shapes.set(key, ops.length);
      ops.push(rec);
    }
    count() { this._end(0); } exists() { this._end(1); } first() { this._end(2); } sumAmount() { this._end(3); }
  }
  const where = (...p) => new Q(p);
  const update = (row, v) => { ops.push([1, cur, Math.floor(num(row)), num(v), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); };
  const churn = (row, c, a, d) => { ops.push([2, cur, Math.floor(num(row)), num(c), num(a), num(d), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); };
  const env = { customer: fields[0], amount: fields[1], day: fields[2], where, all: () => where(), label, rnd, zipf, update, churn, rows: rowCount };
  new Function(...Object.keys(env), '"use strict";\n' + code)(...Object.values(env));
  if (ops.length === 0) throw new Error("the script recorded no operations");
  if (ops.length > 200000) throw new Error("too many operations (" + ops.length + "); keep it under 200 000");
  const shapeIdx = [...shapes.values()];
  return { ok: true, ops, labels, shapes: shapeIdx, shapeText: shapeIdx.map((i) => queryText(ops[i])) };
}

function predText(f, op, between) {
  return op === 3 || between ? `${FIELDS[f]}.between(?, ?)` : `${FIELDS[f]}.${PRED_NAMES[op]}(?)`;
}

// The DSL form of a query record, `?` for values.
export function queryText(r) {
  const preds = [];
  if (r[2] >= 1) preds.push(predText(r[3], r[4]));
  if (r[2] >= 2) preds.push(predText(r[7], r[8]));
  let t = preds.length ? `where(${preds.join(", ")})` : "all()";
  if (r[11] >= 0) t += `.orderBy(${FIELDS[r[11]]}${r[12] ? ", true" : ""})`;
  if (r[13] > 0) t += ".limit(?)";
  return t + [".count()", ".exists()", ".first()", ".sumAmount()"][r[14]];
}

const CPP_OPS = ["==", ">=", "<=", "between", ">", "<"];
function cppPred(f, op) {
  return op === 3 ? `${FIELDS[f]}.between(a, b)` : `${FIELDS[f]} ${CPP_OPS[op]} v`;
}
function cppQuery(r) {
  const preds = [];
  if (r[2] >= 1) preds.push(cppPred(r[3], r[4]));
  if (r[2] >= 2) preds.push(cppPred(r[7], r[8]));
  let t = `table.${preds.length ? "where(" + preds.join(" && ") + ")" : "all()"}`;
  if (r[11] >= 0) t += `.order_by(${FIELDS[r[11]]}${r[12] ? ", true" : ""})`;
  if (r[13] > 0) t += ".limit(n)";
  return t + [".count()", ".exists()", ".first()", ".for_each(sum_amount)"][r[14]] + ";";
}

export function cppText(result, yoursMask) {
  const yours = FIELDS.map((f, fi) => `    mv::field_decl<&Row::${f}${KINDS.filter((_, ki) => yoursMask[fi] >> ki & 1).map((k) => ", mv::" + k).join("")}>`);
  let t = "struct Row { std::uint64_t customer, amount, day; };\n\n" +
    "constexpr auto customer = mv::col<&Row::customer>;\nconstexpr auto amount = mv::col<&Row::amount>;\nconstexpr auto day = mv::col<&Row::day>;\n\n" +
    "// The adaptive copy: every built-in kind is allowed, the container chooses.\n" +
    "mv::indexed_all<Row, &Row::customer, &Row::amount, &Row::day> table;\n\n" +
    "// Your copy: the kinds you ticked, built once.\n" +
    `mv::multiview<Row,\n${yours.join(",\n")}> yours;\n`;
  if (result && result.ok) {
    t += "\n// The distinct queries of your script:\n" + result.shapes.slice(0, 40).map((i) => cppQuery(result.ops[i])).join("\n") + "\n";
    const w = result.ops.filter((r) => r[0] === 1).length;
    const c = result.ops.filter((r) => r[0] === 2).length;
    if (w) t += `table.modify(id, [&](Row& r) { r.amount = value; });   // ${w} times\n`;
    if (c) t += `table.erase(id); id = table.insert(Row{...});         // ${c} times\n`;
  }
  return t;
}

export function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
