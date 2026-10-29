// Boot: measure the clock, load the wasm module and the editor kit, create the store, runner and
// engine, mount every view, then open the lesson, free play or shared script the URL asks for.
import { createStore, initialState } from "./store.js";
import { loadWasm } from "./wasm.js";
import { createRunner } from "./runner.js";
import { timerResolution } from "./timer.js";
import { mountTheme } from "./theme.js";
import { createEngine } from "./lessons/engine.js";
import { mountShare, hasShareHash, decodeState } from "./share-state.js";
import { mountRail } from "./views/rail.js";
import { mountStepper } from "./views/stepper.js";
import { mountLessonCard } from "./views/lesson-card.js";
import { mountRunBar } from "./views/run-bar.js";
import { mountKnobs } from "./views/knobs.js";
import { loadEditorKit, mountEditorPanel } from "./views/editor-panel.js";
import { mountCppPanel } from "./views/cpp-panel.js";
import { mountChartPanel } from "./views/chart-panel.js";
import { mountResults } from "./views/results.js";
import { mountInspector } from "./views/inspector.js";
import { mountPlans } from "./views/plans.js";
import { mountMemory } from "./views/memory.js";
import { mountPanels, mountFocus } from "./views/panel.js";

const $ = (id) => document.getElementById(id);

async function boot() {
  const store = createStore(initialState());
  mountTheme({ store, button: $("theme-btn") });

  const resUs = timerResolution();
  store.set({ env: { timerResMs: resUs / 1000, isolated: !!window.crossOriginIsolated } });

  const [kit, wasmResult] = await Promise.all([
    loadEditorKit(),
    loadWasm().then((wasm) => ({ wasm }), (error) => ({ error })),
  ]);
  const wasm = wasmResult.wasm || null;
  store.set({ wasmReady: !!wasm, wasmError: wasmResult.error ? String(wasmResult.error.message || wasmResult.error) : null });

  const runner = wasm ? createRunner({ store, wasm, compile: (code, rows) => kit.compile(code, rows) }) : null;
  let userNav = false;
  const engine = createEngine({
    store, runner, storage: safeStorage(), defaultScript: kit.EXAMPLES[0].script,
    ui: {
      focusHeading: () => setTimeout(() => { const el = $("lesson-heading"); if (el) el.focus(); }, 0),
      onNavigate: (id) => {
        if (!userNav) return;
        const hash = id === "free" ? "#free" : `#lesson-${id.slice(1)}`;
        try { history.replaceState(null, "", hash); } catch (e) { /* ignore */ }
      },
    },
  });

  const ctx = { store, engine, runner, kit };
  mountRail({ ...ctx, root: $("rail") });
  mountStepper({ ...ctx, root: $("stepper") });
  mountLessonCard({ ...ctx, root: $("lesson-root") });
  mountRunBar({ ...ctx, root: $("run-root") });
  mountEditorPanel({ ...ctx, root: $("editor-root") });
  mountKnobs({ ...ctx, root: $("knobs-root") });
  mountCppPanel({ ...ctx, root: $("cpp-root") });
  mountChartPanel({ ...ctx, root: $("chart-root") });
  mountResults({ ...ctx, root: $("results-root") });
  mountInspector({ ...ctx, root: $("inspector-root") });
  mountPlans({ ...ctx, root: $("plans-root") });
  mountMemory({ ...ctx, root: $("memory-root") });
  mountPanels(ctx);
  mountFocus(ctx);
  mountShare({ store, kit, button: $("share-btn"), status: $("share-status") });
  mountHeader(store, engine);
  mountKeys(store, engine);
  mountAutosave(store, engine);
  globalThis.__mvpg = { store, engine, runner, kit };

  // What does the URL ask for?
  const hash = location.hash;
  if (hasShareHash(hash)) {
    const shared = await decodeState(kit, hash);
    if (shared) await engine.openShared(shared);
    else await engine.openLesson("L1");
  } else if (hash === "#free") await engine.openFree();
  else {
    const m = /^#lesson-([1-7])$/.exec(hash);
    await engine.openLesson(m ? `L${m[1]}` : "L1");
  }
  userNav = true;
  document.body.dataset.ready = "true";
}

function safeStorage() {
  try {
    const s = window.localStorage;
    s.getItem("mvpg.probe");
    return s;
  } catch (e) {
    return null;
  }
}

// Header: the Lessons or Free play switch.
function mountHeader(store, engine) {
  let lastLesson = "L1";
  const buttons = [...document.querySelectorAll("#mode-switch button")];
  for (const b of buttons) {
    b.addEventListener("click", () => {
      const s = store.get();
      if (b.dataset.mode === "free") { if (s.mode !== "free") engine.openFree(); }
      else if (s.mode !== "lesson") engine.openLesson(lastLesson);
    });
  }
  store.subscribe(["mode", "lessonId"], (s) => {
    if (s.lessonId) lastLesson = s.lessonId;
    for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.mode === s.mode));
  });
  for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.mode === store.get().mode));
}

// Alt+N and Alt+P move between lessons when focus is not in an editor; the skip link focuses the lesson.
function mountKeys(store, engine) {
  window.addEventListener("keydown", (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t && (t.closest && (t.closest(".ed") || t.closest(".plain-editor")) || t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.tagName === "SELECT")) return;
    const s = store.get();
    if (e.code === "KeyN" && s.mode === "lesson") { e.preventDefault(); engine.next(); }
    else if (e.code === "KeyP") { e.preventDefault(); engine.back(); }
  });
  $("skip-link").addEventListener("click", (e) => {
    e.preventDefault();
    const el = $("lesson-heading");
    if (el) el.focus();
  });
}

// The free-play state is saved 500 ms after the last change.
function mountAutosave(store, engine) {
  let timer = 0;
  store.subscribe(["script", "knobs", "shownCopies"], (s) => {
    if (s.mode !== "free") return;
    clearTimeout(timer);
    timer = setTimeout(() => engine.saveFree(), 500);
  });
}

boot().catch((e) => {
  const box = document.getElementById("lesson-root");
  if (box) {
    const p = document.createElement("p");
    p.className = "load-error";
    p.setAttribute("role", "alert");
    p.textContent = `The playground failed to start: ${e && e.message ? e.message : e}`;
    box.append(p);
  }
  console.error(e);
});
