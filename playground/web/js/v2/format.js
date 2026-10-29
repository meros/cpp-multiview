// Number formats of the experience spec, section 5.2. Pure.
// Thousands are grouped with a no-break space so that a number never wraps in the log.

const NBSP = " ";

export const US = "µs"; // micro sign + s, as written in the spec

// A rounded number as text without exponent: 7.6, 0.47, 260, 2600.
function plain(x) {
  if (!isFinite(x)) return String(x);
  if (x === 0) return "0";
  const ax = Math.abs(x);
  if (ax >= 1e21) return x.toExponential(0);
  if (ax < 1e-6) return "0";
  let s = String(x);
  if (/e/i.test(s)) s = x.toFixed(Math.min(20, Math.max(0, 2 - Math.floor(Math.log10(ax)))));
  return s;
}

// 50000 -> "50 000". Negative numbers keep their sign. Non-integers keep their decimals.
export function group(x) {
  const s = typeof x === "string" ? x : plain(x);
  const m = /^(-?)(\d+)(\.\d+)?$/.exec(s);
  if (!m) return s;
  return m[1] + m[2].replace(/\B(?=(\d{3})+(?!\d))/g, NBSP) + (m[3] || "");
}

export const int = (n) => group(Math.round(n));

// x rounded to d significant digits, as grouped text: 2600 -> "2 600", 0.047 -> "0.047".
export function sig(x, d = 2) {
  if (!isFinite(x)) return String(x);
  if (x === 0) return "0";
  return group(plain(Number(x.toPrecision(d))));
}

// A time in nanoseconds: 0.47 µs, 130 µs, 7.6 ms, 260 ms, 1.2 s.
export function time(ns) {
  if (!isFinite(ns)) return "?";
  if (ns < 0) ns = 0;
  const us = ns / 1000;
  if (us < 1) {
    const r = Number(us.toPrecision(2));
    if (r < 1) return sig(us, 2) + " " + US;
  }
  if (us < 999.5) return int(us) + " " + US; // 1 to 999 µs, whole µs
  const ms = ns / 1e6;
  if (ms < 999.5) return sig(ms, 2) + " ms";
  const s = ns / 1e9;
  return group(s.toFixed(1)) + " s";
}

export const timeMs = (ms) => time(ms * 1e6);

// Bytes, base 1000, three significant digits: 651 KB, 1.07 MB.
export function bytes(b) {
  if (b < 1000) return int(b) + " B";
  const kb = b / 1000;
  if (kb < 999.5) return sig(kb, 3) + " KB";
  const mb = kb / 1000;
  if (mb < 999.5) return sig(mb, 3) + " MB";
  return sig(mb / 1000, 3) + " GB";
}

// A ratio r >= 1 or < 1 as words. { faster: true } for r = other / mine (the bigger, the better).
// Returns "about the same" under 1.3 in either direction.
export function ratioWords(r, { bound = false } = {}) {
  if (!isFinite(r) || r <= 0) return "about the same";
  if (bound) {
    if (r < 1.3) return "about the same";
    return "at least " + sig(r, 2) + " times faster";
  }
  if (r >= 1 / 1.3 && r <= 1.3) return "about the same";
  if (r > 1.3) return sig(r, 2) + " times faster";
  return sig(1 / r, 2) + " times slower";
}

// Number of queries etc: "1 query", "2 queries".
export const plural = (n, one, many) => `${int(n)} ${n === 1 ? one : many}`;
