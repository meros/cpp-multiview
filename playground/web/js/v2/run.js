// One Run of the v2 page (spec 7.3): compile, chunk, execute, collect. No DOM.
// The result is the plain object that narrate.js and chart.js read.

import { compile as compileDsl } from "../editor/compile.js";

export const COPY_NAMES = ["adaptive", "scan only", "grouped only", "sorted only", "grouped and sorted"];
export const SEED_SCRIPT = 12345;
export const SEED_TABLE = 1;
export const CHUNK_OPS = 5000;
export const BUDGET_MS = 4000; // a copy that would need more than this for the rest of the run leaves the mask
export const MAX_FIRST_ROWS = 20;

// Group size B of spec 7.3: one group = B consecutive operations; at most about 50 groups.
export const groupSize = (nOps) => Math.max(200, Math.ceil(nOps / 50 / 200) * 200);

export const maskOf = (copies) => copies.reduce((m, c) => m | (1 << c), 0);

// Compile for a run. Same call as the editor, plus the source line of each op.
export function compileForRun(code, rows) {
  return compileDsl(code, rows, SEED_SCRIPT, { lines: true });
}

const trimLine = (s) => {
  const t = s.trim();
  return t.length > 60 ? t.slice(0, 59) + "…" : t;
};

// Blocks: one per source line that recorded operations, in order of first execution.
export function buildBlocks(recs, code, labelNames) {
  const lines = code.split("\n");
  const byLine = new Map();
  const blocks = [];
  recs.forEach((r, i) => {
    const line = r[15] || 0;
    let b = byLine.get(line);
    if (!b) {
      b = {
        line,
        text: line ? trimLine(lines[line - 1] || "") : "",
        label: labelNames[r[1]] ?? "(default)",
        kind: r[0] === 0 ? "query" : r[0] === 1 ? "update" : "churn",
        rec: r,
        ops: [],
      };
      byLine.set(line, b);
      blocks.push(b);
    }
    b.ops.push(i);
  });
  return blocks;
}

// One animation frame, but never longer than 100 ms: a hidden tab does not draw frames.
const defaultTick = () => new Promise((r) => {
  const t = setTimeout(r, 100);
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => { clearTimeout(t); r(); });
});

// opts: { bridge, compiled, code, rows, rent, copies, fresh, clock: { tickUs }, tick, shouldStop, onProgress, now }
export async function executeRun(opts) {
  const { bridge, compiled, code, rows, rent, copies, fresh = true } = opts;
  const tick = opts.tick || defaultTick;
  const original = compiled.ops;
  const n = original.length;
  const B = groupSize(n);
  const nGroups = Math.ceil(n / B);
  const labelNames = compiled.labels;

  // Records for the engine: label = group index; the user's label stays in `original`.
  const recs = original.map((r, i) => {
    const c = r.slice(0, 16);
    c[1] = Math.floor(i / B);
    return c;
  });
  const blocks = buildBlocks(original, code, labelNames);

  const active = [...new Set(copies)].sort((a, b) => a - b);
  if (!active.includes(0)) active.unshift(0);
  let mask = maskOf(active);
  const requested = active.slice();

  if (fresh) bridge.reset({ rows, seed: SEED_TABLE, eagerness: 1, maxIndexKb: 0, rent });
  bridge.setCopies(mask);
  const json0 = fresh ? null : bridge.state();

  const loaded = bridge.loadOps(recs);
  const plansStart = blocks.map((b) => (b.kind === "query" ? bridge.explain(loaded.ptr, b.ops[0]) : ""));

  const groupNs = COPY_NAMES.map(() => new Float64Array(nGroups).fill(NaN));
  const groupOps = new Int32Array(nGroups);
  for (let g = 0; g < nGroups; g++) groupOps[g] = Math.min(B, n - g * B);
  const copyMs = COPY_NAMES.map(() => 0);
  const copyOps = COPY_NAMES.map(() => 0);
  const answers = new Float64Array(n);
  const events = [];
  const stoppedCopies = [];
  let disagree = -1;
  let base0 = 0;
  let done = 0;
  let stopped = null;
  const chunkGroups = Math.max(1, Math.floor(CHUNK_OPS / B));

  while (done < n) {
    if (opts.shouldStop && opts.shouldStop()) { stopped = { done, total: n }; break; }
    const count = Math.min(chunkGroups * B, n - done);
    const E = bridge.exec(loaded.ptr, done, count, nGroups);
    // pg_exec_json lists only the copies that ran, so find a copy by its name, not by its index.
    const variantOf = (k) => E.variants.find((v) => v.name === COPY_NAMES[k]);
    for (const k of active) {
      const v = variantOf(k);
      if (!v) continue;
      const g0 = done / B;
      for (let j = 0; j * B < count; j++) groupNs[k][g0 + j] = v.labels[g0 + j];
      copyMs[k] += (v.ns * count) / 1e6;
      copyOps[k] += count;
    }
    answers.set(bridge.results(0, count), done);
    for (const ev of E.events || []) events.push({ ...ev, op: done + ev.op, t_abs_ms: base0 + (ev.t_ms || 0) });
    base0 += (variantOf(0).ns * count) / 1e6;
    if (E.first_disagreement >= 0 && disagree < 0) disagree = done + E.first_disagreement;
    done += count;

    // Time budget: a copy (not the adaptive one) whose rest would take too long stops.
    for (const k of [...active]) {
      if (k === 0 || done >= n) continue;
      const each = copyMs[k] / copyOps[k];
      const remaining = each * (n - done);
      if (remaining > BUDGET_MS) {
        active.splice(active.indexOf(k), 1);
        mask = maskOf(active);
        bridge.setCopies(mask);
        stoppedCopies.push({ copy: k, after: copyOps[k], eachNs: (each * 1e6), remainingMs: remaining });
      }
    }
    if (opts.onProgress) opts.onProgress({ done, total: n });
    if (done < n) await tick();
  }

  const json = bridge.state();
  const plansNow = blocks.map((b) => (b.kind === "query" ? bridge.explain(loaded.ptr, b.ops[0]) : ""));
  // A stopped run keeps only the ops that ran.
  for (const b of blocks) if (done < n) b.ops = b.ops.filter((i) => i < done);
  const keep = blocks.filter((b) => b.ops.length > 0);

  const firstRows = {};
  let got = 0;
  for (const b of keep) {
    if (b.kind !== "query") continue;
    for (const i of b.ops) {
      const r = original[i];
      if (r[14] === 2 && r[11] >= 0 && answers[i] > 0 && got < MAX_FIRST_ROWS) {
        const row = bridge.row(answers[i] - 1);
        if (row) { firstRows[i] = row; got++; }
      }
    }
  }

  return {
    ok: true, fresh, rows, rent, B, nGroups, nOps: n, done,
    copies: requested, ranCopies: requested.filter((k) => copyOps[k] > 0),
    clock: opts.clock || { tickUs: 5 },
    recs: original, labels: labelNames, blocks: keep, plansStart: plansStart.filter((_, i) => keep.includes(blocks[i])), plansNow: plansNow.filter((_, i) => keep.includes(blocks[i])),
    groupNs, groupOps, copyMs, copyOps, answers, events, json, json0, firstRows,
    stoppedCopies, stopped, disagree,
  };
}

// Warm-up (spec 7.6): 2 000 mixed operations on a 10 000-row table, discarded, so that the first
// measured run does not pay for the engine's compile tiers.
const WARM_CODE = `for (let i = 0; i < 700; i++) where(customer.eq(rnd(rows / 20))).count();
for (let i = 0; i < 500; i++) { const a = rnd(99000); where(amount.between(a, a + 500)).count(); }
for (let i = 0; i < 500; i++) update(rnd(rows), rnd(100000));
for (let i = 0; i < 300; i++) all().orderBy(amount, true).limit(3).sumAmount();`;

export async function warmUp(bridge, rows = 10000) {
  const compiled = compileForRun(WARM_CODE, rows);
  if (!compiled.ok) return false;
  await executeRun({ bridge, compiled, code: WARM_CODE, rows, rent: 1e-5, copies: [0, 1, 2, 3], fresh: true, tick: async () => {} });
  return true;
}
