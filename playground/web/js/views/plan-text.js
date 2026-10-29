// Turn a pg_explain string into words (spec 6.5). Pure.
import { fmtNs } from "../format.js";

export function parsePlan(text) {
  const parts = text.split(", ");
  const head = parts[0];
  const out = { kind: "unknown", filter: 0, sort: null, limit: 0, raw: text };
  let m;
  if ((m = /^scan (\d+) elements/.exec(head))) Object.assign(out, { kind: "scan", n: +m[1] });
  else if ((m = /^probe (\S+) index on (\w+) \((equality|range)\)/.exec(head))) Object.assign(out, { kind: "probe", index: m[1], field: m[2], mode: m[3] });
  else if ((m = /^walk (\S+) index on (\w+) (ascending|descending)/.exec(head))) Object.assign(out, { kind: "walk", index: m[1], field: m[2], dir: m[3] });
  for (const p of parts.slice(1)) {
    if ((m = /^filter (\d+) predicate/.exec(p))) out.filter = +m[1];
    else if ((m = /^sort by (\w+) (ascending|descending)/.exec(p))) out.sort = { field: m[1], dir: m[2] };
    else if ((m = /^limit (\d+)/.exec(p))) out.limit = +m[1];
  }
  return out;
}

export function planSentence(p) {
  let t = "";
  if (p.kind === "scan") t = `Reads all ${p.n} rows and tests each one. No index can answer this yet.`;
  else if (p.kind === "probe" && p.mode === "equality") t = `Looks up the matching rows in the ${p.index} index on ${p.field}, then reads only those.`;
  else if (p.kind === "probe") t = `Finds the first key in range in the ${p.index} index on ${p.field} and walks to the last.`;
  else if (p.kind === "walk") t = `Walks the ${p.index} index on ${p.field} in order and stops after the limit.`;
  else t = p.raw;
  if (p.filter) t += ` Each candidate is checked against ${p.filter} predicate${p.filter === 1 ? "" : "s"}.`;
  if (p.sort) t += ` The results are sorted by ${p.sort.field} afterwards, which costs more than an ordered walk.`;
  if (p.limit) t += ` Stops at ${p.limit} results.`;
  return t;
}

// ctx: { indexes, scanNs } where scanNs is the scan copy's ns for this shape (NaN if unknown).
export function planCost(p, ctx) {
  if (p.kind === "scan") return Number.isFinite(ctx.scanNs) && ctx.scanNs > 0 ? `Cost grows with the table: about ${fmtNs(ctx.scanNs)} per query now.` : "";
  if (p.kind === "probe" || p.kind === "walk") {
    const ix = (ctx.indexes || []).find((x) => x.field === p.field && x.kind === p.index && x.live && x.probe_ns > 0);
    if (!ix || !(ctx.scanNs > 0)) return "";
    return `Measured ${fmtNs(ix.probe_ns)} per probe, against ${fmtNs(ctx.scanNs)} for a scan: ${(ctx.scanNs / ix.probe_ns).toFixed(1)}× cheaper.`;
  }
  return "";
}
