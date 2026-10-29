// Axis maths shared by the charts. Pure, so it runs in node.

export function logScale(lo, hi, yBottom, yTop) {
  const a = Math.log10(lo);
  const b = Math.log10(hi);
  return (v) => yBottom + ((Math.log10(Math.max(v, lo)) - a) / (b - a)) * (yTop - yBottom);
}

export function linScale(lo, hi, yBottom, yTop) {
  return (v) => yBottom + ((v - lo) / (hi - lo || 1)) * (yTop - yBottom);
}

// Decade gridlines with minor ticks at 2x and 5x. lo and hi are powers of ten.
export function logTicks(lo, hi) {
  const major = [];
  const minor = [];
  for (let e = Math.round(Math.log10(lo)); e <= Math.round(Math.log10(hi)); e++) {
    major.push(10 ** e);
    if (e < Math.round(Math.log10(hi))) minor.push(2 * 10 ** e, 5 * 10 ** e);
  }
  return { major, minor };
}

export function tickLabel(v) {
  if (v < 1e3) return `${v} ns`;
  if (v < 1e6) return `${v / 1e3} µs`;
  return `${v / 1e6} ms`;
}

// Smallest 1, 2, 5 times a power of ten that is at least v.
export function niceCeil(v) {
  if (!(v > 0)) return 1;
  const e = Math.floor(Math.log10(v));
  const f = v / 10 ** e;
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return m * 10 ** e;
}

export function linTicks(max, count = 4) {
  const step = niceCeil(max / count);
  const out = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
  return { ticks: out, max: out[out.length - 1] };
}

// Move labels apart vertically. items: [{ y }] in any order. Returns new y values in input order,
// at least minGap apart and inside [top, bottom].
export function spreadLabels(ys, minGap, top, bottom) {
  const idx = ys.map((y, i) => i).sort((a, b) => ys[a] - ys[b]);
  const out = ys.slice();
  let prev = top - minGap;
  for (const i of idx) {
    out[i] = Math.max(ys[i], prev + minGap);
    prev = out[i];
  }
  const last = idx[idx.length - 1];
  if (last !== undefined && out[last] > bottom) {
    let limit = bottom;
    for (let k = idx.length - 1; k >= 0; k--) {
      const i = idx[k];
      out[i] = Math.min(out[i], limit);
      limit = out[i] - minGap;
    }
  }
  return out;
}

// Index of the entry in xs closest to x (xs ascending).
export function nearestIndex(xs, x) {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const d = Math.abs(xs[i] - x);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
