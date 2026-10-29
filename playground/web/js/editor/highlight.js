// Tokenizer and highlighter for the workload DSL (JavaScript subset) and for the C++ view.
// Pure: no DOM. Tokens carry 1-based line and column.

const KEYWORDS = new Set("for let const var if else while do break continue return function true false null undefined new of in".split(" "));
const FIELD_NAMES = new Set(["customer", "amount", "day"]);
const PRED_NAMES = new Set(["eq", "ge", "gt", "le", "lt", "between"]);
const QUERY_NAMES = new Set(["where", "all", "orderBy", "limit"]);
const TERM_NAMES = new Set(["count", "exists", "first", "sumAmount"]);
const WRITE_NAMES = new Set(["update", "churn"]);
const HELPER_NAMES = new Set(["label", "rnd", "zipf", "rows"]);

const CPP_KEYWORDS = new Set("struct constexpr auto for int return true false".split(" "));

const CLASS_OF = {
  comment: "tk-com", string: "tk-str", number: "tk-num", keyword: "tk-kw", field: "tk-field", pred: "tk-pred",
  query: "tk-query", terminal: "tk-term", write: "tk-write", helper: "tk-help", ident: "tk-id", punct: "tk-punct", op: "tk-op",
};

const RE_HEX = /0[xX][0-9a-fA-F]+/y;
const RE_NUM = /\d[\d_]*(\.\d+)?([eE][+-]?\d+)?/y;
const RE_IDENT = /[\p{L}_$][\p{L}\p{N}_$‌‍]*/uy;
const RE_WS = /\s+/y;
const PUNCT = "()[]{},;.";
const OPCH = "+-*/%=<>!&|?:^~";

// Shared scanner. `cpp` switches the identifier classification and the `mv::name` rule.
function scan(code, cpp) {
  const out = [];
  const n = code.length;
  let i = 0, line = 1, lineStart = 0;
  let prevSig = null; // last token that is not whitespace or a comment

  const add = (type, start, end, open) => {
    const tok = { type, text: code.slice(start, end), start, end, line, col: start - lineStart + 1 };
    if (open) tok.open = true;
    out.push(tok);
    if (type !== "ws" && type !== "comment") prevSig = tok;
    // Advance the line counter over any newlines inside the token.
    for (let k = start; k < end; k++) if (code.charCodeAt(k) === 10) { line++; lineStart = k + 1; }
    i = end;
    return tok;
  };

  while (i < n) {
    const c = code[i];
    const c2 = code[i + 1];
    if (c === " " || c === "\t" || c === "\n" || c === "\r" || /\s/.test(c)) {
      RE_WS.lastIndex = i; RE_WS.test(code); add("ws", i, RE_WS.lastIndex); continue;
    }
    if (c === "/" && c2 === "/") {
      let e = code.indexOf("\n", i); if (e < 0) e = n;
      add("comment", i, e); continue;
    }
    if (c === "/" && c2 === "*") {
      const e = code.indexOf("*/", i + 2);
      if (e < 0) add("comment", i, n, true); else add("comment", i, e + 2);
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1, closed = false;
      while (j < n) {
        const d = code[j];
        if (d === "\\") { j += (code[j + 1] === "\n" || j + 1 >= n) ? 1 : 2; continue; }
        if (d === c) { j++; closed = true; break; }
        if (d === "\n" && c !== "`") break;
        j++;
      }
      if (!closed && c === "`") { let e = code.indexOf("\n", i); if (e < 0) e = n; j = e; }
      add("string", i, closed ? j : Math.min(j, n), !closed); continue;
    }
    if (c >= "0" && c <= "9") {
      RE_HEX.lastIndex = i;
      if (RE_HEX.test(code)) { add("number", i, RE_HEX.lastIndex); continue; }
      RE_NUM.lastIndex = i; RE_NUM.test(code); add("number", i, RE_NUM.lastIndex); continue;
    }
    RE_IDENT.lastIndex = i;
    if (RE_IDENT.test(code)) {
      const end = RE_IDENT.lastIndex;
      const text = code.slice(i, end);
      const dot = prevSig && prevSig.type === "punct" && prevSig.text === ".";
      let type;
      if (cpp) {
        type = CPP_KEYWORDS.has(text) ? "keyword" : "ident";
        if (text === "mv" && code.startsWith("::", end)) {
          RE_IDENT.lastIndex = end + 2;
          if (RE_IDENT.test(code)) { add("query", i, RE_IDENT.lastIndex); continue; }
        }
      } else if (!dot && KEYWORDS.has(text)) type = "keyword";
      else if (FIELD_NAMES.has(text)) type = "field";
      else if (dot && PRED_NAMES.has(text)) type = "pred";
      else if (QUERY_NAMES.has(text)) type = "query";
      else if (dot && TERM_NAMES.has(text)) type = "terminal";
      else if (WRITE_NAMES.has(text)) type = "write";
      else if (HELPER_NAMES.has(text)) type = "helper";
      else type = "ident";
      add(type, i, end); continue;
    }
    if (PUNCT.includes(c)) { add("punct", i, i + 1); continue; }
    if (OPCH.includes(c)) {
      let j = i + 1;
      while (j < n && OPCH.includes(code[j]) && !(code[j] === "/" && (code[j + 1] === "/" || code[j + 1] === "*"))) j++;
      add("op", i, j); continue;
    }
    add("op", i, i + 1); // any other character
  }
  return out;
}

export function tokenize(code) {
  return scan(code, false);
}

export function tokenizeCpp(code) {
  return scan(code, true);
}

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
const escapeHtml = (s) => s.replace(/[&<>]/g, (ch) => ESC[ch]);

// HTML for a token list. Whitespace is not wrapped.
export function tokensToHtml(tokens) {
  let html = "";
  for (const t of tokens) {
    const cls = CLASS_OF[t.type];
    html += cls ? `<span class="${cls}">${escapeHtml(t.text)}</span>` : escapeHtml(t.text);
  }
  return html;
}

export function highlight(code, lang = "dsl") {
  return tokensToHtml(lang === "cpp" ? tokenizeCpp(code) : tokenize(code));
}
