// The lesson card: title, goal, copy, checks with status, clock note, Back and Next.
import { h, clear } from "../dom.js";
import { renderInline } from "../format.js";
import { LESSONS, LESSON_BY_ID, END_TEXT, CLOCK_LINE } from "../lessons/lessons.js";

const ICON = { pending: "○", pass: "✓", fail: "✗" };
const WORD = { pending: "not checked yet", pass: "passed", fail: "not met" };

function copyNodes(paragraphs) {
  const out = [];
  let ul = null;
  for (const p of paragraphs) {
    if (p.startsWith("- ")) {
      if (!ul) { ul = h("ul", { class: "lesson-list" }); out.push(ul); }
      ul.append(renderInline(h("li"), p.slice(2)));
    } else {
      ul = null;
      out.push(renderInline(h("p"), p));
    }
  }
  return out;
}

export function mountLessonCard({ store, engine, root }) {
  const head = h("div", { class: "lesson-head" });
  const goal = h("p", { class: "lesson-goal" });
  const copy = h("div", { class: "lesson-copy" });
  const loadError = h("p", { class: "load-error", role: "alert", hidden: true });
  const checksBox = h("div", { class: "lesson-checks" });
  const clockNote = h("p", { class: "clock-note", hidden: true }, CLOCK_LINE);
  const endBox = h("div", { class: "end-panel", hidden: true });
  const nav = h("div", { class: "lesson-nav" });
  const status = h("div", { class: "visually-hidden", id: "check-status", role: "status", "aria-live": "polite" });
  root.append(head, goal, copy, loadError, checksBox, clockNote, endBox, nav, status);

  let shownKey = null;
  const lastStatus = new Map();

  function renderStatic(s) {
    clear(head);
    clear(copy);
    if (s.mode === "free") {
      head.append(h("p", { class: "eyebrow" }, "No lesson open"), h("h2", { id: "lesson-heading", tabindex: "-1" }, "Free play"));
      goal.textContent = "Run your own workload and watch every copy.";
      copy.append(
        h("p", null, "Free play unlocks every knob, all six copies and the editor. Start from an example or write your own workload."),
        renderInline(h("p"), "Press **Run** to run the script for the repeat count. Press **Sweep** to run it once at four table sizes. Changing rows, eagerness, the memory limit, rent, the seed or the kind grid marks the table stale: the next Run resets it first."),
        renderInline(h("p"), "**Share** copies a link that restores your script and knobs."));
      return;
    }
    const lesson = LESSON_BY_ID[s.lessonId];
    if (!lesson) return;
    const i = LESSONS.indexOf(lesson);
    head.append(h("p", { class: "eyebrow" }, `Lesson ${i + 1} of ${LESSONS.length}`), h("h2", { id: "lesson-heading", tabindex: "-1" }, lesson.title));
    renderInline(goal, `**Goal:** ${lesson.goal}`);
    copy.append(...copyNodes(lesson.copy));
  }

  function announce(s) {
    const msgs = [];
    for (const c of s.checks) {
      const key = `${s.lessonId}/${c.id}`;
      const prev = lastStatus.get(key);
      if (prev !== undefined && prev !== c.status) {
        if (c.status === "pass") msgs.push(`Check passed: ${c.measured}`);
        else if (c.status === "fail") msgs.push(`Check not met: ${c.fallback || c.measured}`);
      }
      lastStatus.set(key, c.status);
    }
    if (msgs.length) status.textContent = msgs.join(". ");
  }

  function renderDynamic(s) {
    loadError.hidden = !s.wasmError;
    if (s.wasmError) renderInline(loadError, `Could not load multiview.wasm: ${s.wasmError}. Build it with \`make playground\` and serve this folder with \`make serve\`.`);

    clear(checksBox);
    if (s.mode === "lesson" && s.checks.length) {
      const busy = s.run.status !== "idle";
      const list = h("ul", { class: "checks" });
      for (const c of s.checks) {
        const li = h("li", { class: `check ${c.status}` },
          h("span", { class: "check-icon", "aria-hidden": "true" }, ICON[c.status]),
          h("span", { class: "check-body" },
            h("span", { class: "check-text" }, h("span", { class: "visually-hidden" }, `${WORD[c.status]}: `), c.text),
            c.status === "pass" ? h("span", { class: "check-measured" }, c.measured) : null,
            c.status === "pending" && c.measured ? h("span", { class: "check-measured dim" }, c.measured) : null,
            c.status === "fail" ? h("span", { class: "check-fallback" }, c.fallback || c.measured) : null,
            c.status === "fail" && c.timed ? h("button", { type: "button", class: "btn small", disabled: busy, onclick: () => engine.primary() }, "Run again") : null));
        list.append(li);
      }
      checksBox.append(h("h3", { class: "sub-title" }, "Checks"), list);
      if (s.allDone) checksBox.append(h("p", { class: "all-done" }, "All checks passed."));
    }
    clockNote.hidden = !(s.mode === "lesson" && s.clockNote);

    const showEnd = s.mode === "lesson" && s.lessonId === "L7" && (s.attempts >= 1 || s.lessonProgress.L7 === "done");
    endBox.hidden = !showEnd;
    if (showEnd && !endBox.firstChild) endBox.append(h("p", null, END_TEXT), h("button", { type: "button", class: "btn primary", onclick: () => engine.openFree() }, "Open free play"));
    if (!showEnd) clear(endBox);

    clear(nav);
    if (s.mode === "lesson") {
      const i = LESSONS.findIndex((l) => l.id === s.lessonId);
      nav.append(
        h("button", { type: "button", class: "btn", disabled: i <= 0, onclick: () => engine.back() }, "‹ Back"),
        h("button", { type: "button", class: `btn ${s.allDone ? "primary" : ""}`, onclick: () => engine.next() }, i === LESSONS.length - 1 ? "Free play ›" : "Next ›"));
    } else {
      nav.append(h("button", { type: "button", class: "btn", onclick: () => engine.openLesson("L7") }, "‹ Back to lesson 7"));
    }
    announce(s);
  }

  let lastBusy = null;
  function sync(s, changed) {
    const busy = s.run.status !== "idle";
    if (changed && changed.size === 1 && changed.has("run") && busy === lastBusy) return;
    lastBusy = busy;
    const key = `${s.mode}/${s.lessonId}`;
    if (key !== shownKey) {
      shownKey = key;
      lastStatus.clear();
      renderStatic(s);
    }
    renderDynamic(s);
  }

  store.subscribe(["mode", "lessonId", "checks", "attempts", "clockNote", "allDone", "wasmError", "run", "lessonProgress"], sync);
  sync(store.get());
}
