// Theme toggle: auto, light, dark. The choice is kept in localStorage (inside try/catch).

const ORDER = ["auto", "light", "dark"];

export function applyTheme(theme) {
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export function mountTheme({ store, button }) {
  let saved = "auto";
  try {
    const v = localStorage.getItem("mvpg.theme");
    if (ORDER.includes(v)) saved = v;
  } catch (e) { /* storage may be blocked */ }
  applyTheme(saved);
  store.set({ theme: saved });

  button.addEventListener("click", () => {
    const next = ORDER[(ORDER.indexOf(store.get().theme) + 1) % ORDER.length];
    applyTheme(next);
    try { localStorage.setItem("mvpg.theme", next); } catch (e) { /* ignore */ }
    store.set({ theme: next });
  });
  store.subscribe(["theme"], (s) => {
    button.textContent = `Theme: ${s.theme}`;
    button.setAttribute("aria-label", `Theme: ${s.theme}. Press to change.`);
  });
  button.textContent = `Theme: ${saved}`;
  // The system theme can change while the page is open and the choice is auto.
  if (typeof matchMedia === "function") {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const redraw = () => store.set((s) => ({ theme: s.theme }));
    if (mq.addEventListener) mq.addEventListener("change", redraw);
  }
}
