// The plan of a query in words (spec table 5.5). Pure.
// Input: the text of pg_explain, e.g. "probe grouped index on customer (equality), filter 1 predicate".

import { int } from "./format.js";

const RE_SCAN = /^scan (\d+) elements/;
const RE_PROBE = /^probe (\S+) index on (\w+) \((equality|range)\)/;
const RE_WALK = /^walk (\S+) index on (\w+) (ascending|descending)/;
const RE_FILTER = /, filter (\d+) predicates?/;
const RE_SORT = /, sort by (\w+) (ascending|descending)/;
const RE_LIMIT = /, limit (\d+)/;

// Returns { kind: "scan" | "probe" | "range" | "walk" | "raw", words, indexed }.
//   options.matches: the number of rows a single scan kept (null when unknown)
//   options.loop: true when the line ran many queries ("for every query")
export function planWords(text, { matches = null, loop = false } = {}) {
  const t = String(text || "").trim();
  const filter = RE_FILTER.exec(t);
  const preds = filter ? Number(filter[1]) : 0;
  const sort = RE_SORT.exec(t);
  const limit = RE_LIMIT.exec(t);
  const sorted = sort ? `, then sorted them by ${sort[1]}, ${sort[2] === "descending" ? "largest" : "smallest"} first` : "";

  let m = RE_SCAN.exec(t);
  if (m) {
    let words = `scan: read all ${int(Number(m[1]))} rows`;
    if (loop) words += " for every query";
    else if (preds >= 2) words += " and checked both conditions on each";
    else if (preds === 1) words += matches === null ? " and kept the ones that match" : ` and kept the ${int(matches)} that match`;
    return { kind: "scan", words: words + sorted, indexed: false };
  }
  m = RE_PROBE.exec(t);
  if (m) {
    const [, kind, field, how] = m;
    let words = how === "equality"
      ? `look up the ${field} in the ${kind} index and read its rows`
      : `find the start of the range in the ${kind} index, read to its end`;
    if (preds >= 2) words += ", then check the other condition on each";
    return { kind: how === "equality" ? "probe" : "range", words: words + sorted, indexed: true };
  }
  m = RE_WALK.exec(t);
  if (m) {
    const [, kind, field, dir] = m;
    const stop = limit ? `, stop after ${int(Number(limit[1]))}` : "";
    const from = dir === "descending" ? "largest value down" : "smallest value up";
    return { kind: "walk", words: `walk the ${kind} index on ${field} from the ${from}${stop}`, indexed: true };
  }
  return { kind: "raw", words: t, indexed: false };
}

// The plan line for the log: "scan: ..." when the plan never left the scan, else "now: ...".
export function planLine(startText, nowText, opts) {
  const now = planWords(nowText, opts);
  if (now.kind === "raw") return { text: now.words, raw: true, kind: "raw" };
  const start = planWords(startText, opts);
  const never = start.kind === "scan" && now.kind === "scan";
  return { text: never || now.kind === "scan" ? now.words : "now: " + now.words, raw: false, kind: now.kind };
}
