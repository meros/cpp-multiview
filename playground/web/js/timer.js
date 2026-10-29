// Timer resolution, the noisy rule and medians. timerResolution() needs performance.now(); the rest is pure.

// Smallest observable step of performance.now(), in microseconds.
export function timerResolution() {
  let best = Infinity;
  for (let i = 0; i < 2000; i++) {
    const a = performance.now();
    let b = performance.now();
    while (b === a) b = performance.now();
    best = Math.min(best, b - a);
  }
  return best * 1000;
}

// A measured total time (ms) is noisy when it is below ten clock ticks.
export function isNoisy(totalMs, resMs) {
  return totalMs < 10 * resMs;
}

export function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// The ns per op below which a label of `ops` operations cannot be trusted.
export function noiseBoundNs(ops, resMs) {
  return ops > 0 ? (10 * resMs * 1e6) / ops : Infinity;
}
