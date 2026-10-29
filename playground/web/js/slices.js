// Slicing rule of the run model (spec section 3). Pure.

export function sliceCount(nOps) {
  return Math.min(10, Math.max(1, Math.round(nOps / 500)));
}

// Stable sort of op records by label index. order[j] is the original index of sorted op j;
// inverse[i] is the sorted position of original op i.
export function sortByLabel(ops) {
  const order = ops.map((_, i) => i).sort((a, b) => ops[a][1] - ops[b][1] || a - b);
  const inverse = new Array(ops.length);
  order.forEach((orig, j) => { inverse[orig] = j; });
  return { sorted: order.map((i) => ops[i]), order, inverse };
}

// Rule used when the label-aware cut would give more than 10 slices: cut whenever the
// current slice reaches ceil(nOps / slices) ops.
function plainSlices(n, slices) {
  const target = Math.ceil(n / slices);
  const out = [];
  for (let s = 0; s < n; s += target) out.push({ start: s, count: Math.min(target, n - s) });
  return out;
}

// labels: the label index of each op, in label-sorted order. Returns [{ start, count }].
// A label stays in one slice unless it alone is longer than the slice target; then it is
// split into equal parts. If that gives more than 10 slices, fall back to the plain rule.
export function planSlices(labels) {
  const n = labels.length;
  if (!n) return [];
  const slices = sliceCount(n);
  const target = Math.ceil(n / slices);
  const out = [];
  let cur = null;
  const flush = () => { if (cur && cur.count) out.push(cur); cur = null; };
  for (let i = 0; i < n; ) {
    let j = i;
    while (j < n && labels[j] === labels[i]) j++;
    const len = j - i;
    if (len > target) {
      flush();
      const parts = Math.ceil(len / target);
      const base = Math.floor(len / parts);
      const rem = len % parts;
      let s = i;
      for (let p = 0; p < parts; p++) {
        const c = base + (p < rem ? 1 : 0);
        out.push({ start: s, count: c });
        s += c;
      }
    } else {
      if (cur && cur.count + len > target) flush();
      cur = cur ? { start: cur.start, count: cur.count + len } : { start: i, count: len };
    }
    i = j;
  }
  flush();
  return out.length > 10 ? plainSlices(n, slices) : out;
}
