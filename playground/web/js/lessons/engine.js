// The lesson engine: applies a lesson, evaluates checks, counts attempts, sets cues and focus.
// Also owns the run actions (primary, sweep, reset) so the views stay thin. No DOM access.
import { LESSONS, fillFallback } from "./lessons.js";
import { helpers } from "./checks.js";
import { defaultKnobs, unlockedAll } from "../store.js";

const PANEL_IDS = { timeline: "chart", sweep: "chart", results: "results", inspector: "inspector", plans: "plans", memory: "memory" };
export const BUDGET_SECONDS = 8;

export function pendingChecks(lesson) {
  return lesson.checks.map((c) => ({ id: c.id, text: c.text, timed: c.timed, status: "pending", measured: "", fallback: "" }));
}

// Evaluate checks of a lesson against state s. A passed check stays passed. `final` is true at the
// end of an action: only then does an unmet check become "fail" (and only after `failAfter` passes).
export function evaluateChecks(lesson, s, prev, final) {
  return lesson.checks.map((c, i) => {
    const before = prev[i];
    if (before && before.status === "pass") return before;
    const base = { id: c.id, text: c.text, timed: c.timed, status: "pending", measured: "", fallback: "" };
    const gate = c.minPass || 0;
    if (s.actionPasses < gate) return final ? { ...base, measured: `needs at least ${gate} passes: raise the repeat count` } : base;
    let r;
    try {
      r = c.test(s, helpers);
    } catch (e) {
      return { ...base, measured: "check failed to run" };
    }
    if (r.pass) return { ...base, status: "pass", measured: r.measured };
    if (!final) return { ...base, measured: r.measured };
    const failAfter = c.failAfter || 0;
    if (s.actionPasses < failAfter) return { ...base, measured: `needs at least ${failAfter} passes: raise the repeat count` };
    return { ...base, status: "fail", measured: r.measured, fallback: fillFallback(c.fallback, r) };
  });
}

export function panelState(ids) {
  const open = { chart: false, results: false, inspector: false, plans: false, memory: false };
  for (const id of ids) if (PANEL_IDS[id]) open[PANEL_IDS[id]] = true;
  return open;
}

export function createEngine({ store, runner, ui = {}, storage = null, defaultScript = "", lessons = LESSONS }) {
  const byId = Object.fromEntries(lessons.map((l) => [l.id, l]));
  let openToken = 0;
  let preparing = false;
  let freeSaved = null;

  const wasmReady = () => store.get().wasmReady && runner;
  const current = () => byId[store.get().lessonId] || null;

  function readFree() {
    if (freeSaved) return freeSaved;
    try {
      const raw = storage && storage.getItem("mvpg.free");
      if (raw) return JSON.parse(raw);
    } catch (e) { /* storage may be blocked */ }
    return null;
  }

  function saveFree() {
    const s = store.get();
    if (s.mode !== "free") return;
    freeSaved = { script: s.script, knobs: s.knobs, shownCopies: s.shownCopies };
    try { if (storage) storage.setItem("mvpg.free", JSON.stringify(freeSaved)); } catch (e) { /* ignore */ }
  }

  async function stopAndWait() {
    if (runner) {
      runner.stop();
      await runner.whenIdle();
    }
  }

  async function openLesson(id) {
    const lesson = byId[id];
    if (!lesson) return;
    const token = ++openToken;
    await stopAndWait();
    if (token !== openToken) return;
    saveFree();
    const st = lesson.setup;
    const sweepSizes = st.sweep || [1000, 10000, 50000, 200000];
    store.set((s) => ({
      mode: "lesson", lessonId: id,
      lessonProgress: { ...s.lessonProgress, [id]: s.lessonProgress[id] === "done" ? "done" : "seen" },
      knobs: { ...defaultKnobs(), ...st.knobs },
      locked: { ...st.locked },
      shownCopies: [...st.shownCopies],
      script: st.prepare ? st.prepare.script : st.script,
      checks: pendingChecks(lesson), attempts: 0, actionPasses: 0, clockNote: false, allDone: false,
      cues: ((lesson.cues && lesson.cues.before) || []).map((c) => ({ ...c })),
      focus: lesson.focus.before, focusStamp: s.focusStamp + 1,
      sweep: [], sweepSizes,
      view: { ...s.view, chart: st.panels.includes("sweep") ? "sweep" : "timeline", chartLabel: -1, openPanels: panelState(st.panels) },
      error: null, budget: null, stale: false,
    }));
    if (ui.onNavigate) ui.onNavigate(id);
    if (wasmReady()) {
      runner.reset({ clearSweep: true });
      if (st.prepare) {
        preparing = true;
        try {
          await runner.run({ passes: st.prepare.passes, script: st.prepare.script, message: st.prepare.message, silent: true });
        } finally {
          preparing = false;
        }
        if (token !== openToken) return;
        store.set({ script: st.script, actionPasses: 0 });
      }
    }
    if (ui.focusHeading) ui.focusHeading();
  }

  async function openFree() {
    const token = ++openToken;
    await stopAndWait();
    if (token !== openToken) return;
    const saved = readFree();
    store.set((s) => ({
      mode: "free", lessonId: null,
      knobs: { ...defaultKnobs(), ...(saved && saved.knobs ? saved.knobs : {}), seed: saved && saved.knobs && saved.knobs.seed ? saved.knobs.seed : 1 + Math.floor(Math.random() * 1e6) },
      locked: unlockedAll(),
      shownCopies: saved && saved.shownCopies ? saved.shownCopies : [true, true, true, true, true, true],
      script: saved && typeof saved.script === "string" ? saved.script : defaultScript,
      checks: [], attempts: 0, actionPasses: 0, clockNote: false, allDone: false,
      cues: [], focus: null, focusStamp: s.focusStamp + 1,
      sweep: [], sweepSizes: [1000, 10000, 50000, 200000],
      view: { ...s.view, chart: "timeline", chartLabel: -1, openPanels: { chart: true, results: true, inspector: true, plans: true, memory: true } },
      error: null, budget: null, stale: false,
    }));
    if (ui.onNavigate) ui.onNavigate("free");
    if (wasmReady()) runner.reset({ clearSweep: true });
    if (ui.focusHeading) ui.focusHeading();
  }

  // Share links open free play with the script and knobs they carry.
  async function openShared(shared) {
    await openFree();
    const k = shared.knobs || {};
    store.set((s) => ({
      script: typeof shared.script === "string" ? shared.script : s.script,
      knobs: { ...s.knobs, ...pickKnobs(k) },
      shownCopies: Array.isArray(k.shownCopies) && k.shownCopies.length === 6 ? k.shownCopies.map(Boolean) : s.shownCopies,
      stale: true,
    }));
    if (wasmReady()) runner.reset({ clearSweep: true });
  }

  function order() {
    const s = store.get();
    return s.mode === "free" ? lessons.length : lessons.findIndex((l) => l.id === s.lessonId);
  }

  function next() {
    const s = store.get();
    const i = order();
    if (s.mode === "lesson") store.set((x) => ({ lessonProgress: { ...x.lessonProgress, [x.lessonId]: "done" } }));
    if (i + 1 >= lessons.length) return openFree();
    return openLesson(lessons[i + 1].id);
  }

  function back() {
    const i = order();
    if (i <= 0) return Promise.resolve();
    return openLesson(lessons[i - 1].id);
  }

  // ---- run actions ----------------------------------------------------------

  async function primary({ confirmed = false } = {}) {
    const s = store.get();
    if (!wasmReady() || s.run.status !== "idle") return;
    const lesson = current();
    const kind = lesson ? lesson.action.kind : "run";
    if (kind === "sweep") return sweep();
    if (kind === "apply-and-run") {
      if (lesson.action.requires && !lesson.action.requires(s)) return;
      runner.reset();
      store.set({ actionPasses: 0 });
    } else if (!confirmed) {
      const est = runner.estimateSeconds();
      if (est !== null && est > BUDGET_SECONDS) {
        store.set({ budget: { seconds: est } });
        return;
      }
    }
    store.set((x) => ({ budget: null, view: { ...x.view, chart: "timeline" } }));
    await runner.run({ passes: s.knobs.repeat });
  }

  async function sweep() {
    const s = store.get();
    if (!wasmReady() || s.run.status !== "idle") return;
    const lesson = current();
    const sizes = lesson && lesson.setup.sweep ? lesson.setup.sweep : s.sweepSizes;
    store.set((x) => ({ actionPasses: 0, budget: null, view: { ...x.view, chart: "sweep" } }));
    await runner.sweep({ sizes });
  }

  function resetTable() {
    const s = store.get();
    if (s.run.status !== "idle") return;
    if (s.mode === "lesson") return openLesson(s.lessonId);
    if (wasmReady()) runner.reset({ clearSweep: true });
    store.set({ actionPasses: 0 });
  }

  function stop() {
    if (runner) runner.stop();
  }

  // ---- hooks ----------------------------------------------------------------

  function onPassDone() {
    if (preparing) return;
    store.set((s) => ({ actionPasses: s.actionPasses + 1 }));
    const lesson = current();
    if (!lesson) return;
    store.set((s) => ({ checks: evaluateChecks(lesson, s, s.checks, false) }));
  }

  function onRunEnd(info) {
    if (preparing) return;
    const lesson = current();
    if (!lesson) return;
    store.set((s) => {
      const counted = !info.stopped && info.passes > 0;
      const attempts = s.attempts + (counted ? 1 : 0);
      const checks = evaluateChecks(lesson, s, s.checks, true);
      const allPass = checks.every((c) => c.status === "pass");
      const timedUnmet = checks.some((c) => c.timed && c.status !== "pass");
      const cues = [
        ...((lesson.cues && lesson.cues.before) || []).filter((c) => !c.once),
        ...(lesson.cues && lesson.cues.afterRun ? lesson.cues.afterRun(s) : []),
      ];
      const after = lesson.focus.after;
      const focus = typeof after === "function" ? after(s) : after || s.focus;
      return {
        attempts, checks, cues, focus, focusStamp: s.focusStamp + 1,
        clockNote: attempts >= 3 && timedUnmet,
        allDone: allPass,
        lessonProgress: allPass ? { ...s.lessonProgress, [lesson.id]: "done" } : s.lessonProgress,
      };
    });
  }

  if (runner) {
    runner.hooks.passDone = onPassDone;
    runner.hooks.runEnd = onRunEnd;
  }

  // Exact checks that depend on knobs only (the kind grid) pass as the reader ticks boxes.
  store.subscribe(["knobs"], (s) => {
    const lesson = current();
    if (!lesson || s.mode !== "lesson") return;
    let changed = false;
    const checks = s.checks.map((c, i) => {
      const def = lesson.checks[i];
      if (!def || !def.eager || c.status === "pass") return c;
      const r = def.test(s, helpers);
      if (!r.pass) return c;
      changed = true;
      return { ...c, status: "pass", measured: r.measured, fallback: "" };
    });
    if (changed) store.set({ checks });
  });

  return { openLesson, openFree, openShared, next, back, primary, sweep, resetTable, stop, onPassDone, onRunEnd, saveFree };
}

export function pickKnobs(k) {
  const out = {};
  for (const key of ["rows", "seed", "eagerness", "maxIndexKb", "rent", "repeat"]) if (typeof k[key] === "number" && isFinite(k[key])) out[key] = k[key];
  if (Array.isArray(k.yoursMask) && k.yoursMask.length === 3) out.yoursMask = k.yoursMask.map((x) => x | 0);
  return out;
}
