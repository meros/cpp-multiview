// The C++ equivalent (collapsed <details>): highlight + cppText from the editor kit, updated 400 ms after changes.
import { h } from "../dom.js";

const EMPTY = { ok: true, ops: [], labels: [], shapes: [], shapeText: [] };

export function mountCppPanel({ store, root, kit }) {
  const pre = h("pre", { class: "cpp-view", tabindex: "0", "aria-label": "C++ equivalent of the script" });
  const code = h("code");
  pre.append(code);
  const copyBtn = h("button", { type: "button", class: "btn small", onclick: copy }, "Copy");
  const copyStatus = h("span", { class: "visually-hidden", role: "status" });
  root.append(h("div", { class: "cpp-tools" }, copyBtn, copyStatus), pre);
  let text = "";
  let timer = 0;

  function render() {
    const s = store.get();
    try {
      text = kit.cppText(s.compiled && s.compiled.ok ? s.compiled : EMPTY, s.knobs.yoursMask);
      code.innerHTML = kit.highlight(text, "cpp");
    } catch (e) {
      code.textContent = text || "";
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      copyStatus.textContent = "C++ copied";
    } catch (e) {
      copyStatus.textContent = "Copy failed";
    }
  }

  store.subscribe(["compiled", "knobs"], () => { clearTimeout(timer); timer = setTimeout(render, 400); });
  render();
}
