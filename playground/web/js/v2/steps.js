// The ten steps as data (spec 7.2). Texts, annotations, solutions and starting code follow spec section 3.
// `copies` lists the table copies a step runs (0 adaptive, 1 scan only, 2 grouped only, 3 sorted only, 4 grouped and sorted).
// `narrate` flags select the optional sentences of 5.4 (price, memory). `firstUse` lists the words the step introduces.

export const DEFAULT_RENT = 1e-5;
export const ROW_CHOICES = [1000, 10000, 50000, 200000];
export const DEFAULT_ROWS = 50000;
export const COMPARE_CHOICES = [
  { value: null, label: "none" },
  { value: 1, label: "scan only" },
  { value: 2, label: "grouped only" },
  { value: 3, label: "sorted only" },
  { value: 4, label: "grouped and sorted" },
];
export const RENT_CHOICES = [
  { value: 0, label: "0" },
  { value: DEFAULT_RENT, label: "default" },
  { value: DEFAULT_RENT * 10, label: "10×" },
  { value: DEFAULT_RENT * 100, label: "100×" },
];
export const FREE_PLAY_EXAMPLES = ["lookups-ranges", "topk", "write-burst", "churn", "low-card"];

const loop3 = `for (let i = 0; i < 2000; i++) {
  where(customer.eq(rnd(rows / 20))).count();
}`;

const show = (o) => ({ rows: false, chart: false, again: false, chips: [], ...o });

export const STEPS = [
  {
    id: 1,
    done: "You asked one question and read the answer, the time and the plan.",
    title: "Ask a question",
    goal: "Run one query and read its answer.",
    text: [
      "The table holds 50 000 orders. Each order has three numbers: a `customer`, an `amount` and a `day`. The line on the right is one question. Press Run. The log shows the answer, how long it took, and how the table found it. This table has no index yet, so it reads every row. That is a scan.",
    ],
    annotations: [
      {
        code: "where( customer.eq(42) ).count();",
        parts: [
          { text: "where(", label: "from the table, take the rows where ..." },
          { text: "customer.eq(42)", label: "keep the rows where customer is 42" },
          { text: ".count()", label: "count them: the answer is one number" },
        ],
      },
    ],
    tryNext: ["Change 42 to 7 and run again.", "Then count the orders of day 100."],
    code: `// Ask the table one question: how many orders has customer 42?
where(customer.eq(42)).count();`,
    solution: "where(day.eq(100)).count();",
    copies: [0],
    settings: { rows: DEFAULT_ROWS, rent: DEFAULT_RENT },
    show: show({}),
    chart: null,
    narrate: {},
    firstUse: { where: 1, customer: 1, amount: 1, day: 1, eq: 1, count: 1 },
  },
  {
    id: 2,
    done: "A scan costs time in proportion to the table size.",
    title: "A scan reads every row",
    goal: "See that a scan costs time in proportion to the table size.",
    text: [
      "A loop asks the same kind of question many times. `rnd(n)` picks a random number from 0 to n − 1, and `rows` is the table size, so `rnd(rows / 20)` is a random customer (there are about 20 orders per customer). Every query scans: the time per query depends on the rows the table must read, not on the answer. Change the table size above the editor and run again.",
    ],
    annotations: [
      {
        code: "for (let i = 0; i < 20; i++) { ... }",
        parts: [{ text: "for (let i = 0; i < 20; i++)", label: "repeat the lines inside 20 times; i counts 0, 1, 2 ... 19" }],
      },
      {
        code: "customer.eq(rnd(rows / 20))",
        parts: [
          { text: "rnd(", label: "a random whole number from 0 up to that number, minus one" },
          { text: "rows / 20", label: "the table size divided by 20: the number of customers" },
        ],
      },
    ],
    tryNext: ["Run at 1 000, 10 000, 50 000 and 200 000 rows. The time per query grows about as fast as the table."],
    code: `// 20 questions, each about a random customer.
for (let i = 0; i < 20; i++) {
  where(customer.eq(rnd(rows / 20))).count();
}`,
    solution: null,
    copies: [0],
    settings: { rows: DEFAULT_ROWS, rent: DEFAULT_RENT },
    show: show({ rows: true }),
    chart: null,
    narrate: {},
    firstUse: { for: 2, rnd: 2, rows: 2 },
  },
  {
    id: 3,
    done: "The table built an index when scans cost more than a build, and then each query was a lookup.",
    title: "Ask often, and it learns",
    goal: "See the container build an index, when, why, and what it gains.",
    text: [
      "Same loop, 100 times longer. The table measures each scan and keeps a tally. When the scans have cost more than an index would cost to build, it builds one. It guesses the build cost first (150 ns per row, so 7.5 ms at 50 000 rows) and learns the real cost after it has built one. From then on a query is a lookup: it jumps to the rows of one customer. The scan only copy gets the same queries and never builds anything.",
    ],
    annotations: [],
    tryNext: [
      "Press “Run again on the same table”: the index is already there, so no query scans.",
      "Then ask about `day.eq(rnd(365))` and see which index it builds.",
    ],
    code: `// The same question, 2000 times.
${loop3}`,
    solution: `// The same question, 2000 times, about a day.
for (let i = 0; i < 2000; i++) {
  where(day.eq(rnd(365))).count();
}`,
    copies: [0, 1],
    settings: { rows: DEFAULT_ROWS, rent: DEFAULT_RENT },
    show: show({ rows: true, chart: true, again: true }),
    chart: { series: [1, 0], line: null },
    narrate: {},
    firstUse: {},
  },
  {
    id: 4,
    done: "You wrote every kind of condition, alone and in pairs.",
    title: "Conditions: ranges and two at once",
    goal: "Write every kind of condition.",
    text: [
      "A condition is a field, a dot, and a comparison. `eq` is equal, `ge` at least, `gt` more than, `le` at most, `lt` less than, `between(a, b)` from a to b, both included. Put two conditions in `where`, with a comma, and a row must meet both. The two must be on different fields.",
    ],
    annotations: [
      {
        code: "amount.between(50000, 50999)",
        parts: [{ text: ".between(50000, 50999)", label: "amount from 50 000 to 50 999, both ends included" }],
      },
      {
        code: "customer.eq(42), amount.ge(50000)",
        parts: [
          { text: "customer.eq(42)", label: "customer is 42" },
          { text: "amount.ge(50000)", label: "and amount is at least 50 000" },
        ],
      },
    ],
    tryNext: ["Count the orders from day 100 to day 199 with an amount under 1 000."],
    code: `where(amount.ge(99000)).count();
where(amount.between(50000, 50999)).count();
where(day.lt(7)).count();
where(customer.eq(42), amount.ge(50000)).count();`,
    solution: "where(day.between(100, 199), amount.lt(1000)).count();",
    copies: [0],
    settings: { rows: DEFAULT_ROWS, rent: DEFAULT_RENT },
    show: show({ rows: true, again: true }),
    chart: null,
    narrate: {},
    firstUse: { ge: 4, gt: 4, le: 4, lt: 4, between: 4 },
  },
  {
    id: 5,
    done: "You shaped the answer with a sort, a limit and a kind of answer.",
    title: "Shape the answer",
    goal: "Sort, limit and pick the kind of answer.",
    text: [
      "The last word of a query says what you want back: `count()` a number of rows, `exists()` yes or no, `first()` one row, `sumAmount()` the sum of the amounts. Before it you can sort with `orderBy(field)` (add `true` for largest first) and keep only the first n rows with `limit(n)`. `all()` is a query without a condition.",
    ],
    annotations: [
      {
        code: "all().orderBy(amount, true).limit(3).sumAmount();",
        parts: [
          { text: "all()", label: "every row" },
          { text: ".orderBy(amount, true)", label: "largest amount first" },
          { text: ".limit(3)", label: "keep 3" },
          { text: ".sumAmount()", label: "add up their amounts" },
        ],
      },
    ],
    tryNext: [
      "Find the order with the smallest amount.",
      "Then put line 1 in a loop of 2000 and see the plan change from “scan and sort” to “walk”.",
    ],
    code: `all().orderBy(amount, true).limit(3).sumAmount();
where(customer.eq(42)).orderBy(amount).first();
where(customer.eq(42), day.lt(100)).exists();`,
    solution: "all().orderBy(amount).first();",
    copies: [0],
    settings: { rows: DEFAULT_ROWS, rent: DEFAULT_RENT },
    show: show({ rows: true, again: true }),
    chart: null,
    narrate: {},
    firstUse: { all: 5, orderBy: 5, limit: 5, sumAmount: 5, first: 5, exists: 5 },
  },
  {
    id: 6,
    done: "A hash answers one key; only a sorted index answers a range.",
    title: "A hash cannot answer a range",
    goal: "Learn the index kinds and what each one can answer.",
    text: [
      "An index comes in kinds. A hash (`grouped`, `swiss`, `hash`, `dense`) jumps straight to one key, so it answers `eq` only. A sorted index (`ordered`, `sorted_array`) keeps keys in order, so it answers `eq`, ranges and `orderBy`. The grouped only copy has a hash on every field and still scans here: a hash cannot find “every amount from a to a + 500”. The adaptive copy picks a kind that can.",
    ],
    annotations: [],
    tryNext: [
      "Change the range to `amount.eq(rnd(100000))`. Now the hash works and the adaptive copy builds a grouped index.",
      "Then change 2000 to 20000: around query 10 000 the container tries a second sorted kind and compares the two.",
    ],
    code: `// 2000 ranges of 500 on amount.
for (let i = 0; i < 2000; i++) {
  const a = rnd(99000);
  where(amount.between(a, a + 500)).count();
}`,
    solution: `// 2000 equality lookups on amount.
for (let i = 0; i < 2000; i++) {
  where(amount.eq(rnd(100000))).count();
}`,
    copies: [0, 2, 3],
    settings: { rows: DEFAULT_ROWS, rent: DEFAULT_RENT },
    show: show({ rows: true, chart: true, again: true }),
    chart: { series: [2, 0], line: null },
    narrate: {},
    firstUse: {},
  },
  {
    id: 7,
    done: "Every index slows writes, and the table drops an index that only costs.",
    title: "Writes cost",
    goal: "See that every index makes writes slower, and that the container drops an index that only costs.",
    text: [
      "`update(row, amount)` gives row number `row` a new amount. Every index on amount must move that row to its new place, so each index adds time to each write. The reads build an ordered index on amount. Then only writes come. The index costs on every write and saves nothing, so the container drops it. The sorted only copy keeps its index and keeps paying.",
    ],
    annotations: [
      {
        code: "const a = rnd(99000);",
        parts: [{ text: "const a = rnd(99000);", label: "a name for one random number, used twice" }],
      },
      {
        code: "update(rnd(rows), rnd(100000));",
        parts: [{ text: "update(rnd(rows), rnd(100000))", label: "change the order in a random row: its new amount is a random number" }],
      },
    ],
    tryNext: ["Delete the first loop and run. With no reads, the adaptive copy builds nothing and writes as fast as scan only."],
    code: `// 1000 range reads, then 40000 updates of amount.
for (let i = 0; i < 1000; i++) {
  const a = rnd(99000);
  where(amount.between(a, a + 500)).count();
}
for (let i = 0; i < 40000; i++) {
  update(rnd(rows), rnd(100000));
}`,
    solution: `// 40000 updates of amount, and no reads.
for (let i = 0; i < 40000; i++) {
  update(rnd(rows), rnd(100000));
}`,
    copies: [0, 1, 3],
    settings: { rows: DEFAULT_ROWS, rent: DEFAULT_RENT },
    show: show({ rows: true, chart: true, again: true }),
    chart: { series: [3, 0], line: null },
    narrate: {},
    firstUse: { update: 7, const: 7 },
  },
  {
    id: 8,
    done: "An index that stops earning is dropped for the memory it holds.",
    title: "Memory is rent",
    goal: "See an unused index dropped for the memory it holds.",
    text: [
      "`label(name)` gives the next lines a name in the log. An index holds memory, and the container charges it rent on every operation. An index that answers queries earns more than its rent. When its queries stop, the rent eats its savings and it goes. This step sets the rent 100 times higher than the default so that you see it within 12 000 operations; at the default it takes millions.",
    ],
    annotations: [],
    tryNext: ["Ask about a customer on every tenth day query (`if (i % 10 === 0) ...`). The customer index then earns its rent and stays."],
    code: `label("by customer");
for (let i = 0; i < 2000; i++) {
  where(customer.eq(rnd(rows / 20))).count();
}
label("by day");
for (let i = 0; i < 10000; i++) {
  where(day.eq(rnd(365))).count();
}`,
    solution: `label("by customer");
for (let i = 0; i < 2000; i++) {
  where(customer.eq(rnd(rows / 20))).count();
}
label("by day");
for (let i = 0; i < 10000; i++) {
  where(day.eq(rnd(365))).count();
  if (i % 10 === 0) where(customer.eq(rnd(rows / 20))).count();
}`,
    copies: [0],
    settings: { rows: DEFAULT_ROWS, rent: DEFAULT_RENT * 100 },
    show: show({ rows: true, again: true, chips: ["rent"] }),
    chart: null,
    narrate: { memory: true },
    firstUse: { label: 8 },
  },
  {
    id: 9,
    done: "Learning has a price: scans before the index, the build and some timed lookups.",
    title: "The price of adaptiveness",
    goal: "Measure what learning costs against a table that had the right index from the start.",
    text: [
      "A table built by hand with the right index (grouped only) is fast from the first query. The adaptive table pays three prices: the scans before it builds, the build, and the timing of some lookups. It also pays nothing at all for indexes nobody needs. The log adds them up.",
    ],
    annotations: [],
    tryNext: ["Change 2000 to 50. The container never builds, and pays the same as scan only: for a short workload, learning costs more than it saves."],
    code: `// What does learning cost?
${loop3}`,
    solution: `// What does learning cost?
for (let i = 0; i < 50; i++) {
  where(customer.eq(rnd(rows / 20))).count();
}`,
    copies: [0, 1, 2],
    settings: { rows: DEFAULT_ROWS, rent: DEFAULT_RENT },
    show: show({ rows: true, chart: true, again: true }),
    chart: { series: [2, 0], line: null },
    narrate: { price: true },
    firstUse: {},
  },
  {
    id: 10,
    done: "You used the whole language.",
    title: "Free play",
    goal: "Use the whole language.",
    text: [
      "Everything is open. `churn` deletes a row and inserts a new one. `zipf(n, skew)` picks small numbers more often, like popular customers. The Examples drawer holds five workloads to start from, and the Syntax card lists every word.",
    ],
    annotations: [],
    tryNext: ["Change the compare-with setting above the editor and run again."],
    code: `// Your workload. The syntax card lists every word.
for (let i = 0; i < 3000; i++) {
  if (i % 4 === 0) churn(rnd(rows), rnd(rows / 20), rnd(100000), rnd(365));
  else where(customer.eq(zipf(rows / 20, 0.8))).count();
}`,
    solution: null,
    copies: [0],
    settings: { rows: DEFAULT_ROWS, rent: DEFAULT_RENT },
    show: show({ rows: true, chart: true, again: true, chips: ["compare", "rent"] }),
    chart: { series: null, line: null, dynamic: true },
    narrate: {},
    firstUse: { churn: 10, zipf: 10 },
  },
];

export const STEP_COUNT = STEPS.length;
export const stepById = (id) => STEPS.find((s) => s.id === id) || STEPS[0];

// word -> step number in which it is first used
export const FIRST_USE = (() => {
  const map = {};
  for (const s of STEPS) for (const w of Object.keys(s.firstUse || {})) if (!(w in map)) map[w] = s.id;
  return map;
})();

// The caption under the chart (spec section 6). `ratio` is the text computed from the run, or null.
export function captionFor(step, ctx = {}) {
  const { ratio = null, copy = null, line = null } = ctx;
  switch (step.id) {
    case 3: return `Lower is better. The drop is the index being built.${ratio ? ` Now ${ratio} scan only.` : ""}`;
    case 6: return "Lower is better. grouped only cannot use its hash for a range and stays at scan speed.";
    case 7: return "Lower is better. The adaptive bars fall when the unused index is dropped.";
    case 9: return `Lower is better. The gap at the left is the price of learning; at the right the two are ${ratio || "about the same"}.`;
    case 10: return `Lower is better. ${copy ? copy : "The copy"} against adaptive${line ? `, line ${line}` : ""}.`;
    default: return "Lower is better.";
  }
}
