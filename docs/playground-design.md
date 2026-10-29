# Playground design spec

Status: design for implementation. Two implementers build it from this file
alone. Where this file says "must", there is no choice to make. Where a value
is given (a size, a colour, a threshold), use that value.

Contents:

1. Purpose and audience
2. Facts the design depends on (the wasm API as it is)
3. The run model
4. Lessons (the guided path, with full copy)
5. Free play
6. Visualization
7. The editor (work package A)
8. Layout and visual design
9. Engineering structure, state and interfaces
10. Work packages and integration contract
11. C++ changes
12. Acceptance checklist

## 1. Purpose and audience

The reader is a senior engineer who has never seen multiview. After the
guided path, the reader can explain:

- why a scan stops scaling and an index does not;
- what an index costs: write time and memory;
- that no index kind wins every regime;
- how the container decides by measurement: the ski-rental build rule, trials,
  rent and patience;
- what the reader pays for adaptiveness: the learning phase, sampling and memory.

The page reads like a technical article with live figures. Each figure answers
one question, and the text next to it says what to look at.

## 2. Facts the design depends on

These facts come from `playground/playground.cpp` and `include/multiview.hpp`.
The design uses only these, plus the one optional change in section 11.

**The table.** One table of orders, `Row { customer, amount, day }`, all
`uint64`. `pg_reset(n, ...)` fills it with `n` rows: `customer` in
`[0, max(10, n/20))` (2500 customers at 50 000 rows, about 20 rows per
customer), `amount` in `[0, 99 999]`, `day` in `[0, 364]`.

**The six copies** receive the same operations, in this order (index = copy id):

| id | JSON name | What it is |
|---|---|---|
| 0 | `adaptive` | the container, all six kinds allowed on every field, chooses |
| 1 | `scan only` | no index |
| 2 | `grouped only` | a grouped hash on every field, built once |
| 3 | `sorted only` | an `ordered` index on every field, built once |
| 4 | `grouped and sorted` | both on every field, built once |
| 5 | `yours` | the kinds picked per field (bit masks), built once |

**Exports** (all through `cwrap`):

| Function | Signature | Effect |
|---|---|---|
| `pg_reset` | `(n, seed, eagerness, max_index_kb, rent, mask0, mask1, mask2)` | rebuild all copies. Masks: bit 0 grouped, 1 swiss, 2 dense, 3 ordered, 4 sorted-array, 5 hash |
| `pg_run` | `(ops, weightsPtr, skew)` | the old workload mix. The new page does not use it |
| `pg_exec` | `(opsPtr, nOps, nLabels)` | run compiled ops on all six copies, timed per label |
| `pg_exec_json` | `() -> string` | result of the last `pg_exec` |
| `pg_json` | `() -> string` | state: adaptive indexes, counters, five fixed plans |
| `pg_explain` | `(opRecordPtr) -> string` | the adaptive copy's plan for one op record |

**`pg_exec_json`**: `{ ops, first_disagreement, variants: [{ name, ns, bytes, labels: [ns per op per label] }] }`.
`first_disagreement` is `-1` when all copies give the same answers.

**`pg_json`** fields used: `n`, `indexes: [{ field, kind, live, probe_ns, build_ms, uses, bytes }]`
(18 entries: every field times every kind, also the ones never built),
`counters: { scans, probes, walks, builds, drops, rent_drops, trials }`.
Its `variants` field holds `pg_run` data; the new page ignores it.

**Kind names** in JSON: `grouped`, `swiss`, `dense`, `ordered`, `sorted-array`, `hash`.

**Plan text** from `pg_explain` has three forms, plus suffixes:
`scan N elements`, `probe K index on F (equality|range)`,
`walk K index on F ascending|descending`; suffixes `, filter N predicate(s)`,
`, sort by F ascending|descending`, `, limit N`.

**Two behaviours the design must respect:**

1. `pg_exec` sorts the ops by label index (stable) before it runs them. Labels
   get their index in order of first use. So a script runs as phases, one per
   label, in order of first appearance. Ops of one label keep their order.
2. Timing uses `emscripten_get_now()`, so its resolution is the browser's:
   about 5 µs with cross-origin isolation (`make serve`), 100 µs or more
   without. A label group whose total time on a copy is near the resolution
   gives a meaningless ns per op.

**Not available in JSON:** an index's balance, rent paid, patience, and the
time inside a run when a build happened. Section 11 lists the optional change
that adds balance and patience. Without it, the inspector shows the fields that
exist and derives reasons from counters and snapshots (section 6.4).

## 3. The run model

A **run** is one press of Run: the current script is compiled once and executed
`repeat` times. Each execution is a **pass**. A pass is split into **slices**
so the timeline has more than one point per pass and builds show where they
happen.

- Before the copy, the runner sorts the compiled ops by label index (stable sort,
  field 1 of each record). This is the order `pg_exec` would use anyway. After the
  sort, buffer order equals execution order, so a contiguous slice of the buffer
  is a contiguous part of the pass. The runner keeps `orderMap[original] = sorted`
  and maps the editor's `shapes` through it before it calls `explain`.
- The sorted op buffer is copied once into wasm memory (`_malloc`).
- A pass calls `pg_exec(ptr + start*128, count, nLabels)` once per slice, where
  128 is 16 doubles times 8 bytes. `nLabels` is always the full label count of
  the script, so `labelNs` indexes stay the same in every slice.
- Slice count per pass: `slices = clamp(round(nOps / 500), 1, 10)`. Slice size:
  `size = ceil(nOps / slices)`. Slice `i` covers ops `[i*size, min(nOps, (i+1)*size))`.
  A slice can hold the end of one label and the start of the next; that is
  correct, because `labelNs` reports each label separately.
- After each slice: read `pg_exec_json()` and `pg_json()`, push one **sample**
  into the store, then `await` a 0 ms timeout so the page paints.
- Between passes: nothing resets. The adaptive copy keeps learning.

A **sample** (one point on the timeline):

```js
{
  seq: 17,            // global sample counter since the last reset
  pass: 3,            // 1-based pass number since the last reset
  slice: 2,           // 0-based slice within the pass
  ops: 412,           // ops in this slice
  labels: ["(default)", "lookup"],   // label names of the script
  labelOps: [0, 412], // ops per label in this slice, counted in JS from the sorted buffer
  copies: [           // 6 entries, by copy id
    { ns: 1234.5, bytes: 1048576, labelNs: [0, 1234.5], noisy: false, labelNoisy: [false, false] }
  ],
  agree: true,        // first_disagreement < 0
  indexes: [ /* pg_json().indexes */ ],
  counters: { /* pg_json().counters */ },
  events: [ /* derived, see below */ ]
}
```

`noisy` is true when `ns * ops / 1e6` (the copy's total ms in this slice) is
below `10 * timerResMs`. `labelNoisy[l]` applies the same test to the label's
time (`labelNs[l] * labelOps[l] / 1e6`). `timerResMs` is measured once at start
with the loop the current page uses (`timerResolution()`), converted to ms.
`labelNs[l]` is 0 when `labelOps[l]` is 0. Every consumer (chart, table,
check helpers) skips such entries; 0 never means "free".

**Events** are derived by diffing the sample's `indexes` and `counters`
against the previous sample:

| Event type | Condition | Text template |
|---|---|---|
| `build` | an index went from not live to live | `built {kind} on {field} ({build_ms} ms)` |
| `drop` | an index went from live to not live, and `rent_drops` did not grow | `dropped {kind} on {field} (lost a comparison or not used)` |
| `rent-drop` | as above, and `rent_drops` grew by at least 1 | `dropped {kind} on {field}: could not pay its rent` |
| `trial` | `trials` grew | `started a trial of a second kind` |
| `disagree` | `agree` is false | `copies disagree at op {n}` (a bug; show in red) |

If several indexes dropped in one slice and `rent_drops` grew by fewer, mark the
first ones (in `indexes` order) as `rent-drop` up to the increase.

**Reset** calls `pg_reset(rows, seed, eagerness, maxIndexKb, rent, m0, m1, m2)`
with the store's knob values, clears samples and events, and reads `pg_json()`
once for the index state. Seed: `1` in lessons (reproducible), random in free
play unless the URL hash gives one.

**Time budget.** Before a run, estimate the scan copy's cost from the last pass
(`scan ns * nOps * repeat`). If the estimate is above 8 s, show a confirm in
the run bar: "This run will take about {s} s, mostly in the scan-only copy.
Run anyway?" with buttons Run and Cancel. A Stop button ends a run after the
current slice.

## 4. Lessons

Seven lessons, then free play. Each lesson has a goal, a setup, one action, a
focus, the copy, and checks. The lesson engine (section 9.6) applies the setup,
shows the copy, highlights the focus, and evaluates the checks after every pass.

**Checks.** Each check is a function over the store that returns
`{ pass: boolean, measured: string }`. A check is either **exact** (index state,
counters, bytes: these do not depend on timing noise) or **timed**. The panel
shows each check as a line with a status icon: pending (hollow circle), pass
(check mark), fail (cross). A timed check that fails shows its fallback message
and the button "Run again". After 3 failed attempts of the lesson action, the
panel shows the line "Your browser's clock is too coarse for this measurement
to be reliable. The lesson continues; the native numbers in the text are what
you would see on a build with a fine clock." and enables Next. Next is always
enabled; the checks never block the reader. A passed check stays passed until the
lesson resets.

**Timed checks use medians.** "adaptive ns on label L in pass P" means the
median of the non-noisy slice values for that label and copy in that pass. If
all slices are noisy, use the pass total (sum over slices of `labelNs[l] * labelOps[l]`) divided by the
op count of that label. A value marked noisy is shown as "< {resolution-bound} ns".

Copy below is final. Implement it verbatim. `{x}` is a value the engine fills.

### Lesson 1: A scan grows with the table

- **Goal:** See that the cost of a scan grows with the number of rows, and an index lookup does not.
- **Setup:** copies shown: `scan only`, `grouped only`. Knobs locked. Editor read-only.
  Script `L1` (below). Mode: **sweep** over rows `[1000, 10000, 50000, 200000]`,
  one pass per size, reset before each size.
- **Action:** Press "Run sweep".
- **Focus:** the sweep chart (section 6.2). Annotation at the 200 000 point of the
  scan line: "{x}× the cost at 1 000 rows".
- **Copy:**

  > A query with no index reads every row. Twice the rows, twice the time.
  >
  > Press **Run sweep**. The playground builds the table at four sizes and runs
  > the same 400 lookups by customer on each. The red line is the scan-only copy.
  > The blue line has a hash index on every field.
  >
  > The scan line climbs about as fast as the table grows. The indexed line stays
  > nearly flat: a hash lookup jumps to the right bucket, so its cost depends on
  > the number of matching rows, not on the size of the table.
  >
  > At 1 000 rows the difference is small. At 200 000 rows it is two to three
  > orders of magnitude. A design that is correct at 1 000 rows is not correct at
  > a million.

- **Script `L1`:**

  ```js
  // 400 lookups by customer. Each matches about 20 rows.
  for (let i = 0; i < 400; i++) {
    label("lookup");
    where(customer.eq(rnd(rows / 20))).count();
  }
  ```

- **Checks:**
  1. timed: `scan ns at 200000 >= 40 * scan ns at 1000`. Measured text: "scan grew {x}× from 1 000 to 200 000 rows". Fallback: "The ratio came out at {x}×. A coarse browser clock blurs the small sizes. Press Run again."
  2. timed: `scan ns at 200000 >= 20 * grouped ns at 200000`. Measured: "scan is {x}× slower than the index at 200 000 rows". Fallback: "Expected at least 20×, measured {x}×."

### Lesson 2: An index pays for itself

- **Goal:** See the adaptive copy scan first, then build an index once the scans have cost as much as a build.
- **Setup:** rows 50 000, seed 1, copies shown: `adaptive`, `scan only`, `grouped only`.
  Knobs locked. Script `L2`. Repeat 3. Inspector visible, plan view visible.
- **Action:** Press "Run".
- **Focus:** the timeline. Highlight the first `build` marker with the cue
  "the build happens here". After the run, highlight the inspector card for the
  live index on `customer`.
- **Copy:**

  > The adaptive copy starts with no index. Nobody told it which queries come.
  >
  > Each scan it runs is timed and charged to the field it filtered on, here
  > `customer`. The container also knows what a build costs: it measures the
  > build time per row. When the scans charged to `customer` add up to one
  > build, it builds.
  >
  > This is the ski-rental rule. You rent skis until the rent paid equals the
  > price of skis, then you buy. If you stop skiing the next day, you paid at
  > most twice the best price. Here: the container never wastes more than one
  > build's worth of scans, and an index that turns out useless costs at most
  > about one build.
  >
  > Press **Run**. The green line follows the red one at first, then drops to the
  > blue one after the build marker. From the second pass on, the adaptive copy
  > runs at index speed. The plan view shows the switch in words: from
  > "scan 50000 elements" to "probe grouped index on customer".

- **Script `L2`:**

  ```js
  // 2000 lookups by customer, some customers more popular than others.
  for (let i = 0; i < 2000; i++) {
    label("lookup");
    where(customer.eq(zipf(rows / 20, 0.5))).count();
  }
  ```

- **Checks:**
  1. exact: at least one index on `customer` is live. Measured: "live: {kind} on customer". Fallback (only after pass 3): "No index yet. Raise the repeat count to 6 and run again."
  2. exact: `counters.builds >= 1` and the first `build` event is in pass 1. Measured: "first build in pass {p}, slice {s}".
  3. timed: adaptive ns on `lookup` in pass 3 `<= scan ns / 20`. Measured: "adaptive is {x}× faster than scan in pass 3". Fallback: "Expected at least 20×, measured {x}×. Index probes are fast enough that a coarse clock cannot time them well."

### Lesson 3: What an index costs

- **Goal:** See that every index slows down writes and holds memory, whether queries use it or not.
- **Setup:** rows 50 000, seed 1, copies shown: `scan only`, `grouped only`, `sorted only`,
  `grouped and sorted`. Adaptive hidden. Knobs locked. Script `L3`. Repeat 1.
  Results table shows the per-label columns and the KB column. Memory view visible.
- **Action:** Press "Run".
- **Focus:** the results table, columns `update` and `index KB`. Cue on the
  `update` column header: "the same 20 000 writes on every copy".
- **Copy:**

  > An index is a second copy of part of the table, kept in another order. Every
  > write must update it.
  >
  > This script reads, then changes `amount` 20 000 times, then replaces 5 000 rows.
  > Look at the `update` column. The scan-only copy only writes the row. The
  > others also move the row inside each index on `amount`. A sorted index pays
  > the most, because it keeps keys in order and shifts entries to make room.
  >
  > Now look at `index KB`. The scan-only copy holds nothing. The copy with both
  > kinds on every field holds the most, and it holds it whether or not a query
  > uses it. `day` has an index on three copies here, and no query in this script
  > filters on `day`.
  >
  > An index trades write time and memory for read time. That trade is good only
  > if the reads come.

- **Script `L3`:**

  ```js
  // Reads, then a burst of writes to amount, then churn.
  for (let i = 0; i < 1000; i++) { label("read"); where(customer.eq(rnd(rows / 20))).count(); }
  for (let i = 0; i < 20000; i++) { label("update"); update(rnd(rows), rnd(100000)); }
  for (let i = 0; i < 5000; i++) { label("churn"); churn(rnd(rows), rnd(rows / 20), rnd(100000), rnd(365)); }
  ```

- **Checks:**
  1. timed: `sorted only` ns on `update` `>= 3 *` `scan only` ns on `update`. Measured: "a write costs {x}× more with sorted indexes". Fallback: "Measured {x}×. Writes to the scan-only copy are so cheap that the clock may round them to zero. Press Run again."
  2. exact: bytes: `grouped and sorted` > `grouped only` > 0, `sorted only` > 0, `scan only` == 0. Measured: "{a} KB, {b} KB, {c} KB, 0 KB".

### Lesson 4: No kind wins everywhere

- **Goal:** See that each index kind wins one kind of query and loses another, and pick kinds for the `yours` copy.
- **Setup:** rows 50 000, seed 1, copies shown: `grouped only`, `sorted only`, `yours`, `scan only`.
  Unlocked: the kind grid for `yours` (section 6.6). Initial masks for `yours`: all
  zero (it starts as a second scan copy). Script `L4`. Repeat 2.
- **Action:** In the kind grid, tick `dense` on `day` and `sorted-array` on `amount`, then press "Apply and run".
  ("Apply and run" resets the table with the new masks and runs.)
- **Focus:** the results table, rows for the three labels. Cue on the kind grid
  before the action: "pick one kind per field, then apply".
- **Copy:**

  > Six index kinds ship with multiview. Each one wins somewhere and loses
  > somewhere else.
  >
  > - A hash (`grouped`, `swiss`, `hash`) answers equality only. Ask it for a
  >   range and the copy falls back to a scan. Look at `grouped only` on
  >   `amount range`.
  > - A sorted kind (`ordered`, `sorted-array`) answers equality, ranges and order.
  >   It pays for that with slower lookups and slower writes than a hash.
  > - `dense` is one array slot per key value. It works only when the keys are
  >   integers in a small range, like `day` (365 values). There it is the fastest
  >   lookup of all.
  >
  > Measured natively at a million rows with 64 rows per key: `dense` 40 ns,
  > `grouped` 69 ns, `sorted-array` 113 ns, `ordered` 318 ns, `hash` 1 377 ns.
  > With unique keys the order changes: `hash` 21 ns, `swiss` 26 ns, `grouped`
  > 28 ns. (Source: docs/KINDS.md.)
  >
  > Tick `dense` on `day` and `sorted-array` on `amount` for your copy, then press
  > **Apply and run**. Your copy now wins two of the three columns. Which kind
  > is right depends on the key distribution and on the queries. That is the
  > reason the container measures instead of guessing.

- **Script `L4`:**

  ```js
  // Three query shapes, three different best kinds.
  for (let i = 0; i < 1500; i++) { label("day = ?"); where(day.eq(rnd(365))).count(); }
  for (let i = 0; i < 1500; i++) { label("amount range"); const a = rnd(99000); where(amount.between(a, a + 500)).count(); }
  for (let i = 0; i < 1500; i++) { label("customer = ?"); where(customer.eq(rnd(rows / 20))).count(); }
  ```

- **Checks:**
  1. timed: `grouped only` ns on `amount range` `>= 10 *` `sorted only` ns on `amount range`. Measured: "the hash-only copy is {x}× slower on ranges". Fallback: "Measured {x}×."
  2. exact: the `yours` mask has bit 2 on `day` (index 2) and bit 3 or 4 on `amount` (index 1). Measured: "yours: {kinds per field}".
  3. timed (after the action): `yours` ns on `amount range` `<= 2 *` `sorted only` ns on `amount range`, and `yours` ns on `day = ?` `<= 2 *` `grouped only` ns on `day = ?`. Measured: "yours vs best: {x}×, {y}×". Fallback: "Your copy is within {x}× of the best. Small differences are noise in a browser."

### Lesson 5: How the container chooses a kind

- **Goal:** See the container build a second kind for the same field, measure both, and keep the cheaper one.
- **Setup:** rows 50 000, seed 1, copies shown: `adaptive`, `grouped only`, `sorted only`.
  Script `L5`. Repeat 8. Inspector visible and focused. Plan view visible.
- **Action:** Press "Run".
- **Focus:** the inspector, the `customer` row of cards. Cue on the trials counter
  in the inspector header: "trials".
- **Copy:**

  > The first index the container builds is a guess: the first kind in the
  > declaration that can answer the query. It may not be the fastest kind for
  > this data.
  >
  > So the container keeps measuring. One probe in 16 is timed at first; the
  > interval grows to 1 in 1 024 while nothing changes. When the live index has
  > spent as much time probing as its build took, the container builds one other
  > kind for the same field. This is a **trial**. Now two kinds answer the same
  > query, and the planner sends each call to the one with the lower cost:
  > probe time, plus write time weighted by how often the field is written,
  > plus memory rent.
  >
  > The loser is still probed now and then, so its estimate stays fresh. If it
  > stays the loser, it earns nothing, pays rent, and is dropped.
  >
  > Press **Run** and watch the `customer` cards in the inspector. A card turns
  > live, a second one joins it, and one of them later goes grey with the reason
  > "lost the comparison".

- **Script `L5`:**

  ```js
  // Lookups by customer, a few by day, for 8 passes.
  for (let i = 0; i < 3000; i++) {
    label("customer = ?");
    where(customer.eq(zipf(rows / 20, 0.3))).count();
  }
  for (let i = 0; i < 500; i++) { label("day = ?"); where(day.eq(rnd(365))).count(); }
  ```

- **Checks:**
  1. exact: `counters.trials >= 1`. Measured: "{n} trials". Fallback (after pass 8): "No trial yet: the live index has not yet spent its build time on probes. Run again; trials need more probes when probes are cheap."
  2. exact: at least two distinct kinds on `customer` were live in some sample since the reset. Measured: "kinds tried on customer: {list}".
  3. exact: exactly one or two kinds on `customer` are live at the end. Measured: "live now: {list}".

### Lesson 6: Unused indexes pay rent and go

- **Goal:** See an index that no longer serves queries lose its balance to rent and get dropped, while a new one is built.
- **Setup:** rows 50 000, seed 1, rent `1e-3` (100× the default), copies shown:
  `adaptive`, `grouped and sorted`. Script `L6a` runs first as part of the setup
  (3 passes, automatic, with the line "Preparing: 3 passes of customer lookups"),
  then the editor shows `L6b`. Repeat 6. Rent knob visible but locked, with its
  value shown.
- **Action:** Press "Run" (runs `L6b`).
- **Focus:** the timeline (the `rent-drop` marker) and the inspector card for
  `customer`. Cue on the marker: "dropped for rent".
- **Copy:**

  > The workload changed. The first three passes only looked up customers. The
  > new script only asks for ranges of `amount`.
  >
  > Every live index pays rent: a price per byte per operation, charged on every
  > operation the container serves. An index earns credit when it serves a
  > query: the scan time it saved. The customer index no longer serves anything,
  > so its balance only falls. When the balance falls below minus its build cost
  > times a patience factor, the container drops it.
  >
  > The default rent is 1e-5 ns per byte per operation: a 1 MB index pays about
  > 10 ns per operation. At that rate this demo would take minutes. This lesson
  > sets rent 100 times higher, so you see the drop in seconds.
  >
  > Patience is learned. If a dropped index is soon rebuilt, the drop was a
  > mistake, and the container doubles the patience for that index. If the drop
  > holds, patience shrinks by a quarter. After an automatic drop, a rebuild needs
  > twice the evidence.
  >
  > Compare the memory of the two copies at the end. The frozen copy still holds
  > every index it was given.

- **Script `L6a`:**

  ```js
  for (let i = 0; i < 3000; i++) { label("customer = ?"); where(customer.eq(rnd(rows / 20))).count(); }
  ```

- **Script `L6b`:**

  ```js
  // The workload moved: only ranges of amount now.
  for (let i = 0; i < 3000; i++) {
    label("amount range");
    const a = rnd(99000);
    where(amount.between(a, a + 300)).count();
  }
  ```

- **Checks:**
  1. exact: no index on `customer` is live. Measured: "customer: {state}". Fallback (after pass 6): "The customer index is still live. Its balance has not run out yet. Run again."
  2. exact: an index on `amount` is live. Measured: "live: {kind} on amount".
  3. exact: `counters.rent_drops >= 1`. Measured: "{n} drops for rent".
  4. exact: adaptive bytes `<` `grouped and sorted` bytes. Measured: "{a} KB against {b} KB".

### Lesson 7: What adaptiveness costs

- **Goal:** Measure the price of the learning phase and compare the adaptive copy with the best fixed choice.
- **Setup:** rows 50 000, seed 1, rent default, all six copies shown. `yours`
  masks: grouped on customer (1), ordered on amount (8), none on day (0). Script
  `L7`. Repeat 5. Memory view visible and focused after the run.
- **Action:** Press "Run".
- **Focus:** pass 1 against pass 5 of the adaptive line (cue band over pass 1:
  "learning phase"), then the memory view.
- **Copy:**

  > Adaptiveness has a price. The container pays it in three places.
  >
  > **The learning phase.** Before the first index exists, every query scans. The
  > ski-rental rule bounds this at about one build per field and query shape. Look
  > at pass 1: the adaptive copy is slower than the best fixed copy.
  >
  > **Sampling and trials.** Timing a probe costs two clock reads. A trial builds
  > an index that may be dropped. Both decay: sampling falls to 1 call in 1 024,
  > exploration to 1 in 4 096, while the ranking holds.
  >
  > **Memory.** The container holds the indexes the workload uses, and rent
  > removes the rest. In the memory view, the best copies sit in the bottom left:
  > fast and small. `grouped and sorted` is fast and large. The adaptive copy is
  > close to the best hand-picked copy on both axes, without anyone picking.
  >
  > By pass 5 the adaptive copy is close to the best fixed copy. Natively it is
  > within about 35 % of the best fixed single-kind container in 14 of 16
  > measured cases. If you know your workload and it never changes, a fixed set of
  > indexes is the better tool: no learning phase, no sampling. multiview is for
  > the case where you do not know, or where the workload moves.

- **Script `L7`:**

  ```js
  // Three phases: lookups, ranges, top 10. Each is a different index.
  for (let i = 0; i < 2000; i++) { label("customer = ?"); where(customer.eq(rnd(rows / 20))).count(); }
  for (let i = 0; i < 1000; i++) { label("amount range"); const a = rnd(99000); where(amount.between(a, a + 300)).count(); }
  for (let i = 0; i < 1000; i++) { label("top 10"); all().orderBy(amount, true).limit(10).sumAmount(); }
  ```

- **Checks:**
  1. timed: adaptive pass total ns in pass 1 `>= 1.5 *` adaptive pass total in pass 5. Measured: "pass 1 cost {x}× pass 5". Fallback: "Measured {x}×."
  2. timed: adaptive pass-5 ns `<= 3 *` the minimum pass-5 ns of copies 2 to 5. Measured: "adaptive is {x}× the best fixed copy in pass 5". Fallback: "Measured {x}×. Run again; the container may still be in a trial."
  3. exact: adaptive bytes `<` `grouped and sorted` bytes. Measured: "{a} KB against {b} KB".

### After lesson 7

The panel shows: "That is the whole mechanism. Free play unlocks every knob,
all six copies and the editor. Start from an example or write your own
workload." Button: "Open free play".

## 5. Free play

Free play unlocks: all six copies (toggle per copy), rows (1 000, 10 000,
50 000, 200 000), eagerness (0.1 to 2, step 0.1), index memory limit in KB
(0 = none), rent (log slider: 0, 1e-6, 1e-5, 3e-5, 1e-4, 1e-3), seed, the kind
grid for `yours`, the repeat count (1 to 50), and the editor in write mode.
Changing rows, eagerness, memory limit, rent, seed or the kind grid marks the
table "stale"; the run bar shows "Reset to apply" and Run calls reset first.

The lesson list stays visible as a rail (section 8); the reader can open any
lesson at any time. Opening a lesson replaces the free-play state; the engine
saves the free-play script and knobs first and restores them when the reader
returns to free play.

## 6. Visualization

All charts are hand-drawn on `<canvas>` with device-pixel-ratio scaling, as
today. No chart library. Every chart has a text alternative (section 8.8).

### 6.1 Timeline chart

- **Question it answers:** how fast is each copy, over time, and what did the adaptive copy do when.
- **x axis:** sample `seq`. Ticks at pass boundaries, labelled `pass 1`, `pass 2`, ...
  A thin vertical rule (token `--grid-strong`) marks each pass boundary. At least
  30 sample slots wide, so early runs do not stretch.
- **y axis:** ns per op, log10 scale, range from `max(10, min * 0.5)` to `max * 2`
  over the shown copies, snapped outward to decades. Gridlines at each decade,
  labelled `10 ns`, `100 ns`, `1 µs`, `10 µs`, `100 µs`, `1 ms`. Minor ticks (no
  labels) at 2× and 5×.
- **Against log-scale confusion:** (1) the axis title reads
  "time per operation (log scale: each line is 10× the one below)"; (2) every
  line has a direct label at its right end: copy name and last value
  (`scan only 412 µs`), with labels moved apart vertically so they do not
  overlap (minimum 14 px gap); (3) a toggle "Show as speed-up vs scan" replaces
  the y axis with `scan ns / copy ns` on a linear axis from 1× to the max, the
  scan line becomes the flat line at 1×; (4) the tooltip states ratios in words.
- **Series:** one line per shown copy, colour token `--copy-N`, line width 2.5 px
  for adaptive and 1.5 px for others, dash pattern per copy (section 8.4), and a
  marker every sample (shape per copy, 3 px radius) so lines differ without
  colour. Noisy samples draw a hollow marker and the segment into them at 40 %
  opacity.
- **Value source:** by default the sample's `copies[k].ns` (all labels). A
  select above the chart, "Show: all operations | {label names}", switches to
  `labelNs[l]`.
- **Event markers:** in a 16 px strip under the plot area. `build`: upward
  triangle, token `--event-build`. `drop`: downward triangle, `--event-drop`.
  `rent-drop`: downward triangle with a horizontal bar, `--event-drop`. `trial`:
  diamond, `--event-trial`. Each marker also draws a 1 px dotted vertical line
  through the plot at 50 % opacity.
- **Lesson cues:** a cue is `{ seq | pass, text }`. It draws a rounded label
  above the plot (token `--cue-bg`, text `--cue-ink`) with a leader line to the
  x position, or a translucent band over a pass for `{ pass, band: true }`.
- **Tooltip:** on pointer move or keyboard focus (left and right arrows move
  between samples when the canvas has focus). Content, in this order:
  1. `Pass 3, slice 2 (412 ops)`
  2. one row per shown copy: swatch with dash, name, ns, and "{x}× faster than scan" or "{x}× slower than scan"
  3. events in this sample, one per line, with the marker glyph
  4. if any value is noisy: "Values with hollow markers are below the clock's resolution."

### 6.2 Sweep chart (lesson 1 and free play "Sweep")

- x: rows, log10, ticks at the four sizes, labelled `1k`, `10k`, `50k`, `200k`.
- y: ns per op, log10 as in 6.1.
- One line with markers per shown copy. A dashed grey reference line through the
  scan's first point with slope 1 (labelled "proportional to rows").
- Annotation from the lesson at the last scan point.
- Free play has a "Sweep" button that runs the current script once per size.

### 6.3 Results table

One row per copy, in copy-id order, hidden copies omitted. Columns, in order:

| Column | Content | Format |
|---|---|---|
| (swatch) | colour swatch with the copy's dash and marker | 24 px |
| Copy | copy name | text |
| ns / op | last pass, all labels | `fmtNs`, right aligned, mono |
| vs scan | `scan ns / ns` | `12.4×`, or `—` for scan itself |
| one column per label (if the script has 2 or more used labels) | last pass, per label | `fmtNs`; best per column in `--good` and bold; noisy as `< {bound}` in `--muted` |
| Index KB | `bytes / 1024` | integer |
| Answers | check mark if `agree` | icon |

`fmtNs`: `< 1000` as `412 ns`, `< 1e6` as `41.2 µs`, else `4.12 ms`. A 4 px bar
under each ns cell shows the value on the same log scale as the chart, in the
copy's colour. A caption under the table: "Last pass. Lower is better. Best
in each column in bold."

### 6.4 Index inspector

Shows the adaptive copy. A header line, then a grid of cards: three rows (one per
field: customer, amount, day), six cards per row (one per kind, in the order
grouped, swiss, dense, ordered, sorted-array, hash). On phone width each field
row scrolls horizontally.

**Header line:** `{live count} live, {KB} KB · scans {n} · probes {n} · walks {n} · builds {n} · drops {n} ({rent_drops} for rent) · trials {n}`.

**Card fields, in order:**

1. kind name (bold) and a state badge: `live` (`--good`), `dropped` (`--muted`, strikethrough-free, grey border), `trial` (`--event-trial`), `never built` (dashed outline, no fill).
2. `probe` — `probe_ns` as `fmtNs`, or `—` if 0.
3. `uses` — `uses` with thousands separators.
4. `memory` — `bytes / 1024` KB, or `—` if not live.
5. `build` — `build_ms` with 1 decimal, `ms`.
6. `balance` — only if the JSON has `balance` (section 11): a small horizontal bar from `-limit` to `+cap`, zero mark in the middle, filled in `--good` above zero and `--event-drop` below.
7. reason badge (one line, `--muted`, 12 px).

**State derivation** (per card, from the sample history since reset):
`live` if `live`. `trial` if live and another kind on the same field became live
in an earlier sample and is still live, and this one became live later, and
`trials` grew in the sample where it became live. `dropped` if not live and it
was live in any sample since reset. `never built` otherwise.

**Reason badge rules** (first match wins):

| Condition | Text |
|---|---|
| never built, field never queried in this script | "no query filters on {field}" |
| never built, field queried, kind cannot answer the shape (a hash kind and only range or order queries) | "cannot answer ranges" |
| never built otherwise | "not tried yet" |
| live, first live kind on this field | "built: scans on {field} cost as much as a build" |
| live, state `trial` | "trial: compared with {other kind}" |
| live, two kinds live, this one has lower `probe_ns` | "preferred: {x}× faster than {other}" |
| live, two kinds live, this one slower | "slower twin: earns nothing, pays rent" |
| dropped by a `rent-drop` event | "dropped: could not pay its rent" |
| dropped by a `drop` event while another kind on the field stayed live | "dropped: lost the comparison with {other}" |
| dropped otherwise | "dropped: not used" |
| `dense` dropped within the same sample it was built | "dropped: keys too spread for dense" |

A card changes state with a 600 ms background flash (section 8.6). Clicking a
card (or Enter when focused) scrolls the event log to the events of that index.

**Event log** under the cards: newest first, at most 200 entries, each
`[pass.slice] {marker glyph} {text}`. `aria-live="polite"`, but only new
`build`, `drop`, `rent-drop` events are announced (max one announcement per
second, merged as "{n} index changes").

### 6.5 Plan view

One row per distinct query shape of the script (the editor provides shapes,
section 7.6), at most 12. Each row:

1. the shape in DSL form, mono (`where(customer.eq(?)).count()`)
2. the raw plan string from `pg_explain`, mono, `--muted`
3. a sentence in words, built from the plan by these rules:

| Plan starts with | Sentence |
|---|---|
| `scan N elements` | "Reads all {N} rows and tests each one. No index can answer this yet." |
| `probe K index on F (equality)` | "Looks up the matching rows in the {K} index on {F}, then reads only those." |
| `probe K index on F (range)` | "Finds the first key in range in the {K} index on {F} and walks to the last." |
| `walk K index on F ascending/descending` | "Walks the {K} index on {F} in order and stops after the limit." |

Then one clause per suffix: `filter N predicate(s)` → "Each candidate is
checked against {N} predicate(s)." `sort by F` → "The results are sorted by {F}
afterwards, which costs more than an ordered walk." `limit N` → "Stops at {N}
results."

4. the cost reasoning, one line: for a scan, "Cost grows with the table:
about {scan ns} per query now." For a probe or walk on a live index with
`probe_ns > 0`: "Measured {probe_ns} per probe, against {scan ns} for a scan:
{x}× cheaper." Values come from the last sample (scan ns = scan copy's ns for
that label if the shape has a single label, else the scan copy's all-op ns).

Plans refresh after every pass (not every slice).

### 6.6 Kind grid for `yours`

A table: rows customer, amount, day; columns the six kinds; a checkbox per cell.
`dense` on `amount` shows the tooltip "Works at 50 000 rows; refuses ranges wider
than 8 × rows + 1 024." The grid writes `store.knobs.yoursMask` (three ints).

### 6.7 Memory against time

A scatter plot. One point per shown copy.

- x: index memory in KB, linear from 0, ticks at nice steps.
- y: ns per op of the last pass, log10 as in 6.1.
- Point: the copy's marker shape at 6 px radius in its colour, labelled with the name.
- A faint arrow from the adaptive copy's pass-1 position to its current position
  (the adaptive copy moves; the frozen copies do not move on x).
- A corner label in the bottom left: "better: fast and small".
- Text alternative: the same numbers as a two-column list.

## 7. The editor (work package A)

A self-written code editor in vanilla JS. No third-party library: the DSL is
small, and a textarea overlay with a highlighted `<pre>` behind it covers every
requirement in about 1 000 lines. This keeps the page at zero dependencies and
avoids a licence review.

### 7.1 Structure

```
<div class="ed" role="group" aria-label="Workload script editor">
  <div class="ed-gutter" aria-hidden="true">  line numbers, error dots </div>
  <div class="ed-body">
    <pre class="ed-hl" aria-hidden="true"><code>  highlighted tokens  </code></pre>
    <textarea class="ed-input" spellcheck="false" autocapitalize="off"
              aria-label="Workload script" aria-describedby="ed-status"></textarea>
    <div class="ed-squiggles" aria-hidden="true"> error underlines </div>
  </div>
  <ul class="ed-complete" role="listbox" hidden> autocomplete items </ul>
  <div class="ed-sig" role="tooltip" hidden> signature help or hover doc </div>
  <div class="ed-status" id="ed-status" aria-live="polite"> line, column, error text </div>
</div>
```

The textarea has transparent text and a visible caret (`caret-color: var(--ink)`).
The `<pre>` and the textarea share the exact font, size, line height (20 px),
padding, `tab-size: 2`, and `white-space: pre`; no wrapping. Scroll is synced
from the textarea to the `<pre>`, the gutter and the squiggle layer on every
`scroll` event. Height: 18 lines (360 px) on desktop, 14 lines on phone,
resizable vertically.

Rendering: re-tokenize and re-render the whole text on `input`, throttled with
`requestAnimationFrame`. Scripts are under 300 lines; a full render is cheap.

### 7.2 Tokenizer

A single-pass scanner over the text. Token types and CSS classes:

| Type | Rule | Class |
|---|---|---|
| `comment` | `//` to end of line; `/*` to `*/` (may span lines) | `tk-com` |
| `string` | `"..."`, `'...'`, `` `...` `` with backslash escapes; unterminated ends at line end | `tk-str` |
| `number` | `/\d[\d_]*(\.\d+)?([eE][+-]?\d+)?/`, also `0x[0-9a-fA-F]+` | `tk-num` |
| `keyword` | `for let const var if else while do break continue return function true false null undefined new of in` | `tk-kw` |
| `field` | identifier `customer`, `amount`, `day` | `tk-field` |
| `pred` | identifier `eq ge gt le lt between` when preceded by `.` | `tk-pred` |
| `query` | `where all orderBy limit` | `tk-query` |
| `terminal` | `count exists first sumAmount` when preceded by `.` | `tk-term` |
| `write` | `update churn` | `tk-write` |
| `helper` | `label rnd zipf rows` | `tk-help` |
| `ident` | other `/[A-Za-z_$][\w$]*/` | `tk-id` |
| `punct` | `( ) [ ] { } , ; .` | `tk-punct` |
| `op` | `+ - * / % = < > ! & | ? :` sequences | `tk-op` |
| `ws` | spaces, tabs, newlines | none |

Output: `Array<{ type, text, start, end, line, col }>`, lines and columns 1-based.
The tokenizer is also used for autocomplete context (7.4).

### 7.3 Vocabulary table

`js/editor/vocab.js` exports `VOCAB`, an array of entries:
`{ name, kind, signature, doc, insert, after }`. `kind` is one of
`field pred query terminal write helper snippet keyword`. `insert` is the text
inserted, with `$0` for the caret and `$1` for a selected placeholder. `after`
lists the contexts where the entry is offered (7.4).

| name | kind | signature | doc | insert |
|---|---|---|---|---|
| customer | field | `customer` | Customer id, 0 to rows/20 − 1. About 20 rows per customer. | `customer` |
| amount | field | `amount` | Order amount, 0 to 99 999, uniform. | `amount` |
| day | field | `day` | Day of the year, 0 to 364. About rows/365 rows per day. | `day` |
| eq | pred | `.eq(v)` | Field equals v. | `eq($1)` |
| ge | pred | `.ge(v)` | Field is at least v. | `ge($1)` |
| gt | pred | `.gt(v)` | Field is greater than v. | `gt($1)` |
| le | pred | `.le(v)` | Field is at most v. | `le($1)` |
| lt | pred | `.lt(v)` | Field is less than v. | `lt($1)` |
| between | pred | `.between(lo, hi)` | lo ≤ field ≤ hi. | `between($1, $0)` |
| where | query | `where(p1, p2?)` | Rows where every predicate holds. At most two predicates, on different fields. | `where($1)` |
| all | query | `all()` | Every row. Use with orderBy and limit. | `all()` |
| orderBy | query | `.orderBy(field, desc = false)` | Sort the results by a field. With limit, an ordered index can stop early. | `orderBy($1)` |
| limit | query | `.limit(n)` | At most n results. | `limit($1)` |
| count | terminal | `.count()` | Number of matching rows. Ends the query and records one operation. | `count()` |
| exists | terminal | `.exists()` | Whether any row matches. Stops at the first match. | `exists()` |
| first | terminal | `.first()` | The first matching row (in order if orderBy is set). | `first()` |
| sumAmount | terminal | `.sumAmount()` | Sum of amount over the results. | `sumAmount()` |
| update | write | `update(row, newAmount)` | Set amount of row number `row`. Every index on amount must move the row. | `update($1, $0)` |
| churn | write | `churn(row, customer, amount, day)` | Erase row number `row` and insert a new row in its place. | `churn($1, $0)` |
| label | helper | `label(name)` | Start a phase. Operations are timed per label. Labels run in order of first use. | `label("$1");` |
| rnd | helper | `rnd(n)` | Uniform random integer in [0, n). Deterministic per run. | `rnd($1)` |
| zipf | helper | `zipf(n, skew = 0.5)` | Random integer in [0, n), small values more likely. skew 0 is uniform. | `zipf($1, 0.5)` |
| rows | helper | `rows` | The table size set by the Rows knob. | `rows` |
| for loop | snippet | `for (…) { … }` | Repeat an operation n times. | `for (let i = 0; i < $1; i++) {\n  $0\n}` |
| phase | snippet | `label + loop` | A labelled phase of n operations. | `for (let i = 0; i < $1; i++) {\n  label("$0");\n  \n}` |
| lookup | snippet | `where(customer.eq(rnd(...))).count()` | A lookup by a random customer. | `where(customer.eq(rnd(rows / 20))).count();` |
| range | snippet | `where(amount.between(a, a + w)).count()` | A range of amounts. | `const a = rnd(99000);\nwhere(amount.between(a, a + $1)).count();` |
| top k | snippet | `all().orderBy(amount, true).limit(k)` | The k largest amounts. | `all().orderBy(amount, true).limit($1).sumAmount();` |

Keywords (`for let const if else while`) are entries of kind `keyword` with
no doc, offered only in the statement context.

### 7.4 Autocomplete

**Triggers:** typing an identifier character (after 1 character), typing `.`,
or Ctrl+Space (also Cmd+Space is not used: it is the macOS launcher). Closes on
Escape, on a character that is not part of an identifier, or on blur.

**Context**, from the tokens before the caret (skip whitespace and comments):

| Previous tokens | Context | Offered kinds |
|---|---|---|
| a `field` token then `.` | `afterField` | pred |
| `)` that closes `where(` or `all(` then `.` | `afterWhere` | orderBy, limit, terminals |
| `)` that closes `orderBy(` then `.` | `afterOrderBy` | limit, terminals |
| `)` that closes `limit(` then `.` | `afterLimit` | terminals |
| `.` in any other position | `afterDot` | none (popup does not open) |
| inside `where(` … `)` or inside a pred argument | `expr` | field, helper |
| first argument of `orderBy(` | `orderArg` | field |
| start of a statement (after `;`, `{`, `}`, or line start) | `statement` | snippet, query, write, helper, keyword |
| otherwise | `expr` | field, helper, query |

To find the closing call, scan back from the `)` with a bracket counter to its
`(`, and take the identifier before it.

**Filtering:** prefix match first (case-insensitive), then substring match;
within each group keep vocabulary order. Up to 10 items visible, scroll for more.

**Item layout:** a kind glyph (one letter in a 16 px rounded square, coloured
with the token colour: F, P, Q, T, W, H, S, K), the name with the matched part
bold, the signature in `--muted` mono, right aligned. The selected item shows
its doc in a panel under the list (max 2 lines).

**Keys while open:** Up and Down move, Enter or Tab accepts, Escape closes,
PageUp and PageDown move by 10. Accepting replaces the typed prefix with
`insert`, selects `$1` if present, else places the caret at `$0`, else at the end.

**ARIA:** the textarea gets `role="combobox"`, `aria-autocomplete="list"`,
`aria-expanded`, `aria-controls` (the list id) and `aria-activedescendant`
(the selected item id). Items are `role="option"`.

### 7.5 Signature help and hover

- When the caret is inside the parentheses of a known call (`where`, a pred,
  `orderBy`, `limit`, `update`, `churn`, `label`, `rnd`, `zipf`), show
  `.ed-sig` above the caret line with the signature and the current argument
  bold (count commas at depth 1 before the caret), plus the doc line.
- Pointer hover over a vocabulary token for 400 ms shows the same box with the
  signature and doc. The textarea covers the `<pre>`, so hover resolves the
  character under the pointer by measuring: `line = floor((y + scrollTop - padTop) / 20)`,
  `col = round((x + scrollLeft - padLeft) / charWidth)`, where `charWidth` is
  measured once from a hidden span of 100 `0` characters.

### 7.6 Validation, compile and errors

The editor owns the DSL compiler (moved from today's `compile()` in
`index.html`, unchanged in semantics, same 16-double record layout and the same
`rnd` generator with seed 12345). It adds error positions:

- **Syntax errors:** compile with `new Function`. On a `SyntaxError`, get the
  position by parsing the error message where the engine gives one; otherwise
  bisect: compile the first k lines for growing k, and report the first line at
  which the error appears (column 1). Cost: at most 300 compiles of a tiny
  function; run it only after 400 ms without typing.
- **Runtime errors from the DSL** (the `throw new Error(...)` in `num`, `Q`,
  limits): wrap the user code so each helper captures `new Error().stack` and
  extracts the line of the `<anonymous>` frame (`/<anonymous>:(\d+):(\d+)/` in
  Chromium, `/Function:(\d+):(\d+)/` and `/> eval:(\d+):(\d+)/` in Firefox and
  Safari). Subtract the 2 header lines the wrapper adds. If no frame matches,
  report no position.
- **Lint warnings** from the tokens, without running: a query chain that does not end in
  a terminal ("this query records nothing: end it with .count(), .exists(),
  .first() or .sumAmount()"); a pred method not after a field; an unknown
  identifier that is one edit away from a vocabulary name ("unknown name
  `cusomer`; did you mean `customer`?").

**Display:** a wavy underline under the error span (or the whole line if no
column) in `--bad` (warnings in `--warn`); a dot in the gutter; the status bar
shows `Line {l}, column {c}: {message}`. Hover over the underline shows the message.

**Limits kept from today:** at most 200 000 ops, at least 1 op, at most two
predicates per query on different fields.

### 7.7 Editing keys

| Key | Action |
|---|---|
| Ctrl+Enter, Cmd+Enter | emit `run` |
| Tab / Shift+Tab | indent / outdent the selected lines by 2 spaces; with no selection, Tab inserts 2 spaces (unless the popup is open) |
| Enter | new line with the current indent; one more level after `{` |
| `(` `[` `{` `"` `'` `` ` `` | insert the pair, caret between; with a selection, wrap it |
| a closing char equal to the next char | step over it |
| Backspace between an empty pair | delete both |
| Ctrl+/ , Cmd+/ | toggle `// ` on the selected lines |
| Escape | close popup; a second Escape blurs the editor (keyboard escape from the textarea) |

Undo and redo: the editor records its own undo stack, because programmatic edits
break the textarea's native undo. Each insertion or deletion run of the same type
within 1 s is one step; Ctrl+Z / Cmd+Z undo, Ctrl+Shift+Z / Ctrl+Y / Cmd+Shift+Z redo.
Edits go through `setRangeText` so the caret is set correctly.

### 7.8 C++ equivalent pane

A read-only `<pre>` with the same highlighter in C++ mode (keywords
`struct constexpr auto for int return true false`, `mv::` names as `tk-query`,
numbers, strings, comments). It shows the text today's `renderCpp()` produces,
unchanged in content: the `Row` struct, the `mv::col` constants, the adaptive
declaration, the yours copy from the current mask, and one line per distinct
query shape (max 40), plus the write lines. Updates 400 ms after the last
keystroke or a mask change. A Copy button copies its text.

### 7.9 Examples

`js/editor/examples.js` exports `EXAMPLES`: an array of
`{ id, title, description, script }`. It contains the five examples of the
current page (same scripts, ids `lookups-ranges`, `topk`, `write-burst`,
`churn`, `low-card`) and the seven lesson scripts (`L1`, `L2`, `L3`, `L4`, `L5`,
`L6b`, `L7`) with titles "Lesson 1: a scan grows" and so on. Package B shows them
in a select; the editor does not render the select.

### 7.10 Share links

`js/editor/share.js` encodes `{ v: 1, script, knobs }` as JSON, compresses it with
`CompressionStream("deflate-raw")`, and base64url-encodes it into
`location.hash = "#s=" + data`. Decode is the reverse with
`DecompressionStream`. If the stream API is missing, use uncompressed base64url
with prefix `#u=`. A hash over 8 000 characters gets the status message "This
script is too long for a link." Package B owns when to read and write the hash.

### 7.11 Editor interface

`js/editor/editor.js` exports one factory:

```js
export function createEditor(host, options) -> EditorApi
// options: { value: string, readOnly: boolean, rows: number, onRun?: () => void }

EditorApi = {
  getValue(): string,
  setValue(text: string, { keepUndo = false } = {}): void,
  setReadOnly(flag: boolean): void,
  setRowCount(n: number): void,          // the value of `rows` for compile and docs
  focus(): void,
  compile(): CompileResult,               // synchronous; also sets markers
  setMarkers(markers: Marker[]): void,    // extra markers from package B, merged with its own
  highlightLines(from: number, to: number, cls: string | null): void,  // lesson focus on lines
  on(event: string, fn: (detail) => void): () => void,  // returns an unsubscribe function
  destroy(): void,
}

CompileResult =
  | { ok: true, ops: number[][], labels: string[], shapes: number[] /* op indexes */, shapeText: string[] }
  | { ok: false, error: { message: string, line?: number, col?: number } }

Marker = { line: number, col?: number, endCol?: number, severity: "error" | "warning", message: string }
```

Events emitted by `on`:

| Event | detail | When |
|---|---|---|
| `change` | `{ value }` | after each edit, throttled to one per animation frame |
| `compiled` | `CompileResult` | 400 ms after the last edit, and after `setValue` |
| `run` | `{}` | Ctrl/Cmd+Enter |
| `cursor` | `{ line, col }` | caret moves |

Other exports of package A:

```js
// js/editor/compile.js
export function compile(code: string, rowCount: number, seed = 12345): CompileResult
export function queryText(record: number[]): string   // DSL text of a shape, `?` for values
export function cppText(result: CompileResult, yoursMask: number[]): string
// js/editor/highlight.js
export function highlight(code: string, lang: "dsl" | "cpp"): string  // HTML with tk-* spans, escaped
export function tokenize(code: string): Token[]
// js/editor/vocab.js
export const VOCAB: VocabEntry[]
// js/editor/examples.js
export const EXAMPLES: Example[]
// js/editor/share.js
export async function encodeShare(state: { script: string, knobs: object }): Promise<string>  // returns the hash
export async function decodeShare(hash: string): Promise<{ script: string, knobs: object } | null>
```

`shapeText[i]` is `queryText(ops[shapes[i]])` in DSL form, used by the plan view.

## 8. Layout and visual design

### 8.1 Information architecture

```
Header: title · mode switch (Lessons | Free play) · share · theme
├── Lesson rail: 1..7, free play          (navigation)
├── Story column                           (what to read and look at)
│   ├── Lesson card: goal, copy, checks, Back/Next
│   ├── Timeline chart (or sweep chart in lesson 1)
│   └── Results table
├── Workbench column                       (what to change)
│   ├── Run bar: Run/Stop, repeat, reset, status
│   ├── Editor + example select
│   ├── Knobs (locked ones shown disabled with a lock glyph)
│   └── C++ equivalent (collapsed by default, a <details>)
└── Analysis band (full width)
    ├── Index inspector + event log
    ├── Plan view
    └── Memory against time
```

A view that a lesson does not use is collapsed to its heading with the line
"Not used in this lesson" and can be opened by the reader. In free play every
view is open.

### 8.2 Wireframes

**Desktop, 1280 px wide**

```
+--------------------------------------------------------------------------------------------+
| multiview playground                      [ Lessons | Free play ]   [Share]  [◐ Theme]      |
+------------+-------------------------------------------+-----------------------------------+
| LESSONS    | Lesson 2 of 7 · An index pays for itself   | [▶ Run] [■ Stop] repeat [3] [Reset]|
| ● 1 Scan   | Goal: see the adaptive copy scan first... | pass 2/3 · 1.4 s · clock 5 µs     |
| ● 2 Index  |                                           +-----------------------------------+
| ○ 3 Cost   | The adaptive copy starts with no index... | Example [Lesson 2 ▾]              |
| ○ 4 Kinds  | ...                                       |  1 │ // 2000 lookups by customer   |
| ○ 5 Choose | ✓ an index on customer is live            |  2 │ for (let i = 0; i < 2000; ... |
| ○ 6 Rent   | ○ first build in pass 1                   |  3 │   label("lookup");            |
| ○ 7 Price  | ✗ 20× faster in pass 3  [Run again]       |  4 │   where(customer.eq(zipf(...  |
| ────────── |                    [‹ Back]   [Next ›]     |  5 │ }                             |
| ○ Free play+-------------------------------------------+  Line 4, col 12                   |
|            | TIME PER OPERATION        [log|speed-up]  +-----------------------------------+
|            |  1 ms ┤━━━━━━━━━━━━━━━━━━━━━ scan only    | KNOBS                             |
|            | 100µs ┤                                   | Rows [50 000 ▾] 🔒  Eagerness 1.0 🔒|
|            |  10µs ┤      ╲                            | Memory limit 0 KB 🔒  Rent 1e-5 🔒  |
|            |   1µs ┤       ╲_____________ adaptive     | Copies: ☑adaptive ☑scan ☑grouped  |
|            | 100ns ┤━━━━━━━━━━━━━━━━━━━━━ grouped only |   ☐sorted ☐g+s ☐yours             |
|            |       └ ▲ ───┼──────┼──── pass 1 2 3     +-----------------------------------+
|            | RESULTS (last pass)                       | ▸ C++ equivalent                  |
|            | ■ adaptive    1.1 µs   380×    1 024 KB ✓ |                                   |
|            | ■ scan only   412 µs     —         0 KB ✓ |                                   |
+------------+-------------------------------------------+-----------------------------------+
| ADAPTIVE COPY: INDEXES   2 live, 1 840 KB · scans 41 · probes 5 960 · builds 2 · trials 1  |
| customer [grouped live][swiss trial][dense ··][ordered ··][sorted-array ··][hash ··]       |
| amount   [··]...                                                                           |
| day      [··]...                                       EVENTS  [1.3] ▲ built grouped ...  |
+---------------------------------------------+----------------------------------------------+
| PLANS                                       | MEMORY AGAINST TIME                          |
| where(customer.eq(?)).count()               |  ns ┤ ■scan                                  |
| probe grouped index on customer (equality)  |     ┤          ◆g+s                          |
| Looks up the matching rows in the grouped...|     ┤ ●adaptive  ▲grouped                    |
+---------------------------------------------+----------------------------------------------+
```

**Tablet, 768 to 1199 px**

```
+--------------------------------------------------------------+
| multiview playground        [Lessons|Free]  [Share] [◐]      |
| ① ② ③ ④ ⑤ ⑥ ⑦ ⋯ Free play     (horizontal stepper)          |
+------------------------------+-------------------------------+
| Lesson card                  | Run bar                       |
|                              | Editor                        |
+------------------------------+-------------------------------+
| Timeline chart (full width)                                  |
| Results table (full width)                                   |
+------------------------------+-------------------------------+
| Knobs                        | C++ equivalent                |
+------------------------------+-------------------------------+
| Inspector (full width; field rows scroll horizontally)       |
| Plans (full width)                                           |
| Memory against time (full width)                             |
+--------------------------------------------------------------+
```

**Phone, under 768 px**

```
+--------------------------+
| multiview     [≡] [◐]    |
| ① ② ③ ④ ⑤ ⑥ ⑦ ⋯ (scroll) |
+--------------------------+
| Lesson card              |
+--------------------------+
| [▶ Run] [■] repeat [3]   |  sticky at the bottom of the viewport
+--------------------------+
| Timeline (220 px high)   |
| Results (copy, ns, ×)    |  per-label and KB columns hidden; tap a row for all values
| Editor (14 lines)        |
| Knobs                    |
| Inspector                |
| Plans                    |
| Memory                   |
| C++ (collapsed)          |
+--------------------------+
```

### 8.3 Layout system

CSS grid on `.app`:

```css
.app {
  display: grid;
  gap: var(--s-4);
  padding: var(--s-4);
  max-width: 1440px;
  margin: 0 auto;
  grid-template-columns: 232px minmax(520px, 1fr) minmax(400px, 440px);
  grid-template-areas:
    "header  header    header"
    "rail    lesson    run"
    "rail    lesson    editor"
    "rail    chart     editor"
    "rail    chart     knobs"
    "rail    results   cpp"
    "analysis analysis analysis";
}
@media (max-width: 1199px) {
  .app {
    grid-template-columns: 1fr 1fr;
    grid-template-areas:
      "header  header"
      "stepper stepper"
      "lesson  run"
      "lesson  editor"
      "chart   chart"
      "results results"
      "knobs   cpp"
      "analysis analysis";
  }
}
@media (max-width: 767px) {
  .app {
    grid-template-columns: 1fr;
    padding: var(--s-3) 16px;
    grid-template-areas: "header" "stepper" "lesson" "run" "chart" "results" "editor" "knobs" "analysis" "cpp";
  }
}
```

`.analysis` is its own grid: `"inspector inspector" "plans memory"` at desktop,
one column below 1200 px. `rail` is hidden below 1200 px; `stepper` is hidden at
1200 px and above. No horizontal page scroll at any width; wide tables and the
inspector rows scroll inside their panel.

**Spacing scale** (4 px base): `--s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px;
--s-5: 24px; --s-6: 32px; --s-7: 48px`. Panel padding `--s-4`; gap between
panels `--s-4`; gap inside a panel between blocks `--s-3`.

**Radii:** panels 10 px, buttons and inputs 7 px, badges 999 px, cards 8 px.

### 8.4 Type scale

| Token | Size / line height | Use |
|---|---|---|
| `--t-xs` | 12 / 16 | badges, tick labels, reason lines |
| `--t-sm` | 13 / 20 | tables, editor, plan text, captions |
| `--t-md` | 15 / 24 | body, lesson copy |
| `--t-lg` | 18 / 26 | lesson title |
| `--t-xl` | 24 / 32 | page title |

Families: `--sans: system-ui, -apple-system, "Segoe UI", sans-serif`;
`--mono: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace`.
Panel headings: `--t-xs`, uppercase, letter spacing 0.08em, weight 600,
`--muted`. Numbers in tables use `font-variant-numeric: tabular-nums` and `--mono`.
Lesson copy max width 68 ch.

### 8.5 Colour system

The six copy colours come from the Okabe-Ito palette, which stays distinct
for the common forms of colour blindness. Each copy also has a dash pattern and
a marker shape, so no reading depends on colour alone.

| Copy | Token | Light | Dark | Dash (canvas `setLineDash`) | Marker |
|---|---|---|---|---|---|
| adaptive | `--copy-0` | `#007a5a` | `#2ec4a0` | solid `[]` | circle |
| scan only | `--copy-1` | `#c84f00` | `#ff8a4c` | `[6, 4]` | square |
| grouped only | `--copy-2` | `#0063a8` | `#5aa9f0` | `[2, 3]` | triangle up |
| sorted only | `--copy-3` | `#b0538f` | `#e597c8` | `[8, 3, 2, 3]` | diamond |
| grouped and sorted | `--copy-4` | `#9a6b00` | `#f0c24a` | `[12, 4]` | cross (×) |
| yours | `--copy-5` | `#3a3f8f` | `#a7adf5` | `[4, 2, 1, 2]` | plus (+) |

Surface and text tokens:

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#fbfbf9` | `#131416` |
| `--panel` | `#ffffff` | `#1b1c1f` |
| `--panel-2` (editor, code) | `#f5f5f1` | `#17181b` |
| `--ink` | `#1c1d1f` | `#ecece8` |
| `--muted` | `#5d6168` | `#9a9ea6` |
| `--line` | `#e3e3de` | `#2c2e33` |
| `--grid` | `#ecece7` | `#24262a` |
| `--grid-strong` | `#d5d5cf` | `#383a40` |
| `--accent` | `#0063a8` | `#7fb8f5` |
| `--focus` | `#0063a8` | `#7fb8f5` |
| `--good` | `#1f7a45` | `#55c785` |
| `--bad` | `#b3261e` | `#ff8a80` |
| `--warn` | `#8a6200` | `#e8c060` |
| `--event-build` | `#1f7a45` | `#55c785` |
| `--event-drop` | `#b3261e` | `#ff8a80` |
| `--event-trial` | `#6b4fbb` | `#b9a4f5` |
| `--cue-bg` | `#fff4c2` | `#3a3214` |
| `--cue-ink` | `#3a2e00` | `#f5e6a8` |
| `--highlight` (lesson focus ring) | `#e0a800` | `#f0c24a` |

Editor token colours:

| Token | Light | Dark |
|---|---|---|
| `--tk-com` | `#6e7781` italic | `#8b949e` italic |
| `--tk-str` | `#0a6b36` | `#7ee2a8` |
| `--tk-num` | `#9a4a00` | `#ffb074` |
| `--tk-kw` | `#8b1fa8` | `#d6a2f2` |
| `--tk-field` | `#0063a8` bold | `#7fb8f5` bold |
| `--tk-pred` | `#007a5a` | `#2ec4a0` |
| `--tk-query` | `#1c1d1f` bold | `#ecece8` bold |
| `--tk-term` | `#b3261e` | `#ff8a80` |
| `--tk-write` | `#c84f00` bold | `#ff8a4c` bold |
| `--tk-help` | `#5d6168` | `#a8acb3` |

**Theme switching:** the light values sit on `:root`. The dark values sit under
`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ... } }`
and again under `:root[data-theme="dark"] { ... }`. The theme button cycles
auto → light → dark → auto, sets `document.documentElement.dataset.theme`
(removes it for auto), stores the choice in `localStorage` inside try/catch, and
emits a `theme` change in the store so canvases redraw. Canvas code reads
colours with `getComputedStyle` at draw time.

### 8.6 Components and states

| Component | Default | Hover | Focus (keyboard) | Active | Disabled |
|---|---|---|---|---|---|
| Button | `--bg` fill, `--line` border | border `--accent` | 2 px `--focus` outline, offset 2 px | fill 8 % `--accent` | 45 % opacity, `cursor: not-allowed` |
| Primary button (Run, Next) | `--accent` fill, white text | 8 % darker | outline as above | 15 % darker | 45 % opacity |
| Rail item | number circle + title, `--muted` | `--ink` | outline | current: bold, `--accent` bar 3 px on the left | — |
| Rail status circle | hollow | — | — | done: filled `--good` with a check | — |
| Knob (range, select, number) | as today | border `--accent` | outline | — | locked: 45 % opacity, lock glyph, `title="Locked in this lesson"` |
| Copy toggle chip | swatch + dash sample + name | border `--accent` | outline | on: 12 % copy-colour fill | locked |
| Check line | hollow circle, `--muted` | — | — | pass: check `--good`; fail: cross `--bad` + fallback text | — |
| Inspector card | `--panel`, `--line` border | border `--accent` | outline | — | never built: dashed border, 60 % opacity |
| Lesson focus | — | — | — | 2 px `--highlight` ring with 4 px offset, pulses twice | — |
| Tab-like toggles (log/speed-up, Lessons/Free) | segmented control | — | outline | selected: `--panel` fill, shadow 0 1px 2px | — |

### 8.7 Motion

- Animate: lesson focus ring (2 pulses, 2 × 600 ms, opacity 1 → 0.3 → 1); inspector card flash on state change (600 ms background from 25 % of the state colour to transparent); new event log line (150 ms fade in); autocomplete and tooltip appear (100 ms opacity); `<details>` open (no animation).
- Do not animate: chart lines (each sample redraws instantly), numbers in tables, layout.
- Easing: `cubic-bezier(0.2, 0, 0, 1)` for all.
- Under `@media (prefers-reduced-motion: reduce)`: all durations 0; the focus ring is shown static for 3 s, then removed; card flash replaced by a 2 px border in the state colour for 3 s.
- Scroll to a focused element with `scrollIntoView({ block: "nearest", behavior })`, `behavior` `"auto"` under reduced motion, `"smooth"` otherwise.

### 8.8 Accessibility

- Landmarks: `<header>`, `<nav aria-label="Lessons">` (rail and stepper), `<main>`, each panel a `<section aria-labelledby>` with its heading.
- Keyboard path in a lesson: skip link "Skip to lesson" → lesson card (heading is focusable, `tabindex="-1"`, focused on lesson change) → checks → Back/Next → Run bar → editor → knobs → views. Alt+N (Option+N) goes to the next lesson, Alt+P to the previous one, when focus is not in the editor.
- Rail and stepper: a list of links; `aria-current="step"` on the current lesson.
- Editor: section 7.4 ARIA; Escape twice leaves the editor; Tab inside the editor indents, and the hint "Press Escape, then Tab, to leave the editor" sits in `aria-describedby`.
- Live regions: `#run-status` (`role="status"`) announces "Pass {p} of {n} done" and "Run finished: adaptive {ns}, scan {ns}"; check results announce "Check passed: {text}" or "Check not met: {fallback}" via one `role="status"` region in the lesson card; event log as in 6.4.
- Charts: `<canvas role="img" aria-label="...">` with a label that summarizes the last values, updated after each pass ("Time per operation. Last pass: adaptive 1.1 µs, scan only 412 µs, grouped only 95 ns. 2 builds, 0 drops."). A "Show data table" button under each chart toggles a `<table>` with the same data.
- Contrast: text tokens at least 4.5:1 on `--panel` in both themes; chart lines at least 3:1 against `--panel`.
- Target size at least 32 × 32 px for controls, 44 × 44 px on phone.

## 9. Engineering structure

### 9.1 Rules

- Plain ES modules, loaded by `<script type="module" src="js/main.js">`. No bundler, no npm, no network at runtime, no third-party code.
- `multiview.js` is the Emscripten output (a classic script defining the global `createMultiview`). Load it with `<script src="multiview.js"></script>` before the module script.
- Every module has a top comment of 1 to 3 lines saying what it owns.
- No inline event handlers in HTML. No `innerHTML` with user text: script text, labels and error messages go through `textContent` or the editor's escaping highlighter.
- `localStorage` only for the theme and the last free-play state, always inside try/catch.
- The page must work from `make serve` and from any static server (without cross-origin isolation the clock is coarser; the page says so).

### 9.2 File layout

```
playground/web/
  index.html                 B  skeleton: header, grid areas, empty panels, script tags
  multiview.js, .wasm           build output, unchanged
  css/
    tokens.css               B  every token of section 8 (colours, spacing, type)
    base.css                 B  reset, body, headings, buttons, inputs, tables
    layout.css               B  .app grid, breakpoints, .analysis grid
    components.css           B  rail, stepper, lesson card, checks, run bar, knobs, chips, cards, badges, tooltip
    charts.css               B  canvas sizes, chart toolbars, data tables
    editor.css               A  everything with the .ed- and .tk- prefixes
  js/
    main.js                  B  boot: load wasm, create store, mount views, open lesson or free play
    wasm.js                  B  createMultiview wrapper, typed API, memory for op buffers
    store.js                 B  the store (9.4)
    runner.js                B  run model (section 3): passes, slices, samples, sweep, budget
    events.js                B  derive events from two snapshots
    timer.js                 B  timer resolution, noisy flags, medians
    format.js                B  fmtNs, fmtKb, fmtRatio
    theme.js                 B  theme toggle
    share-state.js           B  reads/writes the URL hash with A's encodeShare/decodeShare
    lessons/
      lessons.js             B  the seven lessons as data (9.5)
      engine.js              B  applies a lesson, evaluates checks, attempts, cues, focus
      checks.js              B  check helpers (medians per label, states)
    views/
      rail.js, stepper.js    B  lesson navigation
      lesson-card.js         B  goal, copy, checks, Back/Next
      run-bar.js             B  Run, Stop, repeat, Reset, status, budget confirm
      knobs.js               B  rows, eagerness, memory, rent, seed, copy toggles
      kind-grid.js           B  yours masks
      editor-panel.js        B  hosts A's editor, example select, wires events
      cpp-panel.js           B  hosts the C++ pane (A's highlight + cppText)
      timeline.js            B  6.1
      sweep.js               B  6.2
      results.js             B  6.3
      inspector.js           B  6.4 including the event log
      plans.js               B  6.5
      memory.js              B  6.7
      chart-kit.js           B  shared canvas helpers: dpr setup, log axis, dashes, markers, tooltip box
    editor/
      editor.js              A  createEditor (7.11)
      compile.js             A  DSL compiler, queryText, cppText
      highlight.js           A  tokenizer and highlighter (dsl and cpp)
      complete.js            A  autocomplete context and popup
      vocab.js               A  VOCAB
      examples.js            A  EXAMPLES
      share.js               A  encodeShare, decodeShare
  editor-demo.html           A  standalone page that mounts the editor for testing
```

The old inline `<style>` and `<script>` of `index.html` are deleted. Nothing of
the workload-mix panel (`pg_run`, sliders, presets) remains on the page; the
export stays in the C++.

### 9.3 wasm.js interface

```js
export async function loadWasm() -> Wasm
Wasm = {
  reset({ rows, seed, eagerness, maxIndexKb, rent, yoursMask: [m0, m1, m2] }): void,
  loadOps(ops: number[][]): { ptr: number, count: number },  // frees the previous buffer
  exec(ptr: number, start: number, count: number, nLabels: number): ExecJson,  // pg_exec + parse pg_exec_json
  state(): StateJson,                                           // parse pg_json
  explain(ptr: number, opIndex: number): string,               // pg_explain(ptr + opIndex * 128)
}
```

On load failure, `main.js` shows in the lesson card: "Could not load
multiview.wasm: {error}. Build it with `make playground` and serve this folder
with `make serve`."

### 9.4 State model

One store, one object. Views subscribe to named top-level keys.

```js
export function createStore(initial) -> {
  get(): State,
  set(patch: Partial<State> | (s: State) => Partial<State>): void,  // shallow merge, then notify
  subscribe(keys: string[], fn: (s: State, changed: Set<string>) => void): () => void,
}
```

Notification is batched per microtask: several `set` calls in one task produce
one call per subscriber, with the union of changed keys. Values are replaced,
never mutated in place (push a sample with `set(s => ({ samples: [...s.samples, x] }))`;
cap `samples` at 2 000, drop the oldest).

```js
State = {
  mode: "lesson" | "free",
  lessonId: "L1" .. "L7" | null,
  lessonProgress: { [id]: "new" | "seen" | "done" },     // done = all checks passed or Next pressed
  checks: [{ id, text, status: "pending" | "pass" | "fail", measured: string }],
  attempts: number,                       // lesson action runs since the lesson opened
  knobs: { rows, seed, eagerness, maxIndexKb, rent, yoursMask: [int, int, int], repeat },
  locked: { rows, seed, eagerness, maxIndexKb, rent, yoursMask, repeat, copies, editor: boolean },
  stale: boolean,                         // knobs changed since the last reset
  shownCopies: [bool x 6],
  script: string,
  compiled: CompileResult | null,
  run: { status: "idle" | "resetting" | "running" | "stopping", pass: number, passes: number, startedAt: number },
  samples: Sample[],
  events: Event[],                        // { seq, pass, slice, type, field, kind, text }
  sweep: [{ rows, ns: [6 numbers], noisy: [6 bools] }],
  indexes: IndexJson[], counters: CountersJson,
  plans: [{ shapeText, plan }],
  cues: [{ seq?, pass?, band?: boolean, text }],
  focus: string | null,                   // element id the lesson highlights
  view: { chartMode: "log" | "speedup", chartLabel: number, openPanels: { [panelId]: boolean } },
  env: { timerResMs: number, isolated: boolean },
  theme: "auto" | "light" | "dark",
  error: string | null,
}
```

### 9.5 Lessons as data

`lessons.js` exports `LESSONS: Lesson[]`:

```js
Lesson = {
  id: string, title: string, goal: string,
  copy: string[],                 // paragraphs; inline `code` and **bold** only (rendered by a 10-line formatter)
  table?: { head: string[], rows: string[][] },   // optional static figure (lesson 4 uses none; reserved)
  setup: {
    knobs: Partial<Knobs>, locked: Partial<Locked>, shownCopies: bool[6],
    script: string, prepare?: { script: string, passes: number, message: string },
    sweep?: number[], panels: string[],   // panel ids to open; others collapse
  },
  action: { label: string, kind: "run" | "sweep" | "apply-and-run", requires?: (s) => boolean, hint?: string },
  focus: { before: string, after?: string },     // element ids
  cues: { before?: Cue[], afterRun?: (s) => Cue[] },
  checks: Check[],
}
Check = {
  id: string, text: string, timed: boolean,
  minPass?: number,                 // do not evaluate before this pass (or sweep size count)
  test: (s, h) => { pass: boolean, measured: string },   // h = helpers from checks.js
  fallback: string,                 // may contain {x}, filled from measured values
}
```

Helpers in `checks.js` (`h`): `labelNs(s, copy, label, pass)` (median per 3),
`passNs(s, copy, pass)`, `bytes(s, copy)`, `live(s, field)` (array of kinds),
`everLive(s, field)` (set of kinds), `ratio(a, b)`, `lastPass(s)`, `sweepNs(s, copy, rows)`.

**Full example, lesson 2:**

```js
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
    knobs: { rows: 50000, seed: 1, eagerness: 1, maxIndexKb: 0, rent: 1e-5, yoursMask: [0, 0, 0], repeat: 3 },
    locked: { rows: true, seed: true, eagerness: true, maxIndexKb: true, rent: true, yoursMask: true, repeat: false, copies: true, editor: true },
    shownCopies: [true, true, true, false, false, false],
    script: EXAMPLE("L2"),          // from A's EXAMPLES by id
    panels: ["timeline", "results", "inspector", "plans"],
  },
  action: { label: "Run", kind: "run" },
  focus: { before: "timeline", after: "inspector-card-customer-grouped" },
  cues: {
    afterRun: (s) => {
      const b = s.events.find((e) => e.type === "build");
      return b ? [{ seq: b.seq, text: "the build happens here" }] : [];
    },
  },
  checks: [
    { id: "live", text: "An index on customer is live", timed: false,
      test: (s, h) => { const k = h.live(s, "customer"); return { pass: k.length > 0, measured: k.length ? `live: ${k.join(", ")} on customer` : "none live" }; },
      fallback: "No index yet. Raise the repeat count to 6 and run again.", minPass: 3 },
    { id: "first-build", text: "The first build happens in pass 1", timed: false,
      test: (s) => { const b = s.events.find((e) => e.type === "build"); return { pass: !!b && b.pass === 1, measured: b ? `first build in pass ${b.pass}, slice ${b.slice}` : "no build" }; },
      fallback: "The first build came later than pass 1. This depends on measured build time; it is not an error." },
    { id: "fast", text: "Adaptive is at least 20× faster than scan in pass 3", timed: true, minPass: 3,
      test: (s, h) => { const r = h.ratio(h.labelNs(s, 1, "lookup", 3), h.labelNs(s, 0, "lookup", 3)); return { pass: r >= 20, measured: `adaptive is ${r.toFixed(1)}× faster than scan in pass 3` }; },
      fallback: "Expected at least 20×, measured {x}×. Index probes are fast enough that a coarse clock cannot time them well." },
  ],
}
```

### 9.6 Lesson engine

`engine.js` exports `openLesson(id)`, `next()`, `back()`, `openFree()`,
`onPassDone()`. Opening a lesson:

1. If leaving free play, save `{ script, knobs, shownCopies }` to `localStorage` key `mvpg.free`.
2. Stop any run (wait for the current slice).
3. `set` knobs, locked, shownCopies, script, panels, `checks` (all pending), `attempts: 0`, `cues: before`, `focus: before`.
4. Reset the table (`runner.reset()`).
5. If `prepare`: run it with `prepare.passes`, show `prepare.message` in the run bar, then load `setup.script` into the editor.
6. Move keyboard focus to the lesson heading.

After each pass (`onPassDone`): evaluate checks whose `minPass` is reached; a
passed check stays passed. After the action's last pass: `attempts += 1`; set
`afterRun` cues and `focus.after`; failed timed checks show the fallback and
"Run again"; at `attempts >= 3` show the clock line from section 4. When all
checks pass: mark the lesson done, show "All checks passed." and give Next the
primary style.

`apply-and-run` (lesson 4): enabled only when `action.requires(s)` is true
(the masks match). It resets with the new masks and runs.

### 9.7 Timing noise, summary

1. Measure the timer resolution at start; show it in the run bar ("clock 5 µs" or "clock 100 µs, coarse"). Above 20 µs add a one-line note in the run bar with a link to the README section on `make serve`.
2. Slices of at least 500 ops where possible (section 3).
3. Mark noisy values (section 3); draw them hollow and faded; never colour a noisy value as best.
4. Checks use medians per pass, conservative thresholds (the native ratios are 5 to 50 times larger than the thresholds), and never block progress.
5. Exact checks (index state, counters, bytes) carry each lesson's main point, so a lesson teaches even when timed checks fail.

## 10. Work packages and integration contract

| | Package A: editor | Package B: everything else |
|---|---|---|
| Files | `js/editor/*.js`, `css/editor.css`, `editor-demo.html` | every other file under `playground/web/` except the wasm build output |
| Imports | nothing outside `js/editor/` | `js/editor/editor.js`, `compile.js`, `highlight.js`, `examples.js`, `share.js` (only the exports in 7.11) |
| CSS | `.ed-*`, `.tk-*` classes only; uses tokens with fallbacks: `var(--tk-kw, #8b1fa8)` etc., light values as fallbacks | defines every token in `tokens.css`, never styles `.ed-*` or `.tk-*` |
| DOM | renders only inside the `host` element given to `createEditor`, plus its popup and tooltip appended to `host` | owns the rest of the page |
| Test | `editor-demo.html` loads `css/editor.css` and mounts an editor with each example; works without B | `js/views/editor-panel.js` loads A with dynamic `import()` in a try/catch. If the import fails (A not landed yet), it mounts a read-only `<textarea>`, shows "Editor module failed to load", and disables Run. Until A lands, B develops against today's `compile()` from the old `index.html`, pasted into a scratch file outside `playground/web/`, and deletes it at integration |

**Contract freeze.** The signatures in 7.11 and the `EXAMPLES` ids in 7.9 are
the interface. Neither package changes them. If one is wrong, the implementer
writes the problem in their final report; the lead decides.

**Integration test** (done by the lead after both land): load `index.html`,
open lesson 1, run it, open free play, type in the editor, and check the
acceptance list below.

## 11. C++ changes

None are required. All seven lessons work with the current exports.

One optional change makes the inspector's balance bar (6.4 item 6) work. It
touches the library header and the playground:

- `include/multiview.hpp`, `struct index_info`: add `double balance;` (ns, the slot's `balance`) and `double drop_at;` (ns, `-cap_of(sl) * sl.patience`, the balance at which it is dropped; negative). Fill them in `indexes()`.
- `playground/playground.cpp`, `write_json()`: append `"balance":%.6g,"drop_at":%.6g` to each index object.

JSON per index after the change:
`{ "field": "customer", "kind": "grouped", "live": true, "probe_ns": 41, "build_ms": 2.1, "uses": 5960, "bytes": 1048576, "balance": 1830000, "drop_at": -2100000 }`.
Package B must render the bar only when `balance` is a number. Do not make this
change as part of either package; the lead decides.

## 12. Acceptance checklist

Verify in Chromium and Firefox, served with `make serve`, at 1280, 900 and 390 px wide.

**Boot and structure**
- [ ] The page loads with no console errors and no network request other than its own files.
- [ ] `index.html` has no inline `<style>` or `<script>` body; all code is in `css/` and `js/`.
- [ ] Without the wasm files, the lesson card shows the build message from 9.3.
- [ ] The run bar shows the measured clock resolution.

**Lessons**
- [ ] Each of the seven lessons opens with its setup: copies, knobs locked as specified, script loaded, panels open.
- [ ] Lesson 1 sweep draws four points per shown copy; check 1 passes on a `make serve` page.
- [ ] Lesson 2 shows a build marker in pass 1 and a live `customer` card after the run.
- [ ] Lesson 3 shows the `update` column and the KB ordering; the exact check passes.
- [ ] Lesson 4 keeps "Apply and run" disabled until the masks match, then the yours copy wins `day = ?` and `amount range` against scan.
- [ ] Lesson 5 shows at least two kinds tried on `customer` within two runs.
- [ ] Lesson 6 runs the prepare step automatically, then drops the customer index for rent within two runs.
- [ ] Lesson 7 shows the pass-1 band and the memory scatter.
- [ ] A failed timed check shows its fallback with the measured value; after 3 attempts the clock line appears; Next is always enabled.
- [ ] Rail and stepper show progress; reload keeps the theme only, not lesson progress.

**Editor**
- [ ] Highlighting shows the ten token types in distinct colours in both themes.
- [ ] Line numbers follow scrolling; the highlighted text stays aligned with the caret on long scripts (300 lines) and long lines.
- [ ] Typing `customer.` opens predicates only; `where(x).` offers orderBy, limit, terminals; `.orderBy(amount).` offers limit and terminals; Ctrl+Space opens the list at a statement start with snippets.
- [ ] Each item shows signature and doc; Enter inserts with the caret at the placeholder.
- [ ] Signature help bolds the current argument inside `between(1, |)`.
- [ ] `where(customer.eq(1), customer.ge(2)).count();` shows an error underline on that line with the DSL message; a missing `)` shows a syntax error on the correct line.
- [ ] Ctrl/Cmd+Enter runs; Tab and Shift+Tab indent selected lines; brackets and quotes auto-close; Ctrl+Z undoes an auto-close in one step.
- [ ] The C++ pane updates 400 ms after typing stops and reflects the yours masks.
- [ ] Share writes `#s=...`; opening that URL in a new tab restores script and knobs in free play.
- [ ] `editor-demo.html` works with no other file from package B.

**Views**
- [ ] Timeline: log axis labelled per decade with the axis title; direct labels at line ends do not overlap; speed-up toggle works; dash and marker per copy visible in grayscale (check with a grayscale CSS filter).
- [ ] Tooltip by pointer and by arrow keys shows values, ratios to scan and events.
- [ ] Results table marks best per column and greys noisy values.
- [ ] Inspector shows 18 cards with states and reason badges; a state change flashes the card.
- [ ] Plan view shows the plan string and the sentence for each shape.
- [ ] Memory scatter shows one point per shown copy and the adaptive arrow.

**Design and accessibility**
- [ ] Theme follows the system, the toggle cycles auto, light, dark, and canvases redraw.
- [ ] No horizontal page scroll at 390 px; the run bar is sticky on phone.
- [ ] Keyboard only: skip link → lesson → Run → editor (Escape twice to leave) → views; focus is always visible.
- [ ] With reduced motion on, nothing animates.
- [ ] A screen reader announces pass completion and check results once each.
