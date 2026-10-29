// Hosts package A's editor, loaded with dynamic import() so the page works without it
// (then a plain textarea and a small local compiler take over). Also owns the example select.
import { h, clear } from "../dom.js";
import * as fallback from "../fallback-compile.js";
import { FALLBACK_EXAMPLES } from "../lessons/scripts.js";

// Load every module of the editor kit independently; anything missing gets a stand-in.
export async function loadEditorKit() {
  const kit = {
    createEditor: null,
    compile: fallback.compile,
    queryText: fallback.queryText,
    cppText: fallback.cppText,
    highlight: (code) => fallback.escapeHtml(code),
    EXAMPLES: FALLBACK_EXAMPLES,
    encodeShare: null,
    decodeShare: null,
    missing: [],
  };
  const attempt = async (name, load, apply) => {
    try {
      apply(await load());
    } catch (e) {
      kit.missing.push(name);
    }
  };
  await Promise.all([
    attempt("editor.js", () => import("../editor/editor.js"), (m) => { if (typeof m.createEditor === "function") kit.createEditor = m.createEditor; else throw new Error("no createEditor"); }),
    attempt("compile.js", () => import("../editor/compile.js"), (m) => {
      if (typeof m.compile !== "function") throw new Error("no compile");
      kit.compile = m.compile;
      if (m.queryText) kit.queryText = m.queryText;
      if (m.cppText) kit.cppText = m.cppText;
    }),
    attempt("highlight.js", () => import("../editor/highlight.js"), (m) => { if (typeof m.highlight !== "function") throw new Error("no highlight"); kit.highlight = m.highlight; }),
    attempt("examples.js", () => import("../editor/examples.js"), (m) => { if (!Array.isArray(m.EXAMPLES) || !m.EXAMPLES.length) throw new Error("no examples"); kit.EXAMPLES = m.EXAMPLES; }),
    attempt("share.js", () => import("../editor/share.js"), (m) => { kit.encodeShare = m.encodeShare; kit.decodeShare = m.decodeShare; }),
  ]);
  return kit;
}

export function mountEditorPanel({ store, engine, root, kit }) {
  const select = h("select", { id: "example-select", "aria-label": "Example script",
    onchange: (e) => {
      const ex = kit.EXAMPLES.find((x) => x.id === e.target.value);
      if (ex) store.set({ script: ex.script, error: null });
    } });
  const badge = h("span", { class: "editor-badge", id: "editor-badge", hidden: true });
  const top = h("div", { class: "editor-top" }, h("label", { class: "inline-field" }, "Example", select), badge);
  const host = h("div", { id: "editor-host", class: "editor-host" });
  const status = h("p", { class: "plain-status", role: "status", hidden: true });
  const hint = h("p", { class: "caption", id: "editor-hint" }, "Ctrl+Enter or Cmd+Enter runs the script. Press Escape, then Tab, to leave the editor.");
  root.append(top, host, status, hint);

  const s0 = store.get();
  let api = null;
  let plain = null;
  let plainTimer = 0;

  function compilePlain() {
    const s = store.get();
    const r = kit.compile(s.script, s.knobs.rows);
    store.set({ compiled: r });
    status.hidden = r.ok;
    status.textContent = r.ok ? "" : `Error: ${r.error.message}`;
  }

  if (kit.createEditor) {
    try {
      api = kit.createEditor(host, { value: s0.script, readOnly: s0.locked.editor, rows: s0.knobs.rows });
      api.on("change", ({ value }) => { if (store.get().script !== value) store.set({ script: value }); });
      api.on("compiled", (r) => store.set({ compiled: r }));
      api.on("run", () => engine.primary());
      store.set({ editorKind: "full" });
    } catch (e) {
      api = null;
      clear(host);
      kit.missing.push(`createEditor threw: ${e && e.message}`);
    }
  }
  if (!api) {
    plain = h("textarea", { class: "plain-editor", spellcheck: "false", autocapitalize: "off", "aria-label": "Workload script", rows: "16",
      oninput: (e) => {
        store.set({ script: e.target.value });
        clearTimeout(plainTimer);
        plainTimer = setTimeout(compilePlain, 400);
      },
      onkeydown: (e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); engine.primary(); }
        else if (e.key === "Tab" && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          const t = e.target;
          const a = t.selectionStart;
          t.value = t.value.slice(0, a) + "  " + t.value.slice(t.selectionEnd);
          t.selectionStart = t.selectionEnd = a + 2;
          t.dispatchEvent(new Event("input"));
        }
      } });
    plain.value = s0.script;
    host.append(plain);
    badge.hidden = false;
    badge.textContent = "plain editor: the editor module did not load";
    store.set({ editorKind: "plain" });
    compilePlain();
  }

  // Example select: the options come from the kit; "Custom" shows when the script matches none.
  for (const ex of kit.EXAMPLES) select.append(h("option", { value: ex.id, title: ex.description || "" }, ex.title));
  const custom = h("option", { value: "" }, "Custom");
  select.prepend(custom);

  function sync(s) {
    const value = api ? api.getValue() : plain.value;
    if (value !== s.script) {
      if (api) api.setValue(s.script);
      else {
        plain.value = s.script;
        clearTimeout(plainTimer);
        plainTimer = setTimeout(compilePlain, 0);
      }
    }
    if (api) {
      api.setReadOnly(!!s.locked.editor);
      if (sync.rows !== s.knobs.rows) { sync.rows = s.knobs.rows; api.setRowCount(s.knobs.rows); }
    } else {
      plain.readOnly = !!s.locked.editor;
      if (sync.rows !== s.knobs.rows) { sync.rows = s.knobs.rows; plainTimer = setTimeout(compilePlain, 0); }
    }
    const match = kit.EXAMPLES.find((x) => x.script === s.script);
    select.value = match ? match.id : "";
    select.disabled = !!s.locked.editor;
    select.title = s.locked.editor ? "Locked in this lesson" : "";
    host.classList.toggle("locked", !!s.locked.editor);
  }
  sync.rows = s0.knobs.rows;
  store.subscribe(["script", "locked", "knobs"], sync);
  sync(store.get());

  return { focus: () => (api ? api.focus() : plain.focus()), api };
}
