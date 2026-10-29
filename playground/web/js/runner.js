// The run model (spec section 3): reset, passes, slices, samples, sweep, time budget, stop.
// Depends on a wasm wrapper, a store and a compile function; no DOM access.
import { SAMPLE_CAP, EVENT_CAP } from "./store.js";
import { deriveEvents } from "./events.js";
import { isNoisy } from "./timer.js";
import { planSlices, sortByLabel } from "./slices.js";
import { passAggregate, lastPassNumber } from "./aggregate.js";

// One sample from one slice. prev is { indexes, counters } of the previous snapshot.
export function buildSample({ seq, pass, slice, labels, labelOps, exec, state, prev, resMs, nOps, order, start }) {
  const copies = exec.variants.map((v) => ({
    ns: v.ns,
    bytes: v.bytes,
    labelNs: v.labels,
    noisy: isNoisy((v.ns * nOps) / 1e6, resMs),
    labelNoisy: v.labels.map((x, l) => labelOps[l] > 0 && isNoisy((x * labelOps[l]) / 1e6, resMs)),
  }));
  const agree = exec.first_disagreement < 0;
  const disagreeOp = agree ? -1 : order ? order[start + exec.first_disagreement] : exec.first_disagreement;
  const sample = { seq, pass, slice, ops: nOps, labels, labelOps, copies, agree, indexes: state.indexes, counters: state.counters, events: [] };
  sample.events = deriveEvents(prev, sample, { seq, pass, slice, agree, disagreeOp });
  return sample;
}

const capTail = (arr, cap) => (arr.length > cap ? arr.slice(arr.length - cap) : arr);
const defaultTick = () => new Promise((r) => setTimeout(r, 0));

export function createRunner({ store, wasm, compile, tick = defaultTick, now = () => performance.now() }) {
  const hooks = { passDone: null, runEnd: null };
  let passCounter = 0;
  let seq = 0;
  let prevSnap = { indexes: [], counters: { rent_drops: 0, trials: 0 } };
  let stopRequested = false;
  let current = null;
  let loaded = null;

  const safeCompile = (code, rows) => {
    try {
      return compile(code, rows);
    } catch (e) {
      return { ok: false, error: { message: String(e && e.message ? e.message : e) } };
    }
  };

  function reset({ clearSweep = false, rows } = {}) {
    const s = store.get();
    const k = s.knobs;
    const n = rows ?? k.rows;
    wasm.reset({ rows: n, seed: k.seed, eagerness: k.eagerness, maxIndexKb: k.maxIndexKb, rent: k.rent, yoursMask: k.yoursMask });
    const st = wasm.state();
    passCounter = 0;
    seq = 0;
    prevSnap = { indexes: st.indexes, counters: st.counters };
    store.set({
      samples: [], events: [], plans: [], indexes: st.indexes, counters: st.counters,
      stale: false, tableRows: n, error: null, budget: null,
      ...(clearSweep ? { sweep: [] } : {}),
    });
  }

  // Runs `passes` passes of compiled script c. Returns the number of passes completed.
  async function execute(c, passes, track = true) {
    const sorted = sortByLabel(c.ops);
    const labelOf = sorted.sorted.map((o) => o[1]);
    loaded = { ...wasm.loadOps(sorted.sorted), inverse: sorted.inverse };
    const slices = planSlices(labelOf);
    const nLabels = c.labels.length;
    const resMs = store.get().env.timerResMs;
    let done = 0;
    for (let p = 1; p <= passes && !stopRequested; p++) {
      passCounter++;
      let cut = false;
      for (let si = 0; si < slices.length; si++) {
        const sl = slices[si];
        const exec = wasm.exec(loaded.ptr, sl.start, sl.count, nLabels);
        const st = wasm.state();
        const labelOps = new Array(nLabels).fill(0);
        for (let j = sl.start; j < sl.start + sl.count; j++) labelOps[labelOf[j]]++;
        const sample = buildSample({
          seq: ++seq, pass: passCounter, slice: si, labels: c.labels, labelOps, exec, state: st,
          prev: prevSnap, resMs, nOps: sl.count, order: sorted.order, start: sl.start,
        });
        prevSnap = { indexes: st.indexes, counters: st.counters };
        store.set((s) => ({
          samples: capTail([...s.samples, sample], SAMPLE_CAP),
          events: capTail([...s.events, ...sample.events], EVENT_CAP),
          indexes: st.indexes,
          counters: st.counters,
          run: { ...s.run, pass: p },
        }));
        await tick();
        if (stopRequested) { cut = true; break; }
      }
      const plans = c.shapes.map((opIndex, i) => ({
        shapeText: c.shapeText ? c.shapeText[i] : `shape ${i + 1}`,
        plan: wasm.explain(loaded.ptr, loaded.inverse[opIndex]),
        label: c.ops[opIndex][1],
      }));
      store.set({ plans });
      if (cut) break;
      done++;
      if (track) store.set((s) => ({ run: { ...s.run, done: p } }));
      if (hooks.passDone) hooks.passDone({ pass: passCounter, runPass: p, passes });
    }
    return done;
  }

  function begin(kind, passes, message, quiet = false) {
    stopRequested = false;
    store.set({ run: { status: "running", pass: 0, done: 0, passes, startedAt: now(), message: message || "", kind, quiet }, error: null, budget: null });
  }

  function finish(kind, done, stopped, silent) {
    store.set((s) => ({ run: { ...s.run, status: "idle", message: "" } }));
    if (!silent && hooks.runEnd) hooks.runEnd({ kind, passes: done, stopped });
  }

  // Run the current (or given) script for `passes` passes. Resets first when the table is stale.
  function run({ passes, script, message = "", silent = false } = {}) {
    if (current) return current;
    current = (async () => {
      const s0 = store.get();
      const n = passes ?? s0.knobs.repeat;
      if (s0.stale || !s0.tableRows) reset();
      const s = store.get();
      const c = safeCompile(script ?? s.script, s.tableRows);
      if (!c.ok) {
        store.set({ error: c.error.message });
        return { ok: false, error: c.error };
      }
      begin("run", n, message, silent);
      let done = 0;
      try {
        done = await execute(c, n);
      } catch (e) {
        store.set({ error: String(e && e.message ? e.message : e) });
      }
      const stopped = stopRequested;
      finish("run", done, stopped, silent);
      return { ok: true, passes: done, stopped };
    })().finally(() => { current = null; });
    return current;
  }

  // One pass of the script per table size. Leaves the table at the last size (stale).
  function sweep({ sizes, script } = {}) {
    if (current) return current;
    current = (async () => {
      const s0 = store.get();
      const list = sizes || s0.sweepSizes;
      store.set({ sweep: [], sweepSizes: list });
      begin("sweep", list.length, "");
      let done = 0;
      try {
        for (const size of list) {
          if (stopRequested) break;
          reset({ rows: size });
          const c = safeCompile(script ?? store.get().script, size);
          if (!c.ok) { store.set({ error: c.error.message }); break; }
          const n = await execute(c, 1, false);
          if (n < 1) break;
          const agg = passAggregate(store.get().samples, lastPassNumber(store.get().samples), store.get().env.timerResMs);
          store.set((s) => ({
            sweep: [...s.sweep, { rows: size, ns: agg.copies.map((x) => x.ns), noisy: agg.copies.map((x) => x.noisy) }],
            run: { ...s.run, pass: done + 1, done: done + 1 },
          }));
          done++;
        }
      } catch (e) {
        store.set({ error: String(e && e.message ? e.message : e) });
      }
      store.set((s) => ({ stale: s.tableRows !== s.knobs.rows || s.stale }));
      const stopped = stopRequested;
      finish("sweep", done, stopped, false);
      return { ok: true, passes: done, stopped };
    })().finally(() => { current = null; });
    return current;
  }

  function stop() {
    if (!current) return;
    stopRequested = true;
    store.set((s) => ({ run: { ...s.run, status: "stopping" } }));
  }

  // Seconds the next run would take, judged from the scan copy's last pass; null if unknown.
  function estimateSeconds() {
    const s = store.get();
    const last = lastPassNumber(s.samples);
    if (!last) return null;
    const agg = passAggregate(s.samples, last, s.env.timerResMs);
    const scan = agg && agg.copies[1] ? agg.copies[1].ns : 0;
    if (!scan) return null;
    const c = safeCompile(s.script, s.knobs.rows);
    if (!c.ok) return null;
    const scale = s.tableRows ? s.knobs.rows / s.tableRows : 1;
    return (scan * c.ops.length * s.knobs.repeat * scale) / 1e9;
  }

  return {
    reset, run, sweep, stop, estimateSeconds,
    hooks,
    whenIdle: () => current || Promise.resolve(),
    isBusy: () => !!current,
  };
}
