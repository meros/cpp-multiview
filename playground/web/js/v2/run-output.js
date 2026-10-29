// The run log view (spec 5.1, design-system 6.4): renders the data of narrate() as DOM.
import { h, ic, rich } from "./ui.js";

const FOLD_AFTER = 3;
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
export const RUN_KEYS = isMac ? "⌘ ↵" : "Ctrl ↵";

const ICON_OF = {
  value: "chevron", timing: "clock", plan: "scan", insight: "info", warning: "warning", stat: "chevron", event: "clock",
};
const KW = { value: "value", timing: "timing", plan: "plan", event: "event", insight: "insight", stat: "stat", warning: "" };

// One line of the log. `n` is its number within the run.
function lineEl(l, n) {
  let mod = `mv-run-log__line--${l.type === "stat" ? "value" : l.type}`;
  let icon = ICON_OF[l.type] || "chevron";
  if (l.type === "plan" && (l.kind === "probe" || l.kind === "range" || l.kind === "walk")) { mod += " mv-run-log__line--index"; icon = "index"; }
  if (l.type === "event") {
    if (l.cls === "build") { mod += " mv-run-log__line--build"; icon = "index"; }
    else if (l.cls === "drop") { mod += " mv-run-log__line--drop"; icon = "cross"; }
    else if (l.cls === "trial") { mod += " mv-run-log__line--trial"; icon = "clock"; }
    else icon = /^(Quer|Query).*(lookups|walks)/.test(l.text) ? "index" : /scan/.test(l.text) ? "scan" : "clock";
  }
  const text = h("span", { class: "mv-run-log__text" });
  const kw = KW[l.type];
  if (kw) text.append(h("span", { class: "mv-run-log__kw", text: kw }));
  if (l.type === "event" && l.cls) {
    const m = /^(.*?: )?(built|dropped|Built)( .*)$/s.exec(l.text);
    if (m) { text.append(m[1] || "", h("span", { class: "mv-run-log__verb", text: m[2] }), m[3]); }
    else text.append(l.text);
  } else text.append(rich(l.text));
  if (l.plan) text.append(h("span", { class: "pg-plan-tail" }, "  ", h("span", { class: "mv-run-log__kw", text: "plan" }), l.plan));
  const el = h("div", { class: `mv-run-log__line ${mod}` },
    h("span", { class: "mv-run-log__num", text: String(n) }), ic(icon, 16, "mv-run-log__icon"), text);
  if (l.note) el.append(h("span", { class: "mv-run-log__note", text: l.note }));
  return el;
}

export function createLog(root, { onSelectLine, onClockTip } = {}) {
  const body = root.querySelector(".mv-run-log__body");
  const countEl = root.querySelector(".mv-run-log__count");
  const clearBtn = root.querySelector(".mv-run-log__clear");
  const live = h("div", { class: "pg-log-live" });
  const notice = h("div", { class: "pg-log-notice" });
  const list = h("div", { class: "pg-log-runs" });
  const older = h("details", { class: "mv-drawer pg-log-older", hidden: true },
    h("summary", { class: "mv-drawer__summary" }, ic("chevron", 16, "mv-drawer__chevron"), h("span", { class: "mv-drawer__title", text: "Earlier runs" }), h("span", { class: "mv-drawer__meta", text: "" })),
    h("div", { class: "mv-drawer__body" }));
  const olderBody = older.querySelector(".mv-drawer__body");
  const olderMeta = older.querySelector(".mv-drawer__meta");
  const empty = h("div", { class: "mv-run-log__empty" },
    h("span", { class: "mv-mascot mv-mascot--sleepy", "aria-hidden": "true" }),
    h("div", {}, h("div", { class: "mv-run-log__empty-title", text: "Nothing ran yet" }), h("p", { text: `Press Run (${RUN_KEYS}). Output appears here.` })));
  body.append(notice, live, list, older, empty);
  let runs = 0;
  let staleMsg = null;

  function updateCount() {
    countEl.textContent = `${runs} ${runs === 1 ? "run" : "runs"}`;
    empty.hidden = runs > 0 || !!notice.firstChild;
    clearBtn.hidden = runs === 0;
  }
  function fold() {
    const nodes = [...list.children];
    while (nodes.length > FOLD_AFTER) {
      const n = nodes.pop();
      olderBody.prepend(n);
    }
    const k = olderBody.children.length;
    older.hidden = k === 0;
    olderMeta.textContent = `${k} ${k === 1 ? "run" : "runs"}`;
  }
  function renderNotice() {
    notice.textContent = "";
    if (staleMsg) notice.append(h("div", { class: "mv-run-log__line mv-run-log__line--warning" }, h("span", { class: "mv-run-log__num" }), ic("warning", 16, "mv-run-log__icon"), h("span", { class: "mv-run-log__text pg-wrap", text: staleMsg })));
    updateCount();
  }

  clearBtn.addEventListener("click", () => { api.clear(); });

  const api = {
    // data: result of narrate(); n: run number
    addRun(data, n) {
      const run = h("div", { class: "mv-run-log__run mv-run-log__run--new" });
      const chip = h("button", { class: `mv-chip mv-chip--interactive pg-clock${data.head.clock.coarse ? " mv-chip--warning" : ""}`, type: "button", "aria-expanded": "false" },
        ic("clock", 14, "mv-chip__icon"), h("span", { class: "mv-chip__label", text: data.head.clock.text }));
      run.append(h("div", { class: "mv-run-log__run-head pg-run-head" }, h("span", { text: data.head.title }), chip));
      if (data.head.tip) {
        const tip = h("aside", { class: "mv-callout mv-callout--tip pg-clock-tip", role: "note", hidden: true }, ic("tip", 20, "mv-callout__icon"), h("h3", { class: "mv-callout__title", text: "Tip: a coarse clock" }), h("p", { class: "mv-callout__body" }, rich(data.head.tip)));
        run.append(tip);
        chip.addEventListener("click", () => { tip.hidden = !tip.hidden; chip.setAttribute("aria-expanded", String(!tip.hidden)); });
      } else chip.disabled = false;
      let k = 0;
      for (const l of data.pre) run.append(lineEl(l, ++k));
      for (const b of data.blocks) {
        const head = h("button", { class: "pg-block-head", type: "button", title: b.line ? `Select line ${b.line} in the editor` : null },
          b.label ? h("span", { class: "pg-block-label", text: b.label }) : null,
          h("span", { class: "pg-block-line", text: b.line ? `line ${b.line}` : "" }),
          h("span", { class: "pg-block-text", text: b.text }),
          b.count > 1 ? h("span", { class: "pg-block-count", text: `× ${b.count.toLocaleString("en-US").replace(/,/g, " ")}` }) : null);
        head.addEventListener("click", () => { if (b.line && onSelectLine) onSelectLine(b.line); });
        run.append(head);
        for (const l of b.lines) run.append(lineEl(l, ++k));
        if (b.hidden.length) {
          const more = h("button", { class: "mv-button mv-button--ghost pg-more", type: "button", text: `${b.hidden.length} more` });
          more.addEventListener("click", () => {
            const frag = document.createDocumentFragment();
            for (const l of b.hidden) frag.append(lineEl(l, ++k));
            more.replaceWith(frag);
          });
          run.append(more);
        }
      }
      for (const l of data.tail) run.append(lineEl(l, ++k));
      runs++;
      empty.hidden = true;
      list.prepend(run);
      fold();
      updateCount();
      body.scrollTop = 0;
      return run;
    },
    showError(text, line) {
      api.clearError();
      const el = h("aside", { class: "mv-callout mv-callout--warning pg-error", role: "alert" },
        ic("warning", 20, "mv-callout__icon"), h("h3", { class: "mv-callout__title", text: "Careful: the script did not run" }),
        h("p", { class: "mv-callout__body" }, rich(text)));
      if (line && onSelectLine) {
        const go = h("button", { class: "mv-button mv-button--ghost mv-callout__action", type: "button", text: `Show line ${line}` });
        go.addEventListener("click", () => onSelectLine(line));
        el.append(go);
      }
      notice.prepend(el);
      empty.hidden = true;
      body.scrollTop = 0;
    },
    clearError() { const e = notice.querySelector(".pg-error"); if (e) e.remove(); updateCount(); },
    // A note above the runs, for example "the table size changed: Run to see it". null clears it.
    setStale(msg) { staleMsg = msg; renderNotice(); },
    announce(text) { live.textContent = text; },
    clear() { list.textContent = ""; olderBody.textContent = ""; older.hidden = true; runs = 0; api.clearError(); staleMsg = null; renderNotice(); },
    get runs() { return runs; },
  };
  updateCount();
  return api;
}
