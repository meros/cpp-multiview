// Number formatting and the tiny inline markup formatter (`code`, **bold**). No DOM except renderInline.

export function fmtNs(v) {
  if (!isFinite(v) || v <= 0) return "—";
  if (v < 1000) return `${Math.round(v)} ns`;
  if (v < 1e6) return `${(v / 1e3).toFixed(1)} µs`;
  return `${(v / 1e6).toFixed(2)} ms`;
}

// "< 50 µs": the value is below what the clock can resolve for this run.
export function fmtBound(boundNs) {
  return `< ${fmtNs(boundNs)}`;
}

export function fmtInt(n) {
  if (!isFinite(n)) return "—";
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function fmtKb(bytes) {
  return fmtInt(bytes / 1024);
}

export function fmtRatio(x) {
  if (!isFinite(x)) return "—";
  return `${x >= 100 ? Math.round(x) : x.toFixed(1)}×`;
}

export function fmtSeconds(s) {
  return s < 10 ? s.toFixed(1) : String(Math.round(s));
}

// Split text into [{ t: "text"|"code"|"b", s }]. Pure, so it can be tested without a DOM.
export function parseInline(text) {
  const out = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: "text", s: text.slice(last, m.index) });
    out.push(m[1] !== undefined ? { t: "code", s: m[1] } : { t: "b", s: m[2] });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ t: "text", s: text.slice(last) });
  return out;
}

export function renderInline(el, text) {
  el.textContent = "";
  for (const part of parseInline(text)) {
    if (part.t === "text") el.append(document.createTextNode(part.s));
    else {
      const n = document.createElement(part.t === "code" ? "code" : "strong");
      n.textContent = part.s;
      el.append(n);
    }
  }
  return el;
}

export function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
