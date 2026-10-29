// The syntax card (spec 4.3) in a drawer that opens from the "Syntax" chip. Words that the current
// step has not introduced yet are dimmed, not hidden.
import { highlight } from "../editor/highlight.js";
import { FIRST_USE } from "./steps.js";
import { h, ic, rich } from "./ui.js";

// [group, [word key or null, chip text, description, chip kind]]
const GROUPS = [
  ["Fields", "fields", [
    ["customer", "customer", "0 to rows/20 − 1, about 20 orders each", "field"],
    ["amount", "amount", "0 to 99 999", "field"],
    ["day", "day", "0 to 364", "field"],
  ]],
  ["Conditions", "predicates", [
    ["eq", ".eq(v)", "equal", "pred"],
    ["ge", ".ge(v)", "at least", "pred"],
    ["gt", ".gt(v)", "more than", "pred"],
    ["le", ".le(v)", "at most", "pred"],
    ["lt", ".lt(v)", "less than", "pred"],
    ["between", ".between(a, b)", "a to b, both included", "pred"],
  ], "Two conditions must be on different fields."],
  ["Shape", "query", [
    ["orderBy", ".orderBy(field)", "smallest first", "query"],
    ["orderBy", ".orderBy(field, true)", "largest first", "query"],
    ["limit", ".limit(n)", "at most n rows", "query"],
  ]],
  ["Answers", "terminals", [
    ["count", ".count()", "how many", "term"],
    ["exists", ".exists()", "yes or no", "term"],
    ["first", ".first()", "one row", "term"],
    ["sumAmount", ".sumAmount()", "the sum of amount", "term"],
  ]],
  ["Writes", "writes", [
    ["update", "update(row, amount)", "new amount for one row", "write"],
    ["churn", "churn(row, customer, amount, day)", "delete a row, insert a new one", "write"],
  ]],
  ["Helpers", "helpers", [
    ["rnd", "rnd(n)", "random 0 to n − 1", "help"],
    ["zipf", "zipf(n, skew)", "random, small numbers more often", "help"],
    ["rows", "rows", "the table size", "help"],
    ["label", "label(name)", "names the next lines in the log", "help"],
  ]],
  ["JavaScript", "javascript", [
    [null, "for", "", "kw"], [null, "if", "", "kw"], [null, "else", "", "kw"], [null, "let", "", "kw"], [null, "const", "", "kw"], [null, "arithmetic", "", "kw"],
  ], "Every query must end with an answer word, or it records nothing."],
];

export function buildSyntaxCard(stepId) {
  const card = h("section", { class: "mv-syntax-card", "aria-labelledby": "pg-syntax-title" });
  card.append(h("header", { class: "mv-syntax-card__header" },
    h("div", { class: "mv-syntax-card__overline", text: "Reference" }),
    h("h3", { class: "mv-syntax-card__title", id: "pg-syntax-title", text: "A query" })));
  card.append(h("p", { class: "pg-syntax-line" }, rich("`where(condition, condition?)` or `all()` · then `.orderBy(field, largestFirst?)` · then `.limit(n)` · then one answer.")));
  const grammar = h("div", { class: "mv-syntax-card__grammar" });
  grammar.innerHTML = highlight("where(customer.eq(42)).orderBy(amount).limit(5).sumAmount();");
  card.append(h("p", { class: "pg-syntax-line", text: "Example:" }), grammar);
  const groups = h("div", { class: "mv-syntax-card__groups" });
  for (const [label, key, items, note] of GROUPS) {
    const chips = h("div", { class: "mv-syntax-card__chips" });
    for (const [word, text, desc, kind] of items) {
      const intro = word ? FIRST_USE[word] : 0;
      const dim = intro && stepId < intro;
      const chip = h("span", { class: `mv-chip mv-chip--code mv-chip--tk-${kind === "term" ? "term" : kind}${dim ? " pg-dim" : ""}`, title: dim ? `Introduced in step ${intro}` : null }, h("span", { class: "mv-chip__label", text }));
      chips.append(chip);
      if (desc) chips.append(h("span", { class: `pg-syntax-desc${dim ? " pg-dim" : ""}`, text: desc }));
    }
    if (note) chips.append(h("p", { class: "pg-syntax-note", text: note }));
    groups.append(h("div", { class: `mv-syntax-card__group mv-syntax-card__group--${key}` }, h("div", { class: "mv-syntax-card__group-label", text: label }), chips));
  }
  card.append(groups);
  return card;
}

// trigger: the Syntax chip button. getStep: () => current step id.
export function createSyntaxDrawer({ trigger, getStep }) {
  const panel = h("aside", { class: "pg-drawer", id: "pg-syntax-drawer", role: "dialog", "aria-label": "Syntax", "aria-modal": "false", hidden: true });
  const close = h("button", { class: "mv-button mv-button--ghost mv-button--icon pg-drawer__close", type: "button", "aria-label": "Close the syntax card" }, ic("cross", 18));
  const body = h("div", { class: "pg-drawer__body" });
  panel.append(close, body);
  document.body.append(panel);
  trigger.setAttribute("aria-controls", panel.id);
  trigger.setAttribute("aria-expanded", "false");

  const open = () => {
    body.textContent = "";
    body.append(buildSyntaxCard(getStep()));
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    close.focus();
  };
  const shut = (returnFocus = true) => {
    if (panel.hidden) return;
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (returnFocus) trigger.focus();
  };
  trigger.addEventListener("click", () => (panel.hidden ? open() : shut()));
  close.addEventListener("click", () => shut());
  panel.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); shut(); } });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) shut(); });
  return { open, close: shut, refresh() { if (!panel.hidden) { body.textContent = ""; body.append(buildSyntaxCard(getStep())); } } };
}
