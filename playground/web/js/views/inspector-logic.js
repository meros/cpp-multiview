// Card states and reason badges of the index inspector (spec 6.4). Pure: events and indexes in, cards out.
import { fmtNs, fmtKb } from "../format.js";

export const FIELD_NAMES = ["customer", "amount", "day"];
export const KIND_ORDER = ["grouped", "swiss", "dense", "ordered", "sorted-array", "hash"];
const HASH_KINDS = new Set(["grouped", "swiss", "hash"]);

// Which fields the script filters or orders on: { customer: { eq, range, order } }.
export function fieldUsage(compiled) {
  const use = {};
  for (const f of FIELD_NAMES) use[f] = { eq: false, range: false, order: false };
  if (!compiled || !compiled.ok) return use;
  for (const r of compiled.ops) {
    if (r[0] !== 0) continue;
    if (r[2] >= 1) use[FIELD_NAMES[r[3]]][r[4] === 0 ? "eq" : "range"] = true;
    if (r[2] >= 2) use[FIELD_NAMES[r[7]]][r[8] === 0 ? "eq" : "range"] = true;
    if (r[11] >= 0) use[FIELD_NAMES[r[11]]].order = true;
  }
  return use;
}

const lastOf = (arr, pred) => {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return arr[i];
  return null;
};

export function buildCards(s, usage) {
  const events = s.events || [];
  const byKey = new Map((s.indexes || []).map((x) => [`${x.field}/${x.kind}`, x]));
  const fields = FIELD_NAMES.map((field) => {
    const liveKinds = KIND_ORDER.filter((k) => byKey.get(`${field}/${k}`) && byKey.get(`${field}/${k}`).live);
    const cards = KIND_ORDER.map((kind) => {
      const x = byKey.get(`${field}/${kind}`) || { field, kind, live: false, probe_ns: 0, uses: 0, bytes: 0, build_ms: 0 };
      const builds = events.filter((e) => e.type === "build" && e.field === field && e.kind === kind);
      const drops = events.filter((e) => (e.type === "drop" || e.type === "rent-drop") && e.field === field && e.kind === kind);
      const others = liveKinds.filter((k) => k !== kind);
      let state = "never";
      let reason = "";
      if (x.live) {
        state = "live";
        const mine = builds[builds.length - 1];
        if (mine) {
          const earlier = others.some((o) => events.some((e) => e.type === "build" && e.field === field && e.kind === o && e.seq < mine.seq));
          const trialGrew = events.some((e) => e.type === "trial" && e.seq === mine.seq);
          if (earlier && trialGrew) state = "trial";
        }
        const other = others[0];
        const oi = other ? byKey.get(`${field}/${other}`) : null;
        if (state === "trial") reason = `trial: compared with ${other}`;
        else if (!other) reason = `built: scans on ${field} cost as much as a build`;
        else if (x.probe_ns > 0 && oi && oi.probe_ns > 0) {
          reason = x.probe_ns <= oi.probe_ns
            ? `preferred: ${(oi.probe_ns / x.probe_ns).toFixed(1)}× faster than ${other}`
            : "slower twin: earns nothing, pays rent";
        } else reason = `built: scans on ${field} cost as much as a build`;
      } else if (builds.length) {
        state = "dropped";
        const d = lastOf(drops, () => true);
        if (d && builds.some((b) => b.seq === d.seq)) reason = "dropped: keys too spread for dense";
        else if (d && d.type === "rent-drop") reason = "dropped: could not pay its rent";
        else if (d && others.length) reason = `dropped: lost the comparison with ${others[0]}`;
        else reason = "dropped: not used";
      } else {
        const u = (usage && usage[field]) || { eq: false, range: false, order: false };
        if (!u.eq && !u.range && !u.order) reason = `no query filters on ${field}`;
        else if (HASH_KINDS.has(kind) && !u.eq && (u.range || u.order)) reason = "cannot answer ranges";
        else reason = "not tried yet";
      }
      const hasBalance = typeof x.balance === "number";
      return {
        key: `${field}/${kind}`, field, kind, state, reason,
        probe: x.probe_ns > 0 && x.live ? fmtNs(x.probe_ns) : "—",
        uses: x.uses ? Math.round(x.uses).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") : "0",
        memory: x.live ? `${fmtKb(x.bytes)} KB` : "—",
        build: `${Number(x.build_ms || 0).toFixed(1)} ms`,
        balance: hasBalance ? { value: x.balance, limit: x.drop_at } : null,
      };
    });
    return { field, cards };
  });
  const live = (s.indexes || []).filter((x) => x.live);
  const c = s.counters;
  const header = [
    `${live.length} live, ${fmtKb(live.reduce((a, x) => a + x.bytes, 0))} KB`,
    `scans ${c.scans}`, `probes ${c.probes}`, `walks ${c.walks}`, `builds ${c.builds}`,
    `drops ${c.drops} (${c.rent_drops} for rent)`,
  ];
  return { fields, header, trials: `trials ${c.trials}` };
}
