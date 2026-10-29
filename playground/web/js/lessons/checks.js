// Check helpers (the `h` argument of Check.test). Pure: they read the state only.
import { labelValue, passNsPerOp, lastPassNumber } from "../aggregate.js";

export const FIELDS = ["customer", "amount", "day"];

export const helpers = {
  // Median of the non-noisy slice values of one label and copy in one pass (pass total if all are noisy).
  labelNs: (s, copy, label, pass) => labelValue(s.samples, copy, label, pass, s.env.timerResMs).ns,
  labelInfo: (s, copy, label, pass) => labelValue(s.samples, copy, label, pass, s.env.timerResMs),
  passNs: (s, copy, pass) => passNsPerOp(s.samples, copy, pass),
  bytes: (s, copy) => (s.samples.length ? s.samples[s.samples.length - 1].copies[copy].bytes : 0),
  live: (s, field) => (s.indexes || []).filter((x) => x.field === field && x.live).map((x) => x.kind),
  everLive: (s, field) => {
    const set = new Set((s.indexes || []).filter((x) => x.field === field && x.live).map((x) => x.kind));
    for (const e of s.events) if (e.type === "build" && e.field === field) set.add(e.kind);
    return set;
  },
  ratio: (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b > 0 ? a / b : NaN),
  lastPass: (s) => lastPassNumber(s.samples),
  sweepNs: (s, copy, rows) => {
    const e = (s.sweep || []).find((x) => x.rows === rows);
    return e ? e.ns[copy] : NaN;
  },
};

export const x1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : "?");
export const kb = (bytes) => Math.round(bytes / 1024).toLocaleString("en-US").replace(/,/g, " ");
