// The DSL vocabulary: names, signatures, docs and insert text for autocomplete, hover and lint.
// `after` lists the completion contexts (see complete.js) where an entry is offered.

const e = (name, kind, signature, doc, insert, after) => ({ name, kind, signature, doc, insert, after });

const AFTER_FIELD = ["afterField"];
const TERM_AFTER = ["afterWhere", "afterOrderBy", "afterLimit"];
const STATEMENT = ["statement"];
const EXPR = ["expr", "exprOuter"];

export const VOCAB = [
  e("customer", "field", "customer", "Customer id, 0 to rows/20 − 1. About 20 rows per customer.", "customer", ["expr", "orderArg", "exprOuter"]),
  e("amount", "field", "amount", "Order amount, 0 to 99 999, uniform.", "amount", ["expr", "orderArg", "exprOuter"]),
  e("day", "field", "day", "Day of the year, 0 to 364. About rows/365 rows per day.", "day", ["expr", "orderArg", "exprOuter"]),

  e("eq", "pred", ".eq(v)", "Field equals v.", "eq($1)", AFTER_FIELD),
  e("ge", "pred", ".ge(v)", "Field is at least v.", "ge($1)", AFTER_FIELD),
  e("gt", "pred", ".gt(v)", "Field is greater than v.", "gt($1)", AFTER_FIELD),
  e("le", "pred", ".le(v)", "Field is at most v.", "le($1)", AFTER_FIELD),
  e("lt", "pred", ".lt(v)", "Field is less than v.", "lt($1)", AFTER_FIELD),
  e("between", "pred", ".between(lo, hi)", "lo ≤ field ≤ hi.", "between($1, $0)", AFTER_FIELD),

  e("where", "query", "where(p1, p2?)", "Rows where every predicate holds. At most two predicates, on different fields.", "where($1)", ["statement", "exprOuter"]),
  e("all", "query", "all()", "Every row. Use with orderBy and limit.", "all()", ["statement", "exprOuter"]),
  e("orderBy", "query", ".orderBy(field, desc = false)", "Sort the results by a field. With limit, an ordered index can stop early.", "orderBy($1)", ["afterWhere"]),
  e("limit", "query", ".limit(n)", "At most n results.", "limit($1)", ["afterWhere", "afterOrderBy"]),

  e("count", "terminal", ".count()", "Number of matching rows. Ends the query and records one operation.", "count()", TERM_AFTER),
  e("exists", "terminal", ".exists()", "Whether any row matches. Stops at the first match.", "exists()", TERM_AFTER),
  e("first", "terminal", ".first()", "The first matching row (in order if orderBy is set).", "first()", TERM_AFTER),
  e("sumAmount", "terminal", ".sumAmount()", "Sum of amount over the results.", "sumAmount()", TERM_AFTER),

  e("update", "write", "update(row, newAmount)", "Set amount of row number `row`. Every index on amount must move the row.", "update($1, $0)", STATEMENT),
  e("churn", "write", "churn(row, customer, amount, day)", "Erase row number `row` and insert a new row in its place.", "churn($1, $0)", STATEMENT),

  e("label", "helper", "label(name)", "Start a phase. Operations are timed per label. Labels run in order of first use.", 'label("$1");', STATEMENT),
  e("rnd", "helper", "rnd(n)", "Uniform random integer in [0, n). Deterministic per run.", "rnd($1)", ["statement", "expr", "exprOuter"]),
  e("zipf", "helper", "zipf(n, skew = 0.5)", "Random integer in [0, n), small values more likely. skew 0 is uniform.", "zipf($1, 0.5)", ["statement", "expr", "exprOuter"]),
  e("rows", "helper", "rows", "The table size set by the Rows knob.", "rows", ["statement", "expr", "exprOuter"]),

  e("for loop", "snippet", "for (…) { … }", "Repeat an operation n times.", "for (let i = 0; i < $1; i++) {\n  $0\n}", STATEMENT),
  e("phase", "snippet", "label + loop", "A labelled phase of n operations.", 'for (let i = 0; i < $1; i++) {\n  label("$0");\n  \n}', STATEMENT),
  e("lookup", "snippet", "where(customer.eq(rnd(...))).count()", "A lookup by a random customer.", "where(customer.eq(rnd(rows / 20))).count();", STATEMENT),
  e("range", "snippet", "where(amount.between(a, a + w)).count()", "A range of amounts.", "const a = rnd(99000);\nwhere(amount.between(a, a + $1)).count();", STATEMENT),
  e("top k", "snippet", "all().orderBy(amount, true).limit(k)", "The k largest amounts.", "all().orderBy(amount, true).limit($1).sumAmount();", STATEMENT),

  e("for", "keyword", "for", "", "for ($1)", STATEMENT),
  e("let", "keyword", "let", "", "let ", STATEMENT),
  e("const", "keyword", "const", "", "const ", STATEMENT),
  e("if", "keyword", "if", "", "if ($1)", STATEMENT),
  e("else", "keyword", "else", "", "else ", STATEMENT),
  e("while", "keyword", "while", "", "while ($1)", STATEMENT),
];

// One-letter glyph per kind for the autocomplete list.
export const GLYPH = { field: "F", pred: "P", query: "Q", terminal: "T", write: "W", helper: "H", snippet: "S", keyword: "K" };

// Entry by name for the real vocabulary (not snippets or keywords).
export const BY_NAME = new Map();
for (const v of VOCAB) if (v.kind !== "snippet" && v.kind !== "keyword" && !BY_NAME.has(v.name)) BY_NAME.set(v.name, v);

// Calls that signature help knows.
export const SIG_CALLS = new Set(["where", "eq", "ge", "gt", "le", "lt", "between", "orderBy", "limit", "update", "churn", "label", "rnd", "zipf"]);

// Split "name(a, b = 1)" style signatures into { head, params, tail } for bolding one argument.
export function sigParts(entry) {
  const sig = entry.signature;
  const open = sig.indexOf("(");
  const close = sig.lastIndexOf(")");
  if (open < 0 || close < open) return { head: sig, params: [], tail: "" };
  const inner = sig.slice(open + 1, close);
  return { head: sig.slice(0, open + 1), params: inner ? inner.split(", ") : [], tail: sig.slice(close) };
}

// Methods that are valid after a dot (for "did you mean" on dotted names).
export const DOT_NAMES = VOCAB.filter((v) => v.kind === "pred" || v.kind === "terminal" || v.name === "orderBy" || v.name === "limit").map((v) => v.name);
// Names that are valid without a dot.
export const BARE_NAMES = VOCAB.filter((v) => v.kind === "field" || v.kind === "write" || v.kind === "helper" || v.name === "where" || v.name === "all").map((v) => v.name);
