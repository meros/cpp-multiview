# Playground v2: experience spec

Status: design spec for the implementer, 2026-10-29. It replaces the lesson and
view parts of `docs/playground-design.md` (v1). v1 stays as `lab.html`.

**In short.** The new playground is a short course of ten small programs. Each
page shows one program the reader can edit and run, a few lines of text beside
it, and a plain-text log of what the table did, with numbers and in words. One
simple bar chart appears from step 3. Every other v1 panel is gone from the
default path.

## 1. Rules that every step follows

1. **The code is the main object.** The editor is the largest thing on the
   page. The text says what to look at, in at most 120 words.
2. **One new idea per step.** A step adds one piece of syntax or one behaviour
   of the container. Nothing else unlocks.
3. **The log shows values, not charts.** The answer of every query, the time,
   the plan in words, and what the container did and why.
4. **One chart type**, bars, linear axis, two series at most, from step 3.
5. **Honest numbers.** A time below the browser clock is a bound ("under
   0.25 µs"), never a number.
6. **Run means a fresh table.** The same code gives the same answers every
   time. "Run again on the same table" keeps what the container learned.

### Removed from the default path

Inspector cards, the memory scatter, the log-scale timeline, the plan view, the
six-copy results table, the knob panels, the sweep, the C++ pane, the kind grid
for `yours`, share links. v1 keeps all of them in `lab.html`. v2 links to it
once, from step 10 ("The lab: the first playground, with every chart and
setting"). v2 does not import any file from `js/views/` or `js/lessons/`.

## 2. Screen

### 2.1 Regions

| Region | Component | Content |
|---|---|---|
| Top | `stepper` | 10 dots with titles on hover, "Step 3 of 10", previous and next |
| Left | `lesson-step` | title, goal, explanation, `annotated-code`, "Try this", `callout`s |
| Centre | `code-editor` | the existing editor (`createEditor`), `run-button`, "Reset code", "Show me" |
| Right | `run-log` | the log, newest run first; `bar-chart` under it when the step has one |
| Overlay | `drawer` | `syntax-card` (opens from a "Syntax" `chip` in the editor header) |
| Inline | `tooltip` | the meaning of the token under the pointer or caret |

### 2.2 What is visible at each step

| Step | lesson, editor, run, log | rows `segmented` | chart | settings `chip`s | "Run again on the same table" |
|---|---|---|---|---|---|
| 1 | yes | no | no | no | no |
| 2 | yes | yes | no | no | no |
| 3 | yes | yes | yes | no | yes |
| 4, 5 | yes | yes | no | no | yes |
| 6, 7 | yes | yes | yes | no | yes |
| 8 | yes | yes | no | "memory rent: 100 × default" | yes |
| 9 | yes | yes | yes | no | yes |
| 10 | yes | yes | yes | compare-with `segmented`, rent `segmented` | yes |

The rows `segmented` has four values: 1 000, 10 000, 50 000 (default), 200 000.
A change marks the log "the table size changed: Run to see it" and does not run.

### 2.3 Desktop, 1280 px

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ multiview playground     ● ● ◉ ○ ○ ○ ○ ○ ○ ○   Step 3 of 10   ‹ prev  next › │
├────────────────────────┬────────────────────────────┬─────────────────────────┤
│ 3. Ask often, and it   │ [Syntax] rows: 1k 10k [50k]│ RUN LOG    clock: 5 µs  │
│    learns              │        200k                │ Run 1 · 50 000 rows     │
│ Goal: see the table    │ 1 // 2000 questions ...    │ line 2 × 2 000          │
│ build an index...      │ 2 for (let i = 0; ...      │ value  Answers 8 to 37  │
│                        │ 3   where(customer.eq(...  │ event  Queries 1 to 58: │
│ (explanation, ≤120 w)  │ 4 }                        │        scans, 143 µs... │
│                        │                            │ event  After query 58:  │
│ ┌ annotated-code ────┐ │                            │        built a grouped  │
│ │ for (...) { }      │ │                            │ ...                     │
│ │ └ repeat 2000 times│ │ [▶ Run]  [Run again on the │ ┌ bar-chart ──────────┐ │
│ └────────────────────┘ │  same table]  Reset  Show  │ │ ▇▇▇▇▇▇▇▇▇▇ scan only│ │
│ Try this: ...          │                            │ │ ▅▁▁▁▁▁▁▁▁▁ adaptive │ │
│                        │                            │ └ lower is better ... ┘ │
│      320 px            │        480 px              │        flex (≥ 400)     │
└────────────────────────┴────────────────────────────┴─────────────────────────┘
```

Below 1100 px the lesson column moves above the editor and log as a band,
collapsed to title and goal with a "More" toggle.

### 2.4 Phone, 390 px

```
┌──────────────────────────────┐
│ ‹  Step 3 of 10: Ask often › │  stepper, compact
│ Goal: see the table build an │
│ index. [More]                │  lesson-step collapsed
├──────────────────────────────┤
│ [Syntax]  rows [50k ▾]       │
│ 1 for (let i = 0; i < 2000.. │  code-editor, 12 lines high,
│ 2   where(customer.eq(rnd(.. │  horizontal scroll inside it
│ 3 }                          │
├──────────────────────────────┤
│ [▶ Run]   [Again]  [⋯]       │  ⋯ = Reset code, Show me
├──────────────────────────────┤
│ RUN LOG                      │
│ value  Answers 8 to 37 ...   │
│ event  After query 58: ...   │
│ ┌ bar-chart (full width) ──┐ │
│ └──────────────────────────┘ │
├──────────────────────────────┤
│ ▸ Explanation and Try this   │  drawer, closed by default
└──────────────────────────────┘
```

Editor first, then the run row, then the log. After Run on a phone the page
scrolls the first new log line into view.

## 3. The steps

Settings for every step unless stated: 50 000 rows, seed 1, eagerness 1, rent
`1e-5`, no memory limit. "Copies" lists the table copies a step runs (0
adaptive, 1 scan only, 2 grouped only, 3 sorted only, 4 grouped and sorted).

The sample logs come from a native build of `playground/playground.cpp`
(clang 23, libc++, `-O2`) driven by `compile()` on this machine. Counts, plans
and the order of events are what the browser will show: the WebAssembly build
uses the same libc++ generator. Times are samples: the browser is slower and
varies, and the query number of a build moves between runs (40 to 70 here).
Acceptance check 3 in section 8 confirms the counts on the real build.

### Step 1. Ask a question

- **Goal:** run one query and read its answer.
- **Copies:** 0. **New:** `where`, a field, `.eq`, `.count`.

```js
// Ask the table one question: how many orders has customer 42?
where(customer.eq(42)).count();
```

**Text.** The table holds 50 000 orders. Each order has three numbers: a
`customer`, an `amount` and a `day`. The line on the right is one question.
Press Run. The log shows the answer, how long it took, and how the table found
it. This table has no index yet, so it reads every row. That is a scan.

**Annotated code.**

```
where( customer.eq(42) ).count();
└─┬──┘ └──────┬───────┘ └──┬───┘
  │           │            └ count them: the answer is one number
  │           └ keep the rows where customer is 42
  └ from the table, take the rows where ...
```

**Try this.** Change 42 to 7 and run again. Then count the orders of day 100.

**Show me** (day 100): `where(day.eq(100)).count();`

**Log.**

```
Run 1 · fresh table, 50 000 rows · adaptive
line 2   where(customer.eq(42)).count()
  value   customer = 42: 23 rows
  timing  102 µs
  plan    scan: read all 50 000 rows and kept the 23 that match
```

### Step 2. A scan reads every row

- **Goal:** see that a scan costs time in proportion to the table size.
- **Copies:** 0. **New:** `for`, `rnd(n)`, `rows`; the rows `segmented`.

```js
// 20 questions, each about a random customer.
for (let i = 0; i < 20; i++) {
  where(customer.eq(rnd(rows / 20))).count();
}
```

**Text.** A loop asks the same kind of question many times. `rnd(n)` picks a
random number from 0 to n − 1, and `rows` is the table size, so
`rnd(rows / 20)` is a random customer (there are about 20 orders per customer).
Every query scans: the time per query depends on the rows the table must read,
not on the answer. Change the table size above the editor and run again.

**Annotated code.**

```
for (let i = 0; i < 20; i++) { ... }
└ repeat the lines inside 20 times; i counts 0, 1, 2 ... 19

customer.eq( rnd( rows / 20 ) )
             │    └ the table size divided by 20: the number of customers
             └ a random whole number from 0 up to that number, minus one
```

**Try this.** Run at 1 000, 10 000, 50 000 and 200 000 rows. The time per query
grows about as fast as the table.

**Log** (50 000 rows; at 1 000, 10 000 and 200 000 the scan took 2.3, 35 and
530 µs in the native run):

```
line 3   where(customer.eq(rnd(rows / 20))).count()   × 20
  value   20 queries. Answers from 14 to 31 rows, 20.3 on average.
  timing  133 µs each, 2.7 ms in total
  plan    scan: read all 50 000 rows for every query
  insight No index yet. The 20 scans cost 2.7 ms. The container builds an
          index when its scans cost more than a build would: about 7.5 ms here.
```

### Step 3. Ask often, and it learns

- **Goal:** see the container build an index, when, why, and what it gains.
- **Copies:** 0, 1. **New:** the event lines and the `bar-chart`. Chart series:
  scan only, adaptive.

```js
// The same question, 2000 times.
for (let i = 0; i < 2000; i++) {
  where(customer.eq(rnd(rows / 20))).count();
}
```

**Text.** Same loop, 100 times longer. The table measures each scan and keeps a
tally. When the scans have cost more than an index would cost to build, it
builds one. It guesses the build cost first (150 ns per row, so 7.5 ms at
50 000 rows) and learns the real cost after it has built one. From then on a
query is a lookup: it jumps to the rows of one customer. The scan only copy
gets the same queries and never builds anything.

**Try this.** Press "Run again on the same table": the index is already there,
so no query scans. Then ask about `day.eq(rnd(365))` and see which index it
builds.

**Show me** (day): `where(day.eq(rnd(365))).count();` inside the same loop.

**Log.**

```
line 3   where(customer.eq(rnd(rows / 20))).count()   × 2 000
  value   2 000 queries. Answers from 8 to 37 rows, 20.1 on average.
  event   Queries 1 to 58: scans, 130 µs each, 7.6 ms in total.
  event   After query 58: built a grouped index on customer in 0.75 ms.
          Why now: the scans had cost 7.6 ms, more than the estimate of a
          build (7.5 ms = 150 ns per row × 50 000 rows).
  event   Queries 59 to 2 000: lookups, 1.7 µs each on average; the last
          200 took 0.05 µs each. Some lookups are timed by the container;
          that is the extra.
  timing  adaptive 11.7 ms in total · scan only 260 ms, 130 µs each
  plan    now: look up the customer in the grouped index and read its rows
  insight The last 200 queries ran 2 600 times faster than on scan only.
```

### Step 4. Conditions: ranges and two at once

- **Goal:** write every kind of condition.
- **Copies:** 0. **New:** `ge gt le lt between`, two conditions.

```js
where(amount.ge(99000)).count();
where(amount.between(50000, 50999)).count();
where(day.lt(7)).count();
where(customer.eq(42), amount.ge(50000)).count();
```

**Text.** A condition is a field, a dot, and a comparison. `eq` is equal, `ge`
at least, `gt` more than, `le` at most, `lt` less than, `between(a, b)` from a
to b, both included. Put two conditions in `where`, with a comma, and a row
must meet both. The two must be on different fields.

**Annotated code.**

```
amount.between(50000, 50999)          customer.eq(42), amount.ge(50000)
       └ amount from 50 000 to 50 999,  └ customer is 42 ┘ └ and amount is
         both ends included                                  at least 50 000
```

**Try this.** Count the orders from day 100 to day 199 with an amount under
1 000.

**Show me:** `where(day.between(100, 199), amount.lt(1000)).count();`

**Log.**

```
line 1  value  amount ≥ 99 000: 484 rows               plan scan
line 2  value  amount from 50 000 to 50 999: 486 rows  plan scan
line 3  value  day < 7: 968 rows                       plan scan
line 4  value  customer = 42 and amount ≥ 50 000: 11 rows
        plan   scan: read all 50 000 rows and checked both conditions on each
timing  4 queries, 152 µs each
```

Short single statements use the compact form: value and plan on one line when
the plan is a plain scan.

### Step 5. Shape the answer

- **Goal:** sort, limit and pick the kind of answer.
- **Copies:** 0. **New:** `all`, `orderBy`, `limit`, `sumAmount`, `first`,
  `exists`.

```js
all().orderBy(amount, true).limit(3).sumAmount();
where(customer.eq(42)).orderBy(amount).first();
where(customer.eq(42), day.lt(100)).exists();
```

**Text.** The last word of a query says what you want back: `count()` a
number of rows, `exists()` yes or no, `first()` one row, `sumAmount()` the sum
of the amounts. Before it you can sort with `orderBy(field)` (add `true` for
largest first) and keep only the first n rows with `limit(n)`. `all()` is a
query without a condition.

**Annotated code.**

```
all() .orderBy(amount, true) .limit(3) .sumAmount();
└ every row └ largest amount first └ keep 3 └ add up their amounts
```

**Try this.** Find the order with the smallest amount. Then put line 1 in a loop
of 2000 and see the plan change from "scan and sort" to "walk".

**Show me:** `all().orderBy(amount).first();`

**Log.**

```
line 1  value  3 largest amounts, summed: 299 992
        plan   scan: read all 50 000 rows, then sorted them by amount, largest first
line 2  value  first row of customer = 42 by amount: row 11 020
               (customer 42, amount 13 446, day 61)
line 3  value  customer = 42 and day < 100: yes, at least one row
```

In the loop (try this), the event says: "After query 95: built an ordered
index on amount. Queries 96 to 2 000: walks: the table reads the ordered index
from the largest amount down and stops after 3 rows."

### Step 6. A hash cannot answer a range

- **Goal:** learn the index kinds and what each one can answer.
- **Copies:** 0, 2, 3. Chart series: grouped only, adaptive.

```js
// 2000 ranges of 500 on amount.
for (let i = 0; i < 2000; i++) {
  const a = rnd(99000);
  where(amount.between(a, a + 500)).count();
}
```

**Text.** An index comes in kinds. A hash (`grouped`, `swiss`, `hash`,
`dense`) jumps straight to one key, so it answers `eq` only. A sorted index
(`ordered`, `sorted_array`) keeps keys in order, so it answers `eq`, ranges and
`orderBy`. The grouped only copy has a hash on every field and still scans
here: a hash cannot find "every amount from a to a + 500". The adaptive copy
picks a kind that can.

**Try this.** Change the range to `amount.eq(rnd(100000))`. Now the hash works
and the adaptive copy builds a grouped index. Then change 2000 to 20000: around
query 10 000 the container tries a second sorted kind and compares the two.

**Show me:** `where(amount.eq(rnd(100000))).count();` in the same loop.

**Log.**

```
line 4   where(amount.between(a, a + 500)).count()   × 2 000
  value   2 000 queries. Answers from 205 to 297 rows, 251 on average.
  event   Queries 1 to 45: scans, 169 µs each, 7.6 ms in total.
  event   After query 45: built an ordered index on amount in 3.5 ms. It is
          the first allowed kind that can answer a range.
  event   Queries 46 to 2 000: range lookups, 0.47 µs each in the last 200.
  timing  adaptive 17 ms · grouped only 318 ms · sorted only 0.97 ms
  plan    now: find the start of the range in the ordered index, read to its end
  insight grouped only has a hash on amount and scanned every time: a hash
          cannot answer a range.
```

With 20000 queries the log adds (native run, adaptive only):

```
  event   After query 11 337: built sorted_array on amount to compare it with
          ordered. Why: ordered has now spent as much time on lookups as its
          build took (3.0 ms).
  event   After operation 35 248: dropped sorted_array on amount. ordered
          answered the same queries, so sorted_array saved nothing and its
          memory (675 KB) was not worth its rent.
```

### Step 7. Writes cost

- **Goal:** see that every index makes writes slower, and that the container
  drops an index that only costs.
- **Copies:** 0, 1, 3. **New:** `update(row, amount)`, `const`. Chart: the
  update line; series sorted only, adaptive.

```js
// 1000 range reads, then 40000 updates of amount.
for (let i = 0; i < 1000; i++) {
  const a = rnd(99000);
  where(amount.between(a, a + 500)).count();
}
for (let i = 0; i < 40000; i++) {
  update(rnd(rows), rnd(100000));
}
```

**Text.** `update(row, amount)` gives row number `row` a new amount. Every
index on amount must move that row to its new place, so each index adds time
to each write. The reads build an ordered index on amount. Then only writes
come. The index costs on every write and saves nothing, so the container drops
it. The sorted only copy keeps its index and keeps paying.

**Annotated code.**

```
const a = rnd(99000);        update( rnd(rows), rnd(100000) );
└ a name for one random      └ change the order in a random row:
  number, used twice           its new amount is a random number
```

**Try this.** Delete the first loop and run. With no reads, the adaptive copy
builds nothing and writes as fast as scan only.

**Show me:** the second loop alone.

**Log.**

```
line 4   where(amount.between(a, a + 500)).count()   × 1 000
  event   After query 54: built an ordered index on amount in 3.3 ms.
line 7   update(rnd(rows), rnd(100000))   × 40 000
  value   40 000 rows updated.
  event   Updates 1 to 25 849: 0.25 µs each. scan only: 0.01 µs each.
  event   After update 25 849: dropped the ordered index on amount. Every
          update moved a row inside it, no query used it, and those moves
          had cost more than building it again (3.3 ms).
  event   Updates 25 850 to 40 000: 0.01 µs each, the same as scan only.
  timing  sorted only kept its index: 0.22 µs per update all the way.
```

### Step 8. Memory is rent

- **Goal:** see an unused index dropped for the memory it holds.
- **Copies:** 0. **Settings:** rent `1e-3` (100 × default), shown as a `chip`.
  **New:** `label(name)`; a `stat` "index memory".

```js
label("by customer");
for (let i = 0; i < 2000; i++) {
  where(customer.eq(rnd(rows / 20))).count();
}
label("by day");
for (let i = 0; i < 10000; i++) {
  where(day.eq(rnd(365))).count();
}
```

**Text.** `label(name)` gives the next lines a name in the log. An index holds
memory, and the container charges it rent on every operation. An index that
answers queries earns more than its rent. When its queries stop, the rent eats
its savings and it goes. This step sets the rent 100 times higher than the
default so that you see it within 12 000 operations; at the default it takes
millions.

**Try this.** Ask about a customer on every tenth day query
(`if (i % 10 === 0) ...`). The customer index then earns its rent and stays.

**Show me:** add `if (i % 10 === 0) where(customer.eq(rnd(rows / 20))).count();`
inside the second loop.

**Log.**

```
by customer   line 3 × 2 000
  event   After query 54: built a grouped index on customer (651 KB).
by day        line 7 × 10 000
  event   After query 58 of "by day": built a grouped index on day (1.07 MB).
  event   After operation 4 400: dropped the grouped index on customer for
          rent. Its queries stopped, so it earned nothing, and 651 KB at this
          rent costs 651 ns per operation.
  stat    index memory: 0 → 651 KB → 1.72 MB → 1.07 MB
```

### Step 9. The price of adaptiveness

- **Goal:** measure what learning costs against a table that had the right
  index from the start.
- **Copies:** 0, 1, 2. Chart series: grouped only, adaptive.

The code is step 3's loop with the comment `// What does learning cost?`.

**Text.** A table built by hand with the right index (grouped only) is fast
from the first query. The adaptive table pays three prices: the scans before
it builds, the build, and the timing of some lookups. It also pays nothing at
all for indexes nobody needs. The log adds them up.

**Try this.** Change 2000 to 50. The container never builds, and pays the same
as scan only: for a short workload, learning costs more than it saves.

**Show me:** the loop with 50.

**Log.**

```
  timing  adaptive 11.7 ms · grouped only 0.25 ms · scan only 260 ms
  insight Adaptive spent 11.4 ms more than grouped only: 7.6 ms of scans
          before the index, 0.75 ms to build it, 3.1 ms of timed lookups and
          other work. That is 22 times less than scan only.
  insight In the last 200 queries the two were about the same.
```

### Step 10. Free play

- **Goal:** use the whole language.
- **Copies:** 0 plus one from the compare-with `segmented` (none, scan only,
  grouped only, sorted only, grouped and sorted; default scan only). Rent
  `segmented`: 0, default, 10 ×, 100 ×. The chart compares the two copies on
  the line with the most operations. New in the syntax card: `churn`, `zipf`.

```js
// Your workload. The syntax card lists every word.
for (let i = 0; i < 3000; i++) {
  if (i % 4 === 0) churn(rnd(rows), rnd(rows / 20), rnd(100000), rnd(365));
  else where(customer.eq(zipf(rows / 20, 0.8))).count();
}
```

**Text.** Everything is open. `churn` deletes a row and inserts a new one.
`zipf(n, skew)` picks small numbers more often, like popular customers. The
examples `drawer` holds the five v1 workloads (`EXAMPLES` ids
`lookups-ranges`, `topk`, `write-burst`, `churn`, `low-card`; the `L*` entries are v1 lessons and stay out). Below the
log: "The lab: the first playground, with every chart and setting."

**Log** (native sample): `3 000 operations: 750 churns, 2 250 queries. After
operation 62: built a grouped index on customer in 1.3 ms. adaptive 13.8 ms in
total · scan only 369 ms.` Free play has no fixed output.

## 4. Explaining the syntax

### 4.1 Annotated code

The `annotated-code` block shows each construct the first time a step uses it
(steps 1, 2, 4, 5, 7). The texts are in section 3. Behaviour:

- It renders below the explanation in `lesson-step`, in the editor's font, with
  one label per bracketed segment.
- Hover or focus on a segment highlights the matching tokens in the editor, and
  hover on those tokens highlights the segment.
- Data: `annotations: [{ code: "where( customer.eq(42) ).count();", parts: [{ text: "where(", label: "from the table, take the rows where ..." }, ...] }]`.

### 4.2 Tooltip on every token

Use the editor's existing hover (`hoverAt` in `complete.js`, docs from `VOCAB`).
v2 adds one line under the vocab doc: "First used in step N" with a link, from a
table in the step data. Keyboard: the same `tooltip` shows for the token at the
caret after 600 ms without typing. Numbers get a tooltip from their context:
"the value customer is compared with".

### 4.3 Syntax card

Opens in a `drawer` from the "Syntax" `chip`. Text in full:

> **A query**
> `where(condition, condition?)` or `all()` · then `.orderBy(field, largestFirst?)` · then `.limit(n)` · then one answer.
> Example: `where(customer.eq(42)).orderBy(amount).limit(5).sumAmount();`
>
> | Group | Words |
> |---|---|
> | Fields | `customer` (0 to rows/20 − 1, about 20 orders each) · `amount` (0 to 99 999) · `day` (0 to 364) |
> | Conditions | `.eq(v)` equal · `.ge(v)` at least · `.gt(v)` more than · `.le(v)` at most · `.lt(v)` less than · `.between(a, b)` a to b, both included. Two conditions must be on different fields. |
> | Shape | `.orderBy(field)` smallest first · `.orderBy(field, true)` largest first · `.limit(n)` at most n rows |
> | Answers | `.count()` how many · `.exists()` yes or no · `.first()` one row · `.sumAmount()` the sum of amount |
> | Writes | `update(row, amount)` new amount for one row · `churn(row, customer, amount, day)` delete a row, insert a new one |
> | Helpers | `rnd(n)` random 0 to n − 1 · `zipf(n, skew)` random, small numbers more often · `rows` the table size · `label(name)` names the next lines in the log |
> | JavaScript | `for`, `if`, `else`, `let`, `const`, arithmetic. Every query must end with an answer word, or it records nothing. |

Words that the current step has not introduced yet are shown dimmed, not hidden.

### 4.4 Error messages

Compile errors appear as the first line of `run-log` (`callout` warning) and as
the editor's marker on the line. Use the `compile()` message when it is already
plain. Rewrite these raw engine messages:

| Raw message (pattern) | Text shown |
|---|---|
| `X is not defined` | "`X` is not a word this table knows. Did you mean `Y`?" (the suggestion `compile` adds), else "Open Syntax for the list." |
| `X is not a function` | "`X` cannot be called here. After a field use `.eq`, `.ge`, `.gt`, `.le`, `.lt` or `.between`; after `where(...)` use `.orderBy`, `.limit` or an answer." |
| `Unexpected token` / `Unexpected identifier` | "Line N does not read as code. Check the brackets, commas and quotes on it." |
| `Cannot read properties of undefined` | "Line N uses something that has no value yet. Check the spelling of the names on it." |
| `the script recorded no operations` | "Nothing ran: no line ends with `.count()`, `.exists()`, `.first()`, `.sumAmount()`, `update` or `churn`." |
| lint "this query records nothing" | kept as is, as a warning; the run still goes |

## 5. The run log

### 5.1 Structure

The log is a list of runs, newest first. The last 3 runs stay open, older runs
fold into a `drawer`. A run has a header and one block per source line that
recorded operations, in order of first execution.

- **Header:** `Run 2 · same table · 50 000 rows · adaptive, scan only` (or
  `fresh table`). A `chip` at the right shows the clock: `clock: 5 µs` or
  `clock: 100 µs (coarse)`.
- **Block head:** `line N` and the source line text (trimmed to 60 characters),
  and `× count` when the line ran more than once. A click on the head selects
  the line in the editor.
- **Lines:** each has a type, shown as a small left label, in this order:
  `value`, `event`, `timing`, `plan`, `insight`. A block shows at most 8 lines;
  the rest go behind "N more".

A line of a single query with a plain scan plan uses the compact form (step 4).

### 5.2 Number format

Group thousands with a space: `50 000`. Times: under 1 µs, two significant
digits (`0.47 µs`); 1 to 999 µs, whole µs; 1 to 999 ms, two significant digits
(`7.6 ms`, `11 ms`, `260 ms`); from 1 s, one decimal. Bytes: KB and MB, base
1000, three significant digits. Ratios: two significant digits, then "times
faster" or "times slower"; under 1.3 in either direction write "about the
same".

### 5.3 The clock rule

At load, measure the tick with `timerResolution()` from `js/timer.js` and read
`crossOriginIsolated`. A measured total is trustworthy when it is at least 10
ticks (the v1 `isNoisy` rule). For a time per operation computed from a total
of `n` operations that is under 10 ticks, show the bound `10 × tick / n`:

- `under 0.25 µs each (faster than the clock can see; it ticks every 5 µs)`
- in a ratio: `at least 520 times faster`

When the clock is coarser than 20 µs, the run-log header `chip` opens a
`callout` tip: "This page has a coarse clock (100 µs). Serve it with
`make serve` for a 5 µs clock. Small times show as bounds."

### 5.4 Sentence templates

`{}` are values. Sources: **E** = `pg_exec_json()` (per chunk, summed), **R** =
`pg_results(copy)`, **X** = `pg_explain(record)`, **J** = `pg_json()`, **W** =
`pg_row(id)`, **ev** = an event from E (section 7.4). `q` counts the
operations of the current block, from 1.

| Line | Template | Sources |
|---|---|---|
| value, count | `{conditions}: {n} rows` (`1 row`, `no rows`) | R |
| value, exists | `{conditions}: yes, at least one row` / `no row matches` | R |
| value, first with orderBy | `first row of {conditions} by {field}: row {id} (customer {c}, amount {a}, day {d})` | R, W |
| value, first without orderBy | `{conditions}: there is a row` / `no row matches` | R |
| value, sumAmount | `{limit text}{conditions}, summed: {s}`; with limit and no orderBy: insight `limit without orderBy picks any rows, so the sum has no fixed answer` | R |
| value, loop of queries | `{n} queries. Answers from {min} to {max} rows, {mean} on average.` exists: `{k} of {n} found a row.` | R |
| value, writes | `{n} rows updated.` / `{n} rows replaced.` | count |
| event, scan phase | `Queries {a} to {b}: scans, {each} each, {total} in total.` total = `ev.t_ms − ev.build_ms` minus the time of earlier blocks | ev, E |
| event, first build | `After query {q}: built a {kind} index on {field} in {build_ms}.` then `Why now: the scans had cost {scan_ms}, more than the estimate of a build ({est} = {prior_build_ns} ns per row × {rows} rows).` | ev, J |
| event, later build | `After query {q}: built a {kind} index on {field} in {build_ms}. Its scans had cost about as much as building it.` | ev |
| event, range kind | appended to a build for a range: `It is the first allowed kind that can answer a range.` | ev |
| event, lookup phase | `Queries {a} to {b}: lookups, {each} each on average; the last {B} took {last} each.` Use `walks` when the plan is a walk. | E |
| event, trial | `After query {q}: built {kind} on {field} to compare it with {other}. Why: {other} has now spent as much time on lookups as its build took ({other_build_ms}).` | ev |
| event, drop twin | `After operation {q}: dropped {kind} on {field}. {other} answered the same queries, so {kind} saved nothing and its memory ({bytes}) was not worth its rent.` | ev |
| event, drop slower | `After query {q}: dropped {kind} on {field}: its lookups cost {p} against {p_other} for {other}.` | ev |
| event, drop rent | `After operation {q}: dropped the {kind} index on {field} for rent. Its queries stopped, so it earned nothing, and {bytes} at this rent costs {rent_ns} per operation.` rent_ns = rent × bytes | ev, J |
| event, drop writes | `After update {q}: dropped the {kind} index on {field}. Every update moved a row inside it, no query used it, and those moves had cost more than building it again ({build_ms}).` | ev |
| event, drop unfit | `Built {kind} on {field} and dropped it at once: the keys are too spread out for it.` | ev |
| event, write phases | `Updates {a} to {b}: {each} each.` once per phase between events; add `scan only: {each_scan} each.` when copy 1 runs | E |
| event, kept | `The table kept {list} from the last run.` on "Run again" | J |
| timing, single | `{t}`; with copies: `adaptive {t} · {copy} {t}` | E |
| timing, loop | `adaptive {total} in total · {copy} {total}, {each} each` | E |
| plan | `now: {words}` from X after the run; `scan: ...` when it never changed | X |
| insight, ratio | `The last {B} queries ran {ratio} faster than on {copy}.` | E |
| insight, no index yet | `No index yet. The {n} scans cost {t}. The container builds an index when its scans cost more than a build would: about {est} here.` Only when copy 0 scanned every query and `builds` is 0. | E, J |
| insight, price | `Adaptive spent {extra} more than {copy}: {scan_ms} of scans before the index, {build_ms} to build it, {rest} of timed lookups and other work.` | E, ev |
| insight, hash and range | `{copy} has a hash on {field} and scanned every time: a hash cannot answer a range.` when copy 2 ran a range block at scan speed | E |
| insight, stopped copy | `{copy} stopped after {n} operations: at {each} each the rest would take {s}.` | E |

Conditions text: `customer = 42`, `amount ≥ 99 000`, `amount > v`, `amount ≤ v`,
`day < 7`, `amount from 50 000 to 50 999`, joined with ` and `.

### 5.5 Plan in words

Map the `pg_explain` text. Unknown text shows raw in a `chip`.

| Plan text contains | Words |
|---|---|
| `scan N elements` | `scan: read all {N} rows and kept the {n} that match` (`... and checked both conditions on each` with 2 predicates) |
| `, sort by F descending` | `, then sorted them by {F}, largest first` (`ascending`: smallest first) |
| `probe K index on F (equality)` | `look up the {F} in the {K} index and read its rows` |
| `probe K index on F (range)` | `find the start of the range in the {K} index, read to its end` |
| `, filter 2 predicates` after a probe | `, then check the other condition on each` |
| `walk K index on F descending` | `walk the {K} index on {F} from the largest value down, stop after {limit}` |

## 6. The bar chart

One `bar-chart`, from step 3. It answers one question: time per query, group by
group.

- **Data:** the ops of one source line (the line with the most operations, or
  the step's `chart.line`). One group = `B` consecutive operations, `B` from
  section 7.3. For each group and each series, `ns per op` from E.
- **Bars:** one pair per group, two series at most, adaptive always second.
  Series colours come from the design system; series names are written at the
  right end of each series, next to its last bar. No legend box.
- **Y axis:** linear, from 0. Top = the largest value rounded up to 1, 2 or 5
  × 10ⁿ. Three labels: 0, half, top, in the unit of section 5.2, title
  `µs per query` (`per update` on write lines).
- **X axis:** label `queries 1 to {n}, in groups of {B}`; tick labels at the
  first, middle and last group (`1`, `1 000`, `2 000`).
- **Events:** a thin vertical marker before the group that holds a build or a
  drop, with a short label (`built grouped on customer`, `dropped ordered`).
  At most 3 markers; the rest show in the log only.
- **Below the clock:** a bar whose group total is under 10 ticks is drawn as an
  outline at the height of its bound, with `<` before its value in the
  `tooltip`.
- **Caption** (one line, under the chart, fixed text per step plus the ratio):
  - step 3: `Lower is better. The drop is the index being built. Now {ratio} faster than scan only.`
  - step 6: `Lower is better. grouped only cannot use its hash for a range and stays at scan speed.`
  - step 7: `Lower is better. The adaptive bars fall when the unused index is dropped.`
  - step 9: `Lower is better. The gap at the left is the price of learning; at the right the two are {ratio}.`
  - step 10: `Lower is better. {copy} against adaptive, line {N}.`
- **Hover or tap** a bar: `tooltip` `queries 201 to 400: 0.05 µs each (adaptive)`.
- **Phone:** full width, 180 px high, tick labels at first and last group only.

## 7. Technical frame

### 7.1 Files

Static page, plain ES modules, no build step, no network after load.

| File | Role |
|---|---|
| `playground/web/index.html` | v2 page; v1 moves to `lab.html` (outside this spec) |
| `js/v2/main.js` | wiring, step navigation, persistence |
| `js/v2/steps.js` | the ten steps as data (section 7.2) |
| `js/v2/bridge.js` | wasm wrapper: v1 `wasm.js` plus `setCopies`, `results`, `row`, events |
| `js/v2/run.js` | compile, chunk, execute, collect (no DOM) |
| `js/v2/narrate.js` | run data to log lines, every template of 5.4 (pure) |
| `js/v2/plan-words.js` | table 5.5 (pure) |
| `js/v2/chart.js` | the `bar-chart` (SVG) |
| `js/v2/annotate.js` | `annotated-code` |
| `js/editor/*` | reused as is, except the compile option of 7.5 |

### 7.2 Step data

```js
{ id: 3, title: "Ask often, and it learns", goal: "...", text: ["..."],
  annotations: [...], tryNext: ["..."], solution: "..." | null,
  code: "...", copies: [0, 1], settings: { rows: 50000, rent: 1e-5 },
  show: { rows: true, chart: true, again: true, chips: [] },
  chart: { series: [1, 0], line: null }, firstUse: { for: 2, rnd: 2 } }
```

### 7.3 Data flow of one Run

1. `compile(code, rows, 12345, { lines: true })`. On `ok: false`, show 4.4
   and stop.
2. Keep each record's user label (`rec[1]`) for the log. Overwrite `rec[1]`
   with the group index `floor(i / B)`, with `B = max(200, ceil(n / 50 / 200) × 200)`.
   `pg_exec` sorts by label, so script order is kept, and its per-label times
   become per-group times. Labels in v2 only name log sections.
3. Run: `pg_reset(rows, 1, 1, 0, rent, 0, 0, 0)`, `pg_set_copies(mask)`.
   "Run again on the same table" skips the reset.
4. Before the first chunk, `pg_explain` the first record of each block (the
   plan at start).
5. Execute in chunks of whole groups, at most 5 000 operations per
   `pg_exec`; await one animation frame between chunks. After each chunk read
   E (per-group ns per copy, events) and append R for each copy.
6. Time budget: after each chunk, a copy whose projected remaining time is over
   4 s leaves the mask for the rest of the run (insight "stopped copy").
7. After the last chunk: `pg_json` (counters, indexes, memory), `pg_explain`
   per block (plan now), `pg_row` for `first` answers with an order (at most 20).
8. `narrate(run)` builds the lines; the log and the chart render them.

The Run button turns into Stop while a run goes. Stop ends after the current
chunk and logs `Stopped after {n} of {total} operations.`

### 7.4 C++ changes (playground.cpp only)

1. `pg_set_copies(int mask)`: `pg_exec` skips copies not in the mask, and the
   agreement check compares only the copies that ran.
2. **Events.** In `pg_exec`, for copy 0 only: after each op compare `stats()`
   with the previous value (7 integers, no clock read). When it changed, diff
   `indexes()` against the last snapshot and append one event per change:
   `{ "op": i, "type": "build"|"trial"|"drop", "reason": "rent"|"twin"|"writes"|"slower"|"unfit"|"", "field": "customer", "kind": "grouped", "build_ms": 0.75, "bytes": 651268, "probe_ns": 0, "uses": 0, "other": "ordered", "t_ms": 8.31 }`.
   Reason: `rent_drops` went up → `rent`, or `twin` when another kind of that
   field is still live; built and dropped in the same op → `unfit`; the op was
   a write → `writes`; else `slower`. `t_ms` is the elapsed time on copy 0
   since the start of the call (one clock read per event). Bytes and probe time
   of a dropped index come from the snapshot before the drop. `pg_exec_json`
   gets `"events": [...]`. The compare should cost a few ns per op (not measured), against
   50 ns for the cheapest lookup in section 3: measure it before and after.
3. `pg_row(int id)`: pointer to 3 doubles (customer, amount, day) of row `id`
   in copy 0.
4. `pg_json` adds `"prior_build_ns"` (from `mv::policy`) and `"rent"`.

The checked-in `multiview.wasm` has no `pg_results` yet: rebuild it with
`make playground` after these changes (about 8 minutes).

### 7.5 Editor change

`compile(code, rows, seed, { lines: true })` writes the source line of each
operation into `rec[15]` (unused by C++). A stack capture costs about 4 µs in
V8 (measured: 200 000 captures took 800 ms in node 24), so capture it for the
first 2 000 operations and every 64th after; the others take the line of the
last operation with the same shape key. A line is "the line of the terminal
call or write".

### 7.6 Reset, accumulate, noise

- **Fresh table per Run**, seed 1, so answers repeat exactly. "Run again on the
  same table" keeps indexes and learned state and starts a new run section.
- A change of step, of rows or of settings resets the table and clears the log.
- Code edits persist per step in `localStorage` (wrapped in try/catch).
  "Reset code" restores the starting code; "Show me" replaces it with the
  solution and says so in a `callout` tip with an Undo.
- **Warm-up:** at load, run 2 000 mixed operations on a 10 000-row table and
  discard them, so the first measured run is not paying for the engine's
  compile tiers.
- **Noise:** narration uses phase totals, not single groups. The "last group"
  value uses the last full group. Differences under 1.3 × read "about the
  same". The clock rule (5.3) applies everywhere.

## 8. Acceptance checks

1. On step 1, one click on Run gives the first answer.
2. No chart before step 3. Each step shows only the regions of table 2.2.
3. The counts in section 3 match the WebAssembly build (23, 484, 486, 968, 11,
   299 992, row 11 020). If one differs, the generator differs: update this
   file, do not change the code.
4. Every template of 5.4 has a node test in `narrate.js`, including a bound
   case at 5 µs and at 100 µs ticks.
5. Each step's starting code and solution compile with no error and no lint
   warning, and step 3, 6, 7 and 8 show their events on a fresh run in Chrome
   and Firefox.
6. At 390 px: no horizontal page scroll, the editor is the first block under
   the stepper.

