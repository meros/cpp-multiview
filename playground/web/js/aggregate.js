// Aggregates over samples: pass totals and the median rule for timed values. Pure.
import { isNoisy, median, noiseBoundNs } from "./timer.js";

export function lastPassNumber(samples) {
  return samples.length ? samples[samples.length - 1].pass : 0;
}

export function samplesOfPass(samples, pass) {
  return samples.filter((x) => x.pass === pass);
}

// Totals of one pass: ns per op for all labels and for each label, bytes after the last slice.
export function passAggregate(samples, pass, resMs) {
  const sl = samplesOfPass(samples, pass);
  if (!sl.length) return null;
  const labels = sl[0].labels;
  const nCopies = sl[0].copies.length;
  const ops = sl.reduce((a, x) => a + x.ops, 0);
  const labelOps = labels.map((_, l) => sl.reduce((a, x) => a + (x.labelOps ? x.labelOps[l] || 0 : 0), 0));
  const copies = [];
  for (let k = 0; k < nCopies; k++) {
    const totalMs = sl.reduce((a, x) => a + (x.copies[k].ns * x.ops) / 1e6, 0);
    const labelMs = labels.map((_, l) => sl.reduce((a, x) => a + (x.copies[k].labelNs[l] * (x.labelOps ? x.labelOps[l] || 0 : 0)) / 1e6, 0));
    copies.push({
      ns: ops ? (totalMs * 1e6) / ops : 0,
      bytes: sl[sl.length - 1].copies[k].bytes,
      labelNs: labelMs.map((ms, l) => (labelOps[l] ? (ms * 1e6) / labelOps[l] : 0)),
      noisy: isNoisy(totalMs, resMs),
      labelNoisy: labelMs.map((ms, l) => labelOps[l] > 0 && isNoisy(ms, resMs)),
    });
  }
  return { pass, labels, ops, labelOps, copies, agree: sl.every((x) => x.agree) };
}

// "Adaptive ns on label L in pass P": the median of the non-noisy slice values; if every
// slice is noisy, the pass total. Returns { ns, noisy, boundNs } (ns is NaN when absent).
export function labelValue(samples, copy, label, pass, resMs) {
  const sl = samplesOfPass(samples, pass);
  if (!sl.length) return { ns: NaN, noisy: false, boundNs: NaN };
  const l = typeof label === "number" ? label : sl[0].labels.indexOf(label);
  if (l < 0) return { ns: NaN, noisy: false, boundNs: NaN };
  const used = sl.filter((x) => x.labelOps && x.labelOps[l] > 0);
  if (!used.length) return { ns: NaN, noisy: false, boundNs: NaN };
  const clean = used.filter((x) => !x.copies[copy].labelNoisy[l]).map((x) => x.copies[copy].labelNs[l]);
  const totalOps = used.reduce((a, x) => a + x.labelOps[l], 0);
  const boundNs = noiseBoundNs(totalOps, resMs);
  if (clean.length) return { ns: median(clean), noisy: false, boundNs };
  const total = used.reduce((a, x) => a + x.copies[copy].labelNs[l] * x.labelOps[l], 0);
  return { ns: total / totalOps, noisy: true, boundNs };
}

// ns per op over the whole pass for one copy (all labels).
export function passNsPerOp(samples, copy, pass) {
  const sl = samplesOfPass(samples, pass);
  if (!sl.length) return NaN;
  const ops = sl.reduce((a, x) => a + x.ops, 0);
  return sl.reduce((a, x) => a + x.copies[copy].ns * x.ops, 0) / ops;
}

// Log range shared by the timeline and the results bars: [lo, hi] in ns, snapped to decades.
export function logRange(values) {
  const v = values.filter((x) => Number.isFinite(x) && x > 0);
  if (!v.length) return [10, 1e4];
  const lo = Math.max(10, Math.min(...v) * 0.5);
  const hi = Math.max(...v) * 2;
  let a = Math.floor(Math.log10(lo));
  let b = Math.ceil(Math.log10(hi));
  if (b <= a) b = a + 1;
  return [10 ** a, 10 ** b];
}
