// Run data to log lines: every sentence template of spec 5.4. Pure: no DOM, no clock.
// Input is the object that run.js returns (see executeRun); output is plain data for the log view.

import { int, sig, time, timeMs, bytes, ratioWords, US } from "./format.js";
import { planLine, planWords } from "./plan-words.js";

export const COPY_NAMES = ["adaptive", "scan only", "grouped only", "sorted only", "grouped and sorted"];
export const FIELDS = ["customer", "amount", "day"];
export const MAX_BLOCK_LINES = 8;
export const COARSE_US = 20;

const OP_SYMBOL = ["=", "≥", "≤", "from", ">", "<"]; // eq ge le between gt lt

const rentNs = (ns) => (ns < 1000 ? `${sig(ns, 3)} ns` : time(ns));
const an = (kind) => (/^[aeiou]/.test(kind) ? "an " : "a ") + kind;

// The text of one predicate of a record: "customer = 42", "amount from 50 000 to 50 999".
function predText(f, op, lo, hi) {
  const name = FIELDS[f];
  if (op === 3) return `${name} from ${int(lo)} to ${int(hi)}`;
  return `${name} ${OP_SYMBOL[op]} ${int(lo)}`;
}

export function conditionsText(r) {
  const parts = [];
  if (r[2] >= 1) parts.push(predText(r[3], r[4], r[5], r[6]));
  if (r[2] >= 2) parts.push(predText(r[7], r[8], r[9], r[10]));
  return parts.join(" and ");
}

// The fields a record reads: its predicates and its order field.
function fieldsOf(r) {
  const out = new Set();
  if (r[2] >= 1) out.add(r[3]);
  if (r[2] >= 2) out.add(r[7]);
  if (r[11] >= 0) out.add(r[11]);
  return out;
}

const isRange = (r, field) => (r[2] >= 1 && r[3] === field && r[4] !== 0) || (r[2] >= 2 && r[7] === field && r[8] !== 0);

// "than on scan only" / "as on scan only" wording of a ratio sentence.
export function compareWords(ratio, { bound = false } = {}) {
  const w = ratioWords(ratio, { bound });
  return { words: w, same: w === "about the same" };
}

export function narrate(run, options = {}) {
  const { runNumber = 1, price = false, memory = false } = options;
  const tickUs = run.clock.tickUs;
  const tickNs = tickUs * 1000;
  const B = run.B;
  const blocks = run.blocks;
  const json = run.json || {};
  const priorNs = json.prior_build_ns ?? 150;
  const rows = run.rows;
  const ran = run.ranCopies;
  const others = ran.filter((c) => c !== 0);
  const state = { explained: false };

  // ---- time helpers ----------------------------------------------------------------
  const noisy = (totalNs) => totalNs < 10 * tickNs;
  const gns = (c, g) => run.groupNs[c][g];

  // Sum of the group times of the ops list[lo..hi) for a copy; n counts the ops that were timed.
  function timeOps(c, list, lo = 0, hi = list.length) {
    let ns = 0, n = 0;
    for (let i = lo; i < hi; i++) {
      const v = gns(c, Math.floor(list[i] / B));
      if (v === v) { ns += v; n++; }
    }
    return { ns, n };
  }
  // Time of copy c before op index `op` (all ops, any block).
  function timeBefore(c, op) {
    const g0 = Math.floor(op / B);
    let ns = 0;
    for (let g = 0; g < g0; g++) { const v = gns(c, g); if (v === v) ns += v * run.groupOps[g]; }
    const v = gns(c, g0);
    if (v === v) ns += v * (op - g0 * B);
    return ns;
  }
  const totalText = (ns) => (noisy(ns) ? "under " + time(10 * tickNs) : time(ns));
  // The per-op time text for a total over n ops: "130 µs" or "under 0.25 µs". Returns { text, bound }.
  function each(ns, n) {
    if (noisy(ns)) return { text: "under " + time((10 * tickNs) / n), bound: true };
    return { text: time(ns / n), bound: false };
  }
  // "130 µs each", with the clock explanation on the first bound of the run.
  function eachText(ns, n) {
    const e = each(ns, n);
    let t = e.text + " each";
    if (e.bound && !state.explained) {
      state.explained = true;
      t += ` (faster than the clock can see; it ticks every ${time(tickNs)})`;
    }
    return t;
  }

  // ---- where is an op? -----------------------------------------------------------------
  const blockOf = new Int32Array(run.nOps).fill(-1);
  const qOf = new Int32Array(run.nOps);
  blocks.forEach((b, bi) => b.ops.forEach((o, k) => { blockOf[o] = bi; qOf[o] = k + 1; }));
  const eventsOf = blocks.map(() => []);
  for (const ev of run.events) {
    const bi = ev.op >= 0 && ev.op < run.nOps ? blockOf[ev.op] : -1;
    if (bi >= 0) eventsOf[bi].push(ev);
  }

  // ---- header --------------------------------------------------------------------------
  const copiesText = run.copies.map((c) => COPY_NAMES[c]).join(", ");
  const head = {
    title: `Run ${runNumber} · ${run.fresh ? "fresh table" : "same table"} · ${int(rows)} rows · ${copiesText}`,
    clock: { text: `clock: ${time(tickNs)}${tickUs > COARSE_US ? " (coarse)" : ""}`, coarse: tickUs > COARSE_US },
    tip: tickUs > COARSE_US
      ? `This page has a coarse clock (${time(tickNs)}). Serve it with \`make serve\` for a 5 ${US} clock. Small times show as bounds.`
      : null,
  };

  const pre = [];
  if (!run.fresh && run.json0) {
    const live = (run.json0.indexes || []).filter((i) => i.live);
    if (live.length) pre.push({ type: "event", text: `The table kept ${live.map((i) => `${an(i.kind)} index on ${i.field}`).join(" and ")} from the last run.` });
  }

  const compactRun = blocks.length >= 2 && blocks.every((b) => b.ops.length === 1 && b.kind === "query");
  const outBlocks = [];
  const runSingles = []; // blocks whose timing goes to one line at the end
  const memTrail = [0];
  let liveBytes = 0;
  let firstBuildSeen = false;

  blocks.forEach((b, bi) => {
    const n = b.ops.length;
    const r = b.rec;
    const lines = [];
    const evs = eventsOf[bi];
    const planStart = run.plansStart[bi];
    const planNow = run.plansNow[bi];
    const startKind = planWords(planStart).kind;
    const nowKind = planWords(planNow).kind;
    const q = b.kind === "query";
    const relevant = fieldsOf(r);

    // ---- value -----------------------------------------------------------------------
    const ans = (k) => run.answers[b.ops[k]];
    const cond = conditionsText(r);
    const term = r[14];
    if (q && n === 1) {
      const a = ans(0);
      if (term === 0) lines.push({ type: "value", text: `${cond || "all rows"}: ${a === 0 ? "no rows" : a === 1 ? "1 row" : int(a) + " rows"}` });
      else if (term === 1) lines.push({ type: "value", text: a > 0 ? `${cond || "all rows"}: yes, at least one row` : `${cond || "all rows"}: no row matches` });
      else if (term === 2 && r[11] >= 0) {
        if (a > 0) {
          const row = run.firstRows[b.ops[0]];
          const by = `${FIELDS[r[11]]}${r[12] ? ", largest first" : ""}`;
          const rowText = row ? ` (customer ${int(row[0])}, amount ${int(row[1])}, day ${int(row[2])})` : "";
          lines.push({ type: "value", text: `first row of ${cond || "the table"} by ${by}: row ${int(a - 1)}${rowText}` });
        } else lines.push({ type: "value", text: `${cond || "all rows"}: no row matches` });
      } else if (term === 2) lines.push({ type: "value", text: `${cond || "all rows"}: ${a > 0 ? "there is a row" : "no row matches"}` });
      else {
        let lead;
        if (r[13] > 0) lead = r[11] >= 0 ? `${int(r[13])} ${r[12] ? "largest" : "smallest"} ${FIELDS[r[11]]}s` : `${int(r[13])} rows`;
        else lead = "all";
        const of = cond ? (r[13] > 0 || lead !== "all" ? ` of ${cond}` : "") : "";
        const text = r[13] > 0 ? `${lead}${of}, summed: ${int(a)}` : `${cond || "all rows"}, summed: ${int(a)}`;
        lines.push({ type: "value", text });
        if (r[13] > 0 && r[11] < 0) lines.push({ type: "insight", text: "limit without orderBy picks any rows, so the sum has no fixed answer" });
      }
    } else if (q) {
      let min = Infinity, max = -Infinity, sum = 0, found = 0;
      for (let k = 0; k < n; k++) { const a = ans(k); if (a < min) min = a; if (a > max) max = a; sum += a; if (a > 0) found++; }
      if (term === 0) lines.push({ type: "value", text: `${int(n)} queries. Answers from ${int(min)} to ${int(max)} rows, ${sig(sum / n, 3)} on average.` });
      else if (term === 1 || term === 2) lines.push({ type: "value", text: `${int(found)} of ${int(n)} found a row.` });
      else {
        lines.push({ type: "value", text: `${int(n)} queries. Sums from ${int(min)} to ${int(max)}, ${sig(sum / n, 3)} on average.` });
        if (r[13] > 0 && r[11] < 0) lines.push({ type: "insight", text: "limit without orderBy picks any rows, so the sum has no fixed answer" });
      }
    } else {
      lines.push({ type: "value", text: `${int(n)} ${n === 1 ? "row" : "rows"} ${b.kind === "update" ? "updated" : "replaced"}.` });
    }

    // ---- phases and events -----------------------------------------------------------------
    const nBlockMs = timeOps(0, b.ops).ns; // copy 0 over this block, in ns
    const tBefore = timeBefore(0, b.ops[0]);
    const word = b.kind === "query" ? "Queries" : b.kind === "update" ? "Updates" : "Churns";
    const one = b.kind === "query" ? "Query" : b.kind === "update" ? "Update" : "Churn";
    const afterWord = b.kind === "query" ? "query" : b.kind === "update" ? "update" : "operation";
    let kind = startKind === "scan" || startKind === "raw" ? "scans" : nowKind === "walk" || startKind === "walk" ? "walks" : "lookups";
    const lookWord = () => (nowKind === "walk" ? "walks" : "lookups");
    let cursor = 0;
    let lastT = null; // t_abs_ms of the previous event, ms
    let firstScanNs = null; // total of the first scan phase, ns
    let scanEachNs = null;
    let buildMsSum = 0;
    const segs = [];

    // The last full group of the block that ends at or before q = hi, as { g, ns, ops }.
    const lastFull = (hi) => {
      const byG = new Map();
      for (let k = 0; k < n; k++) { const g = Math.floor(b.ops[k] / B); const e = byG.get(g); if (e) { e.count++; e.qMax = k + 1; } else byG.set(g, { g, count: 1, qMax: k + 1 }); }
      let best = null;
      for (const e of byG.values()) if (e.count === B && run.groupOps[e.g] === B && e.qMax <= hi && (!best || e.g > best.g)) best = e;
      return best;
    };

    const segLine = (a, bq, k, totalNs) => {
      const cnt = bq - a + 1;
      const label = a === bq ? `${one} ${int(a)}` : `${word} ${int(a)} to ${int(bq)}`;
      if (b.kind !== "query") {
        const e0 = eachText(totalNs, cnt);
        let text = `${label}: ${e0}.`;
        if (ran.includes(1)) { const t1 = timeOps(1, b.ops, a - 1, bq); if (t1.n === cnt) text += ` scan only: ${eachText(t1.ns, cnt)}.`; }
        return { type: "event", text };
      }
      if (k === "scans") return { type: "event", text: `${label}: ${a === bq ? "a scan" : "scans"}, ${eachText(totalNs, cnt)}${cnt > 1 ? `, ${totalText(totalNs)} in total` : ""}.` };
      let text = `${label}: ${k}, ${eachText(totalNs, cnt)} on average`;
      const lf = lastFull(bq);
      if (lf && lf.qMax > a + B - 2) {
        const v = gns(0, lf.g);
        if (v === v) text += `; the last ${int(B)} took ${eachText(v * B, B)}`;
      }
      return { type: "event", text: text + "." };
    };

    const emitSeg = (a, bq, k, totalNs) => {
      if (bq < a) return;
      segs.push({ a, b: bq, kind: k, ns: totalNs });
      if (k === "scans" && firstScanNs === null) { firstScanNs = totalNs; scanEachNs = totalNs / (bq - a + 1); }
      lines.push(segLine(a, bq, k, totalNs));
    };

    const showPhases = evs.length > 0 || (q && kind !== "scans" && n > 1 && b.kind === "query");
    for (const ev of evs) {
      const qq = qOf[ev.op];
      const isBuild = ev.type === "build" || ev.type === "trial";
      const buildMs = isBuild ? ev.build_ms || 0 : 0;
      if (showPhases && qq > cursor) {
        const endT = ev.t_abs_ms - buildMs;
        const startT = lastT === null ? tBefore / 1e6 : lastT;
        const kk = kind === "lookups" ? lookWord() : kind;
        emitSeg(cursor + 1, qq, kk, Math.max(0, (endT - startT) * 1e6));
      }
      cursor = Math.max(cursor, qq);
      lastT = ev.t_abs_ms;

      // the sentence of the event
      const gq = ev.op + 1;
      let text = "", note = "", cls = "";
      if (ev.type === "build") {
        cls = "build";
        text = `After ${afterWord} ${int(qq)}: built ${an(ev.kind)} index on ${ev.field} in ${timeMs(ev.build_ms || 0)}.`;
        if (isRange(r, FIELDS.indexOf(ev.field)) && (ev.kind === "ordered" || ev.kind === "sorted_array")) text += " It is the first allowed kind that can answer a range.";
        if (run.fresh && !firstBuildSeen) {
          const est = (priorNs * rows) / 1e6;
          const scanMs = firstScanNs === null ? 0 : firstScanNs / 1e6;
          const had = scanMs > 0 ? ` had cost ${timeMs(scanMs)}, more than` : " had cost more than";
          note = `Why now: the scans${had} the estimate of a build (${timeMs(est)} = ${int(priorNs)} ns per row × ${int(rows)} rows).`;
        } else text += " Its scans had cost about as much as building it.";
        firstBuildSeen = true;
        buildMsSum += ev.build_ms || 0;
      } else if (ev.type === "trial") {
        cls = "trial";
        const prev = run.events.find((e) => e.op < ev.op && e.type === "build" && e.field === ev.field && e.kind === ev.other);
        const spent = prev ? ` (${timeMs(prev.build_ms || 0)})` : "";
        text = `After ${afterWord} ${int(qq)}: built ${ev.kind} on ${ev.field} to compare it with ${ev.other}. Why: ${ev.other} has now spent as much time on lookups as its build took${spent}.`;
        buildMsSum += ev.build_ms || 0;
      } else {
        cls = "drop";
        const prev = run.events.find((e) => e.op < ev.op && e.type === "build" && e.field === ev.field && e.kind === ev.kind);
        if (ev.reason === "twin") text = `After operation ${int(gq)}: dropped ${ev.kind} on ${ev.field}. ${ev.other} answered the same queries, so ${ev.kind} saved nothing and its memory (${bytes(ev.bytes || 0)}) was not worth its rent.`;
        else if (ev.reason === "slower") {
          const o = (json.indexes || []).find((i) => i.field === ev.field && i.kind === ev.other);
          const against = o && o.probe_ns ? ` against ${time(o.probe_ns)} for ${ev.other}` : `, more than ${ev.other}`;
          text = `After ${afterWord} ${int(qq)}: dropped ${ev.kind} on ${ev.field}: its lookups cost ${time(ev.probe_ns || 0)}${against}.`;
        } else if (ev.reason === "rent") text = `After operation ${int(gq)}: dropped the ${ev.kind} index on ${ev.field} for rent. Its queries stopped, so it earned nothing, and ${bytes(ev.bytes || 0)} at this rent costs ${rentNs((json.rent ?? run.rent) * (ev.bytes || 0))} per operation.`;
        else if (ev.reason === "writes") text = `After ${afterWord} ${int(qq)}: dropped the ${ev.kind} index on ${ev.field}. Every update moved a row inside it, no query used it, and those moves had cost more than building it again (${timeMs(ev.build_ms || (prev && prev.build_ms) || 0)}).`;
        else if (ev.reason === "unfit") text = `Built ${ev.kind} on ${ev.field} and dropped it at once: the keys are too spread out for it.`;
        else text = `After ${afterWord} ${int(qq)}: dropped ${ev.kind} on ${ev.field}.`;
      }
      lines.push({ type: "event", cls, text, note: note || undefined, bytes: ev.bytes });
      // memory trail for the stat line
      if (ev.type === "build" || ev.type === "trial") liveBytes += ev.bytes || 0; else if (ev.type === "drop" && ev.reason !== "unfit") liveBytes -= ev.bytes || 0;
      memTrail.push(Math.max(0, liveBytes));

      // the phase after the event
      const rel = relevant.has(FIELDS.indexOf(ev.field));
      if (q && rel) {
        if (ev.type === "build") kind = "lookups";
        else if (ev.type === "drop" && ev.reason !== "twin" && ev.reason !== "slower") kind = "scans";
      }
    }
    if (showPhases && cursor < n) {
      const used = lastT === null ? 0 : lastT * 1e6 - tBefore;
      const total = lastT === null ? nBlockMs : nBlockMs - used;
      const kk = kind === "lookups" ? lookWord() : kind;
      emitSeg(cursor + 1, n, kk, Math.max(0, total));
    }

    // ---- timing --------------------------------------------------------------------------
    const g0 = Math.floor(b.ops[0] / B);
    const alone = n === 1 && run.groupOps[g0] === 1;
    if (n === 1 && !alone) runSingles.push(b);
    else if (alone) {
      const t0 = gns(0, g0);
      let text = totalText(t0);
      if (others.length) text = `adaptive ${text} · ` + others.map((c) => `${COPY_NAMES[c]} ${totalText(gns(c, g0))}`).join(" · ");
      lines.push({ type: "timing", text });
    } else {
      const parts = [`adaptive ${totalText(nBlockMs)} in total`];
      for (const c of others) {
        const t = timeOps(c, b.ops);
        if (t.n === n) parts.push(`${COPY_NAMES[c]} ${totalText(t.ns)}, ${eachText(t.ns, n)}`);
      }
      lines.push({ type: "timing", text: parts.join(" · ") });
    }

    // ---- plan --------------------------------------------------------------------------
    let compactPlan = null;
    if (q) {
      const matches = n === 1 && term === 0 ? ans(0) : null;
      const pl = planLine(planStart, planNow, { matches, loop: n > 1 });
      const plain = pl.kind === "scan" && r[2] <= 1 && r[11] < 0 && !pl.text.startsWith("now:");
      if (compactRun && plain && n === 1) { compactPlan = "scan"; }
      else lines.push({ type: "plan", text: pl.text, raw: pl.raw, kind: pl.kind });
    }

    // ---- insights --------------------------------------------------------------------------
    if (q && n > 1) {
      const t0 = nBlockMs;
      const adaptiveBuilt = evs.some((e) => e.type === "build");
      // no index yet
      if (evs.length === 0 && startKind === "scan" && nowKind === "scan" && !(json.counters && json.counters.builds > 0)) {
        lines.push({ type: "insight", text: `No index yet. The ${int(n)} scans cost ${totalText(t0)}. The container builds an index when its scans cost more than a build would: about ${timeMs((priorNs * rows) / 1e6)} here.` });
      }
      const lf = lastFull(n);
      const hashRange = (c) => {
        if (c !== 2) return false;
        const rf = [...relevant].find((f) => isRange(r, f));
        if (rf === undefined) return false;
        const t2 = timeOps(2, b.ops);
        if (t2.n !== n) return false;
        const e2 = t2.ns / n;
        if (ran.includes(1)) { const t1 = timeOps(1, b.ops); return t1.n === n && e2 >= 0.5 * (t1.ns / n); }
        if (scanEachNs !== null) return e2 >= 0.5 * scanEachNs;
        if (ran.includes(3)) { const t3 = timeOps(3, b.ops); return t3.n === n && e2 >= 10 * (t3.ns / n); }
        return false;
      };
      for (const c of others) {
        if (hashRange(c)) {
          const rf = [...relevant].find((f) => isRange(r, f));
          lines.push({ type: "insight", text: `${COPY_NAMES[c]} has a hash on ${FIELDS[rf]} and scanned every time: a hash cannot answer a range.` });
          continue;
        }
        if (price && c === 2 && adaptiveBuilt) continue; // the price lines below say it
        if (!lf || !(evs.length || kind !== "scans")) continue;
        const a = gns(0, lf.g), o = gns(c, lf.g);
        if (!(a === a) || !(o === o)) continue;
        const aTot = a * B, oTot = o * B;
        if (noisy(oTot)) continue;
        let words;
        if (noisy(aTot)) {
          const bound = (10 * tickNs) / B;
          const rr = o / bound;
          if (rr < 1.3) continue;
          words = ratioWords(rr, { bound: true });
        } else words = ratioWords(o / a);
        lines.push({ type: "insight", text: words === "about the same" ? `The last ${int(B)} queries ran about the same as on ${COPY_NAMES[c]}.` : `The last ${int(B)} queries ran ${words} than on ${COPY_NAMES[c]}.` });
      }
      if (price && ran.includes(2) && adaptiveBuilt) {
        const t2 = timeOps(2, b.ops);
        if (t2.n === n) {
          const extra = (t0 - t2.ns) / 1e6;
          const scanMs = (firstScanNs || 0) / 1e6;
          const rest = Math.max(0, extra - scanMs - buildMsSum);
          let text = `Adaptive spent ${timeMs(Math.max(0, extra))} more than ${COPY_NAMES[2]}: ${timeMs(scanMs)} of scans before the index, ${timeMs(buildMsSum)} to build it, ${timeMs(rest)} of timed lookups and other work.`;
          if (ran.includes(1)) {
            const t1 = timeOps(1, b.ops);
            if (t1.n === n && !noisy(t0)) { const rr = t1.ns / t0; text += rr < 1.3 ? " That is about the same as scan only." : ` That is ${sig(rr, 2)} times less than scan only.`; }
          }
          lines.push({ type: "insight", text });
          if (lf) {
            const a = gns(0, lf.g), o = gns(2, lf.g);
            if (a === a && o === o) {
              if (noisy(a * B) && noisy(o * B)) lines.push({ type: "insight", text: `In the last ${int(B)} queries both were under ${time((10 * tickNs) / B)} each: too fast for this clock to tell apart.` });
              else {
                const aa = noisy(a * B) ? (10 * tickNs) / B : a, oo = noisy(o * B) ? (10 * tickNs) / B : o;
                const w = ratioWords(aa / oo);
                lines.push({ type: "insight", text: w === "about the same" ? `In the last ${int(B)} queries the two were about the same.` : aa > oo ? `In the last ${int(B)} queries grouped only was ${w}.` : `In the last ${int(B)} queries adaptive was ${ratioWords(oo / aa)}.` });
              }
            }
          }
        }
      }
    }

    // ---- assemble ----------------------------------------------------------------------------
    let blockLines = lines;
    let compact = false;
    if (compactPlan) { blockLines[0] = { ...blockLines[0], plan: compactPlan }; compact = true; }
    const hidden = blockLines.length > MAX_BLOCK_LINES ? blockLines.slice(MAX_BLOCK_LINES) : [];
    outBlocks.push({
      line: b.line, text: b.text, count: n, label: run.labels.length > 1 ? b.label : null, kind: b.kind, compact,
      lines: hidden.length ? blockLines.slice(0, MAX_BLOCK_LINES) : blockLines, hidden,
    });
  });

  // ---- run level lines ------------------------------------------------------------------------
  const tail = [];
  if (runSingles.length) {
    const ops = runSingles.flatMap((b) => b.ops);
    const t0 = timeOps(0, ops);
    const allQ = runSingles.every((b) => b.kind === "query");
    let text = `${int(ops.length)} ${allQ ? (ops.length === 1 ? "query" : "queries") : "operations"}, ${eachText(t0.ns, ops.length)}`;
    for (const c of others) { const tc = timeOps(c, ops); if (tc.n === ops.length) text += ` · ${COPY_NAMES[c]} ${eachText(tc.ns, ops.length)}`; }
    tail.push({ type: "timing", text });
  }
  for (const s of run.stoppedCopies || []) {
    tail.push({ type: "insight", text: `${COPY_NAMES[s.copy]} stopped after ${int(s.after)} operations: at ${time(s.eachNs)} each the rest would take ${time(s.remainingMs * 1e6)}.` });
  }
  if (memory && memTrail.length > 1) {
    tail.push({ type: "stat", text: "index memory: " + memTrail.map((v) => (v === 0 ? "0" : bytes(v))).join(" → ") });
  }
  if (run.disagree >= 0) tail.push({ type: "warning", text: `The copies gave different answers at operation ${int(run.disagree + 1)}.` });
  if (run.stopped) tail.push({ type: "warning", text: `Stopped after ${int(run.stopped.done)} of ${int(run.stopped.total)} operations.` });

  return { head, pre, blocks: outBlocks, tail };
}

