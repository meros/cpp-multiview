// The example scripts: the five from the first playground and the seven lesson scripts.

export const EXAMPLES = [
  {
    id: "lookups-ranges",
    title: "Point lookups and ranges",
    description: "Skewed customer lookups, amount ranges, and a two-field lookup.",
    script: `// 3000 lookups by customer, 1000 amount ranges, 500 combined lookups.
for (let i = 0; i < 3000; i++) { label("customer = ?"); where(customer.eq(zipf(2500, 0.8))).count(); }
for (let i = 0; i < 1000; i++) { label("amount range"); const a = rnd(90000); where(amount.between(a, a + 300)).count(); }
for (let i = 0; i < 500; i++) { label("customer and amount"); where(customer.eq(rnd(2500)), amount.ge(50000)).count(); }`,
  },
  {
    id: "topk",
    title: "Top-k and ordering",
    description: "The largest orders, the cheapest orders of one customer, and an exists check.",
    script: `// The ten largest orders, the newest cheap orders of one customer.
for (let i = 0; i < 2000; i++) { label("top 10 amount"); all().orderBy(amount, true).limit(10).sumAmount(); }
for (let i = 0; i < 2000; i++) { label("5 smallest of a customer"); where(customer.eq(rnd(2500))).orderBy(amount).limit(5).first(); }
for (let i = 0; i < 1000; i++) { label("exists"); where(day.eq(rnd(365)), amount.gt(99000)).exists(); }`,
  },
  {
    id: "write-burst",
    title: "Read-mostly with a write burst",
    description: "Range reads, then 3000 updates of the indexed field, then the same reads again.",
    script: `// Reads, then 3000 updates that change the indexed field, then reads again.
for (let i = 0; i < 1500; i++) { label("read before"); where(amount.between(rnd(90000), 90000 + rnd(9000))).count(); }
for (let i = 0; i < 3000; i++) { label("update"); update(rnd(rows), rnd(100000)); }
for (let i = 0; i < 1500; i++) { label("read after"); where(amount.between(rnd(90000), 90000 + rnd(9000))).count(); }`,
  },
  {
    id: "churn",
    title: "Churn",
    description: "Rows leave and arrive while lookups continue.",
    script: `// Rows leave and arrive while lookups continue.
for (let i = 0; i < 4000; i++) {
  if (i % 4 === 0) { label("churn"); churn(rnd(rows), rnd(2500), rnd(100000), rnd(365)); }
  else { label("lookup"); where(customer.eq(rnd(2500))).count(); }
}`,
  },
  {
    id: "low-card",
    title: "Low-cardinality field",
    description: "day has 365 values and many rows per key. Which kind copes best?",
    script: `// day has 365 values: many rows per key. Which kind copes best?
for (let i = 0; i < 2000; i++) { label("day = ?"); where(day.eq(rnd(365))).count(); }
for (let i = 0; i < 1000; i++) { label("day range"); const d = rnd(300); where(day.between(d, d + 5)).count(); }`,
  },
  {
    id: "L1",
    title: "Lesson 1: a scan grows",
    description: "400 lookups by customer. Run it at four table sizes.",
    script: `// 400 lookups by customer. Each matches about 20 rows.
for (let i = 0; i < 400; i++) {
  label("lookup");
  where(customer.eq(rnd(rows / 20))).count();
}`,
  },
  {
    id: "L2",
    title: "Lesson 2: an index pays for itself",
    description: "2000 skewed customer lookups. Watch the adaptive copy build an index.",
    script: `// 2000 lookups by customer, some customers more popular than others.
for (let i = 0; i < 2000; i++) {
  label("lookup");
  where(customer.eq(zipf(rows / 20, 0.5))).count();
}`,
  },
  {
    id: "L3",
    title: "Lesson 3: what an index costs",
    description: "Reads, then a burst of writes to amount, then churn.",
    script: `// Reads, then a burst of writes to amount, then churn.
for (let i = 0; i < 1000; i++) { label("read"); where(customer.eq(rnd(rows / 20))).count(); }
for (let i = 0; i < 20000; i++) { label("update"); update(rnd(rows), rnd(100000)); }
for (let i = 0; i < 5000; i++) { label("churn"); churn(rnd(rows), rnd(rows / 20), rnd(100000), rnd(365)); }`,
  },
  {
    id: "L4",
    title: "Lesson 4: no kind wins everywhere",
    description: "Three query shapes, three different best index kinds.",
    script: `// Three query shapes, three different best kinds.
for (let i = 0; i < 1500; i++) { label("day = ?"); where(day.eq(rnd(365))).count(); }
for (let i = 0; i < 1500; i++) { label("amount range"); const a = rnd(99000); where(amount.between(a, a + 500)).count(); }
for (let i = 0; i < 1500; i++) { label("customer = ?"); where(customer.eq(rnd(rows / 20))).count(); }`,
  },
  {
    id: "L5",
    title: "Lesson 5: how the container chooses",
    description: "Customer lookups with a few day lookups, for many passes.",
    script: `// Lookups by customer, a few by day, for 8 passes.
for (let i = 0; i < 3000; i++) {
  label("customer = ?");
  where(customer.eq(zipf(rows / 20, 0.3))).count();
}
for (let i = 0; i < 500; i++) { label("day = ?"); where(day.eq(rnd(365))).count(); }`,
  },
  {
    id: "L6b",
    title: "Lesson 6: unused indexes pay rent",
    description: "The workload moved: only ranges of amount now.",
    script: `// The workload moved: only ranges of amount now.
for (let i = 0; i < 3000; i++) {
  label("amount range");
  const a = rnd(99000);
  where(amount.between(a, a + 300)).count();
}`,
  },
  {
    id: "L7",
    title: "Lesson 7: what adaptiveness costs",
    description: "Three phases: lookups, ranges, top 10. Each needs a different index.",
    script: `// Three phases: lookups, ranges, top 10. Each is a different index.
for (let i = 0; i < 2000; i++) { label("customer = ?"); where(customer.eq(rnd(rows / 20))).count(); }
for (let i = 0; i < 1000; i++) { label("amount range"); const a = rnd(99000); where(amount.between(a, a + 300)).count(); }
for (let i = 0; i < 1000; i++) { label("top 10"); all().orderBy(amount, true).limit(10).sumAmount(); }`,
  },
];
