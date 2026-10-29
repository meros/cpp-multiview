// The single state store: shallow merge, per-key subscriptions, batched per microtask.
// No DOM access, so it runs in node.

export const SAMPLE_CAP = 2000;
export const EVENT_CAP = 2000;

export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  let pending = null;
  let queued = false;

  function flush() {
    queued = false;
    const changed = pending;
    pending = null;
    for (const sub of [...subs]) {
      if (sub.keys === null || sub.keys.some((k) => changed.has(k))) sub.fn(state, changed);
    }
  }

  return {
    get: () => state,
    set(patch) {
      const p = typeof patch === "function" ? patch(state) : patch;
      const keys = Object.keys(p);
      if (!keys.length) return;
      state = { ...state, ...p };
      if (!pending) pending = new Set();
      for (const k of keys) pending.add(k);
      if (!queued) {
        queued = true;
        queueMicrotask(flush);
      }
    },
    // An empty key list subscribes to every change.
    subscribe(keys, fn) {
      const sub = { keys: keys && keys.length ? keys : null, fn };
      subs.add(sub);
      return () => subs.delete(sub);
    },
  };
}

export function defaultKnobs() {
  return { rows: 50000, seed: 1, eagerness: 1, maxIndexKb: 0, rent: 1e-5, yoursMask: [0, 0, 0], repeat: 3 };
}

export function unlockedAll() {
  return { rows: false, seed: false, eagerness: false, maxIndexKb: false, rent: false, yoursMask: false, repeat: false, copies: false, editor: false };
}

export function initialState() {
  return {
    mode: "lesson",
    lessonId: null,
    lessonProgress: {},
    checks: [],
    attempts: 0,
    actionPasses: 0,
    clockNote: false,
    allDone: false,
    knobs: defaultKnobs(),
    locked: unlockedAll(),
    stale: false,
    tableRows: 0,
    shownCopies: [true, true, true, true, true, true],
    script: "",
    compiled: null,
    run: { status: "idle", pass: 0, done: 0, passes: 0, startedAt: 0, message: "", kind: "run" },
    budget: null,
    samples: [],
    events: [],
    sweep: [],
    sweepSizes: [1000, 10000, 50000, 200000],
    indexes: [],
    counters: { scans: 0, probes: 0, walks: 0, builds: 0, drops: 0, rent_drops: 0, trials: 0 },
    plans: [],
    cues: [],
    focus: null,
    focusStamp: 0,
    view: { chartMode: "log", chart: "timeline", chartLabel: -1, openPanels: { chart: true, results: true, inspector: true, plans: true, memory: true } },
    env: { timerResMs: 0.1, isolated: false },
    theme: "auto",
    error: null,
    wasmReady: false,
    wasmError: null,
    editorKind: "none",
  };
}
