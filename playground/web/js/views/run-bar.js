// The run bar: Run or the lesson action, Stop, Sweep, Reset, repeat, status line, time budget confirm.
import { h } from "../dom.js";
import { fmtNs, fmtSeconds, renderInline } from "../format.js";
import { passAggregate, lastPassNumber } from "../aggregate.js";
import { LESSON_BY_ID } from "../lessons/lessons.js";

export function clockText(env) {
  const us = env.timerResMs * 1000;
  const v = us < 1 ? us.toFixed(2) : us.toFixed(0);
  return `clock ${v} µs${us > 20 ? ", coarse" : ""}`;
}

export function mountRunBar({ store, engine, root }) {
  const primary = h("button", { type: "button", class: "btn primary", id: "run-btn", onclick: () => engine.primary() }, "Run");
  const stop = h("button", { type: "button", class: "btn", id: "stop-btn", onclick: () => engine.stop() }, "Stop");
  const sweep = h("button", { type: "button", class: "btn", id: "sweep-btn", onclick: () => engine.sweep() }, "Sweep");
  const reset = h("button", { type: "button", class: "btn", id: "reset-btn", onclick: () => engine.resetTable() }, "Reset");
  const repeat = h("input", { type: "number", id: "repeat", min: "1", max: "50", step: "1", "aria-label": "Repeat count", inputmode: "numeric",
    onchange: (e) => {
      const v = Math.max(1, Math.min(50, Math.round(+e.target.value) || 1));
      e.target.value = String(v);
      store.set((s) => ({ knobs: { ...s.knobs, repeat: v } }));
    } });
  const repeatLabel = h("label", { class: "inline-field", for: "repeat" }, "Repeat", repeat);
  const line = h("p", { class: "run-line" });
  const note = h("p", { class: "run-note" });
  const clockNote = h("p", { class: "run-note warn-note", hidden: true });
  const errorBox = h("p", { class: "run-error", role: "alert", hidden: true });
  const budgetText = h("span");
  const budget = h("div", { class: "budget", role: "group", "aria-label": "Time budget", hidden: true },
    budgetText,
    h("span", { class: "budget-btns" },
      h("button", { type: "button", class: "btn primary small", onclick: () => engine.primary({ confirmed: true }) }, "Run"),
      h("button", { type: "button", class: "btn small", onclick: () => store.set({ budget: null }) }, "Cancel")));
  const live = h("div", { class: "visually-hidden", id: "run-status", role: "status", "aria-live": "polite" });
  root.append(h("div", { class: "run-buttons" }, primary, stop, sweep, reset, repeatLabel), line, note, clockNote, errorBox, budget, live);

  let timer = 0;
  let elapsedMs = 0;
  let prevStatus = "idle";
  let prevDone = 0;

  function elapsedText(s) {
    if (s.run.status !== "idle") elapsedMs = performance.now() - s.run.startedAt;
    return elapsedMs > 0 ? `${(elapsedMs / 1000).toFixed(1)} s` : "";
  }

  function renderLine(s) {
    const parts = [];
    if (s.run.status !== "idle") {
      const word = s.run.kind === "sweep" ? "size" : "pass";
      parts.push(`${word} ${Math.min(s.run.pass || 1, s.run.passes)}/${s.run.passes}`);
    } else if (s.samples.length) parts.push(`last run: ${s.run.kind === "sweep" ? "sweep" : `${lastPassNumber(s.samples)} pass${lastPassNumber(s.samples) === 1 ? "" : "es"} in total`}`);
    else parts.push("ready");
    const el = elapsedText(s);
    if (el) parts.push(el);
    parts.push(clockText(s.env));
    line.textContent = parts.join(" · ");
  }

  function sync(s) {
    const lesson = s.mode === "lesson" ? LESSON_BY_ID[s.lessonId] : null;
    const busy = s.run.status !== "idle";
    const kind = lesson ? lesson.action.kind : "run";
    primary.textContent = lesson ? lesson.action.label : "Run";
    const blocked = kind === "apply-and-run" && lesson.action.requires && !lesson.action.requires(s);
    primary.disabled = busy || !s.wasmReady || blocked;
    primary.title = blocked && lesson.action.hint ? lesson.action.hint : "";
    stop.disabled = !busy || s.run.status === "stopping";
    sweep.hidden = s.mode !== "free";
    sweep.disabled = busy || !s.wasmReady;
    reset.disabled = busy || !s.wasmReady;
    repeat.value = String(s.knobs.repeat);
    repeat.disabled = busy || s.locked.repeat;
    repeatLabel.classList.toggle("locked", s.locked.repeat);
    repeat.title = s.locked.repeat ? "Locked in this lesson" : "";

    renderLine(s);
    const notes = [];
    if (s.run.message && busy) notes.push(s.run.message);
    else if (blocked && lesson.action.hint) notes.push(lesson.action.hint);
    if (s.stale && !busy) notes.push("Reset to apply: the next run resets the table first.");
    note.textContent = notes.join(" ");
    note.hidden = !notes.length;

    const coarse = s.env.timerResMs * 1000 > 20;
    clockNote.hidden = !coarse;
    if (coarse) renderInline(clockNote, "The clock is coarse. Timed checks can fail on a coarse clock; the exact checks still hold. Run `make serve` for a finer clock (see the README).");

    errorBox.hidden = !s.error;
    errorBox.textContent = s.error ? `Script error: ${s.error}` : "";

    budget.hidden = !s.budget;
    if (s.budget) budgetText.textContent = `This run will take about ${fmtSeconds(s.budget.seconds)} s, mostly in the scan-only copy. Run anyway?`;

    // Live announcements: one per finished pass, one at the end.
    if (s.run.done !== prevDone && s.run.done > 0 && busy && !s.run.quiet) {
      live.textContent = `${s.run.kind === "sweep" ? "Size" : "Pass"} ${s.run.done} of ${s.run.passes} done`;
    }
    prevDone = s.run.done;
    if (prevStatus !== "idle" && !busy && s.samples.length && !s.run.quiet) {
      if (s.run.kind === "sweep") live.textContent = "Sweep finished";
      else {
        const agg = passAggregate(s.samples, lastPassNumber(s.samples), s.env.timerResMs);
        if (agg) live.textContent = `Run finished: adaptive ${fmtNs(agg.copies[0].ns)}, scan ${fmtNs(agg.copies[1].ns)}`;
      }
    }
    prevStatus = s.run.status;

    if (busy && !timer) timer = setInterval(() => renderLine(store.get()), 250);
    if (!busy && timer) { clearInterval(timer); timer = 0; renderLine(s); }
  }

  store.subscribe(["run", "mode", "lessonId", "knobs", "locked", "stale", "budget", "error", "wasmReady", "env", "samples", "checks"], sync);
  sync(store.get());
}
