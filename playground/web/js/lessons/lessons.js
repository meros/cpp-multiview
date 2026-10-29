// The seven lessons as data (spec sections 4 and 9.5). Copy is verbatim from the spec.
import { SCRIPTS } from "./scripts.js";
import { x1, kb } from "./checks.js";

export const KIND_NAMES = ["grouped", "swiss", "dense", "ordered", "sorted-array", "hash"];
export const COPY_NAMES = ["adaptive", "scan only", "grouped only", "sorted only", "grouped and sorted", "yours"];

const ALL_LOCKED = { rows: true, seed: true, eagerness: true, maxIndexKb: true, rent: true, yoursMask: true, repeat: false, copies: true, editor: true };
const BASE_KNOBS = { rows: 50000, seed: 1, eagerness: 1, maxIndexKb: 0, rent: 1e-5, yoursMask: [0, 0, 0] };
const shown = (...ids) => COPY_NAMES.map((_, i) => ids.includes(i));

export const masksMatch = (mask) => !!(mask[2] & 4) && !!(mask[1] & (8 | 16));
const maskText = (mask) => mask.map((m, f) => `${["customer", "amount", "day"][f]}: ${KIND_NAMES.filter((_, b) => m >> b & 1).join("+") || "none"}`).join(", ");

export const LESSONS = [
  {
    id: "L1",
    title: "A scan grows with the table",
    goal: "See that the cost of a scan grows with the number of rows, and an index lookup does not.",
    copy: [
      "A query with no index reads every row. Twice the rows, twice the time.",
      "Press **Run sweep**. The playground builds the table at four sizes and runs the same 400 lookups by customer on each. The red line is the scan-only copy. The blue line has a hash index on every field.",
      "The scan line climbs about as fast as the table grows. The indexed line stays nearly flat: a hash lookup jumps to the right bucket, so its cost depends on the number of matching rows, not on the size of the table.",
      "At 1 000 rows the difference is small. At 200 000 rows it is two to three orders of magnitude. A design that is correct at 1 000 rows is not correct at a million.",
    ],
    setup: {
      knobs: { ...BASE_KNOBS, repeat: 1 }, locked: { ...ALL_LOCKED, repeat: true }, shownCopies: shown(1, 2),
      script: SCRIPTS.L1, sweep: [1000, 10000, 50000, 200000], panels: ["sweep", "results"],
    },
    action: { label: "Run sweep", kind: "sweep" },
    focus: { before: "sweep", after: "sweep" },
    cues: { afterRun: () => [{ sweepRatio: true }] },
    checks: [
      {
        id: "growth", text: "A scan grows with the table", timed: true,
        test: (s, h) => {
          const x = h.ratio(h.sweepNs(s, 1, 200000), h.sweepNs(s, 1, 1000));
          return { pass: x >= 40, x, measured: `scan grew ${x1(x)}× from 1 000 to 200 000 rows` };
        },
        fallback: "The ratio came out at {x}×. A coarse browser clock blurs the small sizes. Press Run again.",
      },
      {
        id: "gap", text: "An index beats the scan by 20× at 200 000 rows", timed: true,
        test: (s, h) => {
          const x = h.ratio(h.sweepNs(s, 1, 200000), h.sweepNs(s, 2, 200000));
          return { pass: x >= 20, x, measured: `scan is ${x1(x)}× slower than the index at 200 000 rows` };
        },
        fallback: "Expected at least 20×, measured {x}×.",
      },
    ],
  },
  {
    id: "L2",
    title: "An index pays for itself",
    goal: "See the adaptive copy scan first, then build an index once the scans have cost as much as a build.",
    copy: [
      "The adaptive copy starts with no index. Nobody told it which queries come.",
      "Each scan it runs is timed and charged to the field it filtered on, here `customer`. The container also knows what a build costs: it measures the build time per row. When the scans charged to `customer` add up to one build, it builds.",
      "This is the ski-rental rule. You rent skis until the rent paid equals the price of skis, then you buy. If you stop skiing the next day, you paid at most twice the best price. Here: the container never wastes more than one build's worth of scans, and an index that turns out useless costs at most about one build.",
      "Press **Run**. The green line follows the red one at first, then drops to the blue one after the build marker. From the second pass on, the adaptive copy runs at index speed. The plan view shows the switch in words: from \"scan 50000 elements\" to \"probe grouped index on customer\".",
    ],
    setup: {
      knobs: { ...BASE_KNOBS, repeat: 3 }, locked: ALL_LOCKED, shownCopies: shown(0, 1, 2),
      script: SCRIPTS.L2, panels: ["timeline", "results", "inspector", "plans"],
    },
    action: { label: "Run", kind: "run" },
    focus: {
      before: "timeline",
      after: (s) => {
        const live = (s.indexes || []).find((x) => x.field === "customer" && x.live);
        return live ? `inspector-card-customer-${live.kind}` : "inspector";
      },
    },
    cues: {
      afterRun: (s) => {
        const b = s.events.find((e) => e.type === "build");
        return b ? [{ seq: b.seq, text: "the build happens here" }] : [];
      },
    },
    checks: [
      {
        id: "live", text: "An index on customer is live", timed: false, minPass: 3,
        test: (s, h) => {
          const k = h.live(s, "customer");
          return { pass: k.length > 0, measured: k.length ? `live: ${k.join(", ")} on customer` : "none live" };
        },
        fallback: "No index yet. Raise the repeat count to 6 and run again.",
      },
      {
        id: "first-build", text: "The first build happens in pass 1", timed: false,
        test: (s) => {
          const b = s.events.find((e) => e.type === "build");
          return { pass: !!b && b.pass === 1, measured: b ? `first build in pass ${b.pass}, slice ${b.slice}` : "no build" };
        },
        fallback: "The first build came later than pass 1. This depends on measured build time; it is not an error.",
      },
      {
        id: "fast", text: "Adaptive is at least 20× faster than scan in pass 3", timed: true, minPass: 3,
        test: (s, h) => {
          const x = h.ratio(h.labelNs(s, 1, "lookup", 3), h.labelNs(s, 0, "lookup", 3));
          return { pass: x >= 20, x, measured: `adaptive is ${x1(x)}× faster than scan in pass 3` };
        },
        fallback: "Expected at least 20×, measured {x}×. Index probes are fast enough that a coarse clock cannot time them well.",
      },
    ],
  },
  {
    id: "L3",
    title: "What an index costs",
    goal: "See that every index slows down writes and holds memory, whether queries use it or not.",
    copy: [
      "An index is a second copy of part of the table, kept in another order. Every write must update it.",
      "This script reads, then changes `amount` 20 000 times, then replaces 5 000 rows. Look at the `update` column. The scan-only copy only writes the row. The others also move the row inside each index on `amount`. A sorted index pays the most, because it keeps keys in order and shifts entries to make room.",
      "Now look at `index KB`. The scan-only copy holds nothing. The copy with both kinds on every field holds the most, and it holds it whether or not a query uses it. `day` has an index on three copies here, and no query in this script filters on `day`.",
      "An index trades write time and memory for read time. That trade is good only if the reads come.",
    ],
    setup: {
      knobs: { ...BASE_KNOBS, repeat: 1 }, locked: ALL_LOCKED, shownCopies: shown(1, 2, 3, 4),
      script: SCRIPTS.L3, panels: ["timeline", "results", "memory"],
    },
    action: { label: "Run", kind: "run" },
    focus: { before: "results", after: "results-col-update results-col-index-kb" },
    cues: {
      before: [{ target: "results-col-update", text: "the same 20 000 writes on every copy" }],
    },
    checks: [
      {
        id: "writes", text: "Writes cost at least 3× more with sorted indexes", timed: true,
        test: (s, h) => {
          const p = h.lastPass(s);
          const x = h.ratio(h.labelNs(s, 3, "update", p), h.labelNs(s, 1, "update", p));
          return { pass: x >= 3, x, measured: `a write costs ${x1(x)}× more with sorted indexes` };
        },
        fallback: "Measured {x}×. Writes to the scan-only copy are so cheap that the clock may round them to zero. Press Run again.",
      },
      {
        id: "memory", text: "Memory grows with the number of indexes", timed: false,
        test: (s, h) => {
          const [gs, g, so, sc] = [h.bytes(s, 4), h.bytes(s, 2), h.bytes(s, 3), h.bytes(s, 1)];
          return { pass: gs > g && g > 0 && so > 0 && sc === 0, measured: `${kb(gs)} KB, ${kb(g)} KB, ${kb(so)} KB, 0 KB` };
        },
        fallback: "The index sizes do not show the expected order.",
      },
    ],
  },
  {
    id: "L4",
    title: "No kind wins everywhere",
    goal: "See that each index kind wins one kind of query and loses another, and pick kinds for the `yours` copy.",
    copy: [
      "Six index kinds ship with multiview. Each one wins somewhere and loses somewhere else.",
      "- A hash (`grouped`, `swiss`, `hash`) answers equality only. Ask it for a range and the copy falls back to a scan. Look at `grouped only` on `amount range`.",
      "- A sorted kind (`ordered`, `sorted-array`) answers equality, ranges and order. It pays for that with slower lookups and slower writes than a hash.",
      "- `dense` is one array slot per key value. It works only when the keys are integers in a small range, like `day` (365 values). There it is the fastest lookup of all.",
      "Measured natively at a million rows with 64 rows per key: `dense` 40 ns, `grouped` 69 ns, `sorted-array` 113 ns, `ordered` 318 ns, `hash` 1 377 ns. With unique keys the order changes: `hash` 21 ns, `swiss` 26 ns, `grouped` 28 ns. (Source: docs/KINDS.md.)",
      "Tick `dense` on `day` and `sorted-array` on `amount` for your copy, then press **Apply and run**. Your copy now wins two of the three columns. Which kind is right depends on the key distribution and on the queries. That is the reason the container measures instead of guessing.",
    ],
    setup: {
      knobs: { ...BASE_KNOBS, repeat: 2 }, locked: { ...ALL_LOCKED, yoursMask: false }, shownCopies: shown(1, 2, 3, 5),
      script: SCRIPTS.L4, panels: ["timeline", "results"],
    },
    action: {
      label: "Apply and run", kind: "apply-and-run", requires: (s) => masksMatch(s.knobs.yoursMask),
      hint: "Tick dense on day and sorted-array on amount first.",
    },
    focus: { before: "kind-grid", after: "results" },
    cues: { before: [{ target: "kind-grid", text: "pick one kind per field, then apply", once: true }] },
    checks: [
      {
        id: "hash-ranges", text: "A hash-only copy is at least 10× slower on ranges", timed: true,
        test: (s, h) => {
          const p = h.lastPass(s);
          const x = h.ratio(h.labelNs(s, 2, "amount range", p), h.labelNs(s, 3, "amount range", p));
          return { pass: x >= 10, x, measured: `the hash-only copy is ${x1(x)}× slower on ranges` };
        },
        fallback: "Measured {x}×.",
      },
      {
        id: "mask", text: "Your copy has dense on day and a sorted kind on amount", timed: false, eager: true,
        test: (s) => ({ pass: masksMatch(s.knobs.yoursMask), measured: `yours: ${maskText(s.knobs.yoursMask)}` }),
        fallback: "Tick dense on day and sorted-array on amount.",
      },
      {
        id: "yours", text: "Your copy is within 2× of the best on both columns", timed: true,
        test: (s, h) => {
          if (!masksMatch(s.knobs.yoursMask)) return { pass: false, x: NaN, y: NaN, measured: "apply your masks first" };
          const p = h.lastPass(s);
          const x = h.ratio(h.labelNs(s, 5, "amount range", p), h.labelNs(s, 3, "amount range", p));
          const y = h.ratio(h.labelNs(s, 5, "day = ?", p), h.labelNs(s, 2, "day = ?", p));
          return { pass: x <= 2 && y <= 2, x, y, measured: `yours vs best: ${x1(x)}×, ${x1(y)}×` };
        },
        fallback: "Your copy is within {x}× of the best. Small differences are noise in a browser.",
      },
    ],
  },
  {
    id: "L5",
    title: "How the container chooses a kind",
    goal: "See the container build a second kind for the same field, measure both, and keep the cheaper one.",
    copy: [
      "The first index the container builds is a guess: the first kind in the declaration that can answer the query. It may not be the fastest kind for this data.",
      "So the container keeps measuring. One probe in 16 is timed at first; the interval grows to 1 in 1 024 while nothing changes. When the live index has spent as much time probing as its build took, the container builds one other kind for the same field. This is a **trial**. Now two kinds answer the same query, and the planner sends each call to the one with the lower cost: probe time, plus write time weighted by how often the field is written, plus memory rent.",
      "The loser is still probed now and then, so its estimate stays fresh. If it stays the loser, it earns nothing, pays rent, and is dropped.",
      "Press **Run** and watch the `customer` cards in the inspector. A card turns live, a second one joins it, and one of them later goes grey with the reason \"lost the comparison\".",
    ],
    setup: {
      knobs: { ...BASE_KNOBS, repeat: 8 }, locked: ALL_LOCKED, shownCopies: shown(0, 2, 3),
      script: SCRIPTS.L5, panels: ["timeline", "results", "inspector", "plans"],
    },
    action: { label: "Run", kind: "run" },
    focus: { before: "inspector", after: "inspector-row-customer" },
    cues: { before: [{ target: "inspector-trials", text: "trials" }] },
    checks: [
      {
        id: "trial", text: "The container started a trial", timed: false, failAfter: 8,
        test: (s) => ({ pass: s.counters.trials >= 1, measured: `${s.counters.trials} trials` }),
        fallback: "No trial yet: the live index has not yet spent its build time on probes. Run again; trials need more probes when probes are cheap.",
      },
      {
        id: "two-kinds", text: "Two kinds on customer were live at some point", timed: false,
        test: (s, h) => {
          const set = h.everLive(s, "customer");
          return { pass: set.size >= 2, measured: `kinds tried on customer: ${[...set].join(", ") || "none"}` };
        },
        fallback: "Only one kind was built on customer so far. Run again.",
      },
      {
        id: "settled", text: "One or two kinds on customer are live", timed: false,
        test: (s, h) => {
          const k = h.live(s, "customer");
          return { pass: k.length === 1 || k.length === 2, measured: `live now: ${k.join(", ") || "none"}` };
        },
        fallback: "No kind is live on customer. Run again.",
      },
    ],
  },
  {
    id: "L6",
    title: "Unused indexes pay rent and go",
    goal: "See an index that no longer serves queries lose its balance to rent and get dropped, while a new one is built.",
    copy: [
      "The workload changed. The first three passes only looked up customers. The new script only asks for ranges of `amount`.",
      "Every live index pays rent: a price per byte per operation, charged on every operation the container serves. An index earns credit when it serves a query: the scan time it saved. The customer index no longer serves anything, so its balance only falls. When the balance falls below minus its build cost times a patience factor, the container drops it.",
      "The default rent is 1e-5 ns per byte per operation: a 1 MB index pays about 10 ns per operation. At that rate this demo would take minutes. This lesson sets rent 100 times higher, so you see the drop in seconds.",
      "Patience is learned. If a dropped index is soon rebuilt, the drop was a mistake, and the container doubles the patience for that index. If the drop holds, patience shrinks by a quarter. After an automatic drop, a rebuild needs twice the evidence.",
      "Compare the memory of the two copies at the end. The frozen copy still holds every index it was given.",
    ],
    setup: {
      knobs: { ...BASE_KNOBS, rent: 1e-3, repeat: 6 }, locked: ALL_LOCKED, shownCopies: shown(0, 4),
      script: SCRIPTS.L6b,
      prepare: { script: SCRIPTS.L6a, passes: 3, message: "Preparing: 3 passes of customer lookups" },
      panels: ["timeline", "results", "inspector", "memory"],
    },
    action: { label: "Run", kind: "run" },
    focus: { before: "timeline", after: "inspector-row-customer" },
    cues: {
      afterRun: (s) => {
        const e = s.events.find((x) => x.type === "rent-drop");
        return e ? [{ seq: e.seq, text: "dropped for rent" }] : [];
      },
    },
    checks: [
      {
        id: "gone", text: "No index on customer is live", timed: false, failAfter: 6,
        test: (s, h) => {
          const k = h.live(s, "customer");
          return { pass: k.length === 0, measured: `customer: ${k.length ? `live (${k.join(", ")})` : "no index live"}` };
        },
        fallback: "The customer index is still live. Its balance has not run out yet. Run again.",
      },
      {
        id: "amount", text: "An index on amount is live", timed: false,
        test: (s, h) => {
          const k = h.live(s, "amount");
          return { pass: k.length > 0, measured: k.length ? `live: ${k.join(", ")} on amount` : "none live on amount" };
        },
        fallback: "No index on amount yet. Run again.",
      },
      {
        id: "rent-drops", text: "At least one drop for rent", timed: false,
        test: (s) => ({ pass: s.counters.rent_drops >= 1, measured: `${s.counters.rent_drops} drops for rent` }),
        fallback: "No drop for rent yet. Run again.",
      },
      {
        id: "smaller", text: "Adaptive holds less memory than the frozen copy", timed: false,
        test: (s, h) => {
          const a = h.bytes(s, 0);
          const b = h.bytes(s, 4);
          return { pass: a < b, measured: `${kb(a)} KB against ${kb(b)} KB` };
        },
        fallback: "Adaptive still holds as much memory as the frozen copy. Run again.",
      },
    ],
  },
  {
    id: "L7",
    title: "What adaptiveness costs",
    goal: "Measure the price of the learning phase and compare the adaptive copy with the best fixed choice.",
    copy: [
      "Adaptiveness has a price. The container pays it in three places.",
      "**The learning phase.** Before the first index exists, every query scans. The ski-rental rule bounds this at about one build per field and query shape. Look at pass 1: the adaptive copy is slower than the best fixed copy.",
      "**Sampling and trials.** Timing a probe costs two clock reads. A trial builds an index that may be dropped. Both decay: sampling falls to 1 call in 1 024, exploration to 1 in 4 096, while the ranking holds.",
      "**Memory.** The container holds the indexes the workload uses, and rent removes the rest. In the memory view, the best copies sit in the bottom left: fast and small. `grouped and sorted` is fast and large. The adaptive copy is close to the best hand-picked copy on both axes, without anyone picking.",
      "By pass 5 the adaptive copy is close to the best fixed copy. Natively it is within about 35 % of the best fixed single-kind container in 14 of 16 measured cases. If you know your workload and it never changes, a fixed set of indexes is the better tool: no learning phase, no sampling. multiview is for the case where you do not know, or where the workload moves.",
    ],
    setup: {
      knobs: { ...BASE_KNOBS, yoursMask: [1, 8, 0], repeat: 5 }, locked: ALL_LOCKED, shownCopies: shown(0, 1, 2, 3, 4, 5),
      script: SCRIPTS.L7, panels: ["timeline", "results", "memory"],
    },
    action: { label: "Run", kind: "run" },
    focus: { before: "timeline", after: "memory" },
    cues: { afterRun: () => [{ pass: 1, band: true, text: "learning phase" }] },
    checks: [
      {
        id: "learning", text: "Pass 1 costs at least 1.5× pass 5", timed: true,
        test: (s, h) => {
          const x = h.ratio(h.passNs(s, 0, 1), h.passNs(s, 0, 5));
          return { pass: x >= 1.5, x, measured: `pass 1 cost ${x1(x)}× pass 5` };
        },
        fallback: "Measured {x}×.",
      },
      {
        id: "close", text: "Adaptive is within 3× of the best fixed copy in pass 5", timed: true,
        test: (s, h) => {
          const best = Math.min(...[2, 3, 4, 5].map((k) => h.passNs(s, k, 5)));
          const x = h.ratio(h.passNs(s, 0, 5), best);
          return { pass: x <= 3, x, measured: `adaptive is ${x1(x)}× the best fixed copy in pass 5` };
        },
        fallback: "Measured {x}×. Run again; the container may still be in a trial.",
      },
      {
        id: "memory", text: "Adaptive holds less memory than grouped and sorted", timed: false,
        test: (s, h) => {
          const a = h.bytes(s, 0);
          const b = h.bytes(s, 4);
          return { pass: a < b, measured: `${kb(a)} KB against ${kb(b)} KB` };
        },
        fallback: "Adaptive holds as much memory as grouped and sorted. Run again.",
      },
    ],
  },
];

export const LESSON_BY_ID = Object.fromEntries(LESSONS.map((l) => [l.id, l]));

export const END_TEXT = "That is the whole mechanism. Free play unlocks every knob, all six copies and the editor. Start from an example or write your own workload.";
export const CLOCK_LINE = "Your browser's clock is too coarse for this measurement to be reliable. The lesson continues; the native numbers in the text are what you would see on a build with a fine clock.";

// {x} and {y} in a fallback come from the numbers the check returned.
export function fillFallback(text, r) {
  return text.replace("{x}", x1(r.x)).replace("{y}", x1(r.y));
}
