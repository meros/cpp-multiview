// Derive timeline events by diffing two snapshots of { indexes, counters }. Pure.

const key = (x) => `${x.field}/${x.kind}`;

// prev, cur: { indexes, counters }. ctx: { seq, pass, slice, agree, disagreeOp }.
export function deriveEvents(prev, cur, ctx) {
  const events = [];
  const base = { seq: ctx.seq, pass: ctx.pass, slice: ctx.slice };
  const was = new Map((prev.indexes || []).map((x) => [key(x), x]));
  const built = [];
  const dropped = [];
  for (const x of cur.indexes || []) {
    const before = was.get(key(x));
    const wasLive = !!(before && before.live);
    if (x.live && !wasLive) built.push(x);
    else if (!x.live && wasLive) dropped.push(x);
  }
  for (const x of built) {
    events.push({ ...base, type: "build", field: x.field, kind: x.kind, text: `built ${x.kind} on ${x.field} (${Number(x.build_ms).toFixed(1)} ms)` });
  }
  const rentGrowth = Math.max(0, (cur.counters.rent_drops || 0) - (prev.counters.rent_drops || 0));
  dropped.forEach((x, i) => {
    if (i < rentGrowth) events.push({ ...base, type: "rent-drop", field: x.field, kind: x.kind, text: `dropped ${x.kind} on ${x.field}: could not pay its rent` });
    else events.push({ ...base, type: "drop", field: x.field, kind: x.kind, text: `dropped ${x.kind} on ${x.field} (lost a comparison or not used)` });
  });
  if ((cur.counters.trials || 0) > (prev.counters.trials || 0)) {
    events.push({ ...base, type: "trial", field: null, kind: null, text: "started a trial of a second kind" });
  }
  if (ctx.agree === false) {
    events.push({ ...base, type: "disagree", field: null, kind: null, text: `copies disagree at op ${ctx.disagreeOp}` });
  }
  return events;
}

export const EVENT_GLYPH = { build: "▲", drop: "▼", "rent-drop": "▼", trial: "◆", disagree: "!" };
