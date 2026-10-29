// Inline SVG icons of the design system (docs/design-system.md section 8; stroke 2 = --stroke-hand, section 12.3).
// icon(name, { size, title }) returns an SVGElement. Colour comes from currentColor.

const SVG_NS = "http://www.w3.org/2000/svg";

// Inner markup of each icon, 24 x 24 grid. Only `play` is filled.
const PATHS = {
  play: '<path fill="currentColor" stroke="none" d="M7 4.8v14.4a1 1 0 0 0 1.5.86l11.6-7.2a1 1 0 0 0 0-1.72L8.5 3.94A1 1 0 0 0 7 4.8z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.34-5.66L4 9"/><path d="M4 4v5h5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  cross: '<path d="M6 6l12 12M18 6L6 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  tip: '<path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3z"/><path d="M9.5 18.5h5M10.5 21h3"/>',
  warning: '<path d="M10.3 4.2L2.6 17.5a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>',
  scan: '<path d="M4 6h10M4 12h10M4 18h10"/><path d="M19 4v14M16 15l3 3 3-3"/>',
  index: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/>',
  share: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
};

export const ICON_NAMES = Object.keys(PATHS);

const templates = new Map();

function template(name) {
  let t = templates.get(name);
  if (!t) {
    t = document.createElementNS(SVG_NS, "svg");
    t.innerHTML = PATHS[name];
    templates.set(name, t);
  }
  return t;
}

/**
 * @param {string} name one of ICON_NAMES
 * @param {{ size?: number, title?: string }} [opts]
 * @returns {SVGElement}
 */
export function icon(name, { size = 20, title } = {}) {
  if (!(name in PATHS)) throw new Error(`unknown icon "${name}"`);
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", `mv-icon mv-icon--${name}`);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("focusable", "false");
  if (title) {
    svg.setAttribute("role", "img");
    const t = document.createElementNS(SVG_NS, "title");
    t.textContent = title;
    svg.appendChild(t);
  } else {
    svg.setAttribute("aria-hidden", "true");
  }
  for (const child of template(name).children) svg.appendChild(child.cloneNode(true));
  return svg;
}
