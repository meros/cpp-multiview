// Index inspector (spec 6.4): header counters, 3 x 6 cards updated in place, event log.
import { h, clear, prefersReducedMotion } from "../dom.js";
import { buildCards, fieldUsage, KIND_ORDER, FIELD_NAMES } from "./inspector-logic.js";
import { EVENT_GLYPH } from "../events.js";
import { EVENT_CLASS } from "./chart-kit.js";

const STATE_TEXT = { live: "live", trial: "trial", dropped: "dropped", never: "never built" };
const FLASH_COLOR = { live: "var(--good)", trial: "var(--event-trial)", dropped: "var(--muted)", never: "var(--muted)" };
const LOG_CAP = 200;

export function mountInspector({ store, root }) {
  const header = h("p", { class: "idx-header", id: "inspector-header" });
  const headerText = h("span");
  const trialsEl = h("span", { id: "inspector-trials", class: "idx-trials" });
  header.append(headerText, " · ", trialsEl);
  const grid = h("div", { class: "idx-grid" });
  const logTitle = h("h3", { class: "sub-title" }, "Events");
  const log = h("ul", { class: "event-log", id: "event-log", "aria-label": "Index events, newest first" });
  const announce = h("div", { class: "visually-hidden", id: "index-announce", role: "status", "aria-live": "polite" });
  root.append(header, grid, logTitle, log, announce);

  const cards = new Map();
  const prevState = new Map();
  let selected = null;

  for (const field of FIELD_NAMES) {
    const row = h("div", { class: "idx-row", id: `inspector-row-${field}`, role: "group", "aria-label": `${field} indexes` }, h("div", { class: "idx-field" }, field));
    for (const kind of KIND_ORDER) {
      const key = `${field}/${kind}`;
      const els = {
        name: h("span", { class: "idx-kind" }, kind),
        badge: h("span", { class: "badge" }),
        probe: h("span", { class: "v" }), uses: h("span", { class: "v" }), mem: h("span", { class: "v" }), build: h("span", { class: "v" }),
        balanceBar: h("span", { class: "balance", hidden: true }, h("i")),
        reason: h("span", { class: "reason" }),
      };
      const kv = (name, el) => h("span", { class: "kv" }, h("span", { class: "k" }, name), el);
      const card = h("button", { type: "button", class: "idx-card never", id: `inspector-card-${field}-${kind}`, dataset: { key }, onclick: () => selectCard(key) },
        h("span", { class: "idx-top" }, els.name, els.badge),
        kv("probe", els.probe), kv("uses", els.uses), kv("memory", els.mem), kv("build", els.build),
        els.balanceBar, els.reason);
      row.append(card);
      cards.set(key, { card, ...els });
    }
    grid.append(row);
  }

  function flash(el, state) {
    el.style.setProperty("--flash", FLASH_COLOR[state]);
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), prefersReducedMotion() ? 3000 : 700);
  }

  function selectCard(key) {
    selected = key;
    let first = null;
    for (const li of log.children) {
      const on = li.dataset.key === key;
      li.classList.toggle("hl", on);
      if (on && !first) first = li;
    }
    if (first) first.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  function renderCards(s) {
    const model = buildCards(s, fieldUsage(s.compiled));
    headerText.textContent = model.header.join(" · ");
    trialsEl.textContent = model.trials;
    const cue = s.cues.find((c) => c.target === "inspector-trials");
    trialsEl.replaceChildren(model.trials, ...(cue ? [h("span", { class: "cue-tag", role: "note" }, cue.text)] : []));
    for (const f of model.fields) {
      for (const c of f.cards) {
        const els = cards.get(c.key);
        els.card.className = `idx-card ${c.state}${els.card.classList.contains("flash") ? " flash" : ""}${selected === c.key ? " sel" : ""}`;
        els.badge.textContent = STATE_TEXT[c.state];
        els.badge.className = `badge st-${c.state}`;
        els.probe.textContent = c.probe;
        els.uses.textContent = c.uses;
        els.mem.textContent = c.memory;
        els.build.textContent = c.state === "never" ? "—" : c.build;
        els.reason.textContent = c.reason;
        if (c.balance && c.state !== "never") {
          els.balanceBar.hidden = false;
          const limit = Math.abs(c.balance.limit) || 1;
          const f2 = Math.max(-1, Math.min(1, c.balance.value / limit));
          const bar = els.balanceBar.firstChild;
          bar.style.left = f2 >= 0 ? "50%" : `${50 + f2 * 50}%`;
          bar.style.width = `${Math.abs(f2) * 50}%`;
          bar.style.background = f2 >= 0 ? "var(--good)" : "var(--event-drop)";
        } else els.balanceBar.hidden = true;
        els.card.setAttribute("aria-label", `${c.kind} on ${c.field}: ${STATE_TEXT[c.state]}. ${c.reason}`);
        const prev = prevState.get(c.key);
        if (prev !== undefined && prev !== c.state) flash(els.card, c.state);
        prevState.set(c.key, c.state);
      }
    }
  }

  // ---- event log: prepend the new entries, re-render in full after a reset ----
  let lastEvent = null;
  let announceQueue = 0;
  let announceTimer = 0;
  let announceLast = "";

  function entry(e) {
    const key = e.field ? `${e.field}/${e.kind}` : "";
    return h("li", { class: `ev ${EVENT_CLASS[e.type] || ""} fresh`, dataset: { key } },
      h("span", { class: "ev-pos" }, `[${e.pass}.${e.slice + 1}]`), " ", h("span", { class: "ev-glyph", "aria-hidden": "true" }, EVENT_GLYPH[e.type] || ""), " ", e.text);
  }

  function flushAnnounce() {
    announceTimer = 0;
    if (!announceQueue) return;
    announce.textContent = announceQueue === 1 ? announceLast : `${announceQueue} index changes`;
    announceQueue = 0;
    announceTimer = setTimeout(flushAnnounce, 1000);
  }

  function renderLog(s) {
    const ev = s.events;
    let fresh = [];
    if (!ev.length) { clear(log); lastEvent = null; return; }
    const at = lastEvent ? ev.lastIndexOf(lastEvent) : -1;
    if (lastEvent && at >= 0) fresh = ev.slice(at + 1);
    else { clear(log); fresh = ev.slice(-LOG_CAP); }
    for (const e of fresh) {
      log.prepend(entry(e));
      if (e.type === "build" || e.type === "drop" || e.type === "rent-drop") { announceQueue++; announceLast = e.text; }
    }
    while (log.children.length > LOG_CAP) log.lastChild.remove();
    lastEvent = ev[ev.length - 1];
    if (selected) selectCard(selected);
    if (announceQueue && !announceTimer) flushAnnounce();
  }

  store.subscribe(["indexes", "counters", "events", "compiled", "cues"], (s, changed) => {
    renderCards(s);
    if (changed.has("events")) renderLog(s);
  });
  renderCards(store.get());
}
