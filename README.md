# multiview

A C++23 container that picks its own indexes.

You declare which fields may be queried. You ask questions. multiview watches
the questions, builds an index when scans get expensive, compares index kinds
by measured time, and drops the ones that do not pay for themselves. It works
from 10 elements to millions. Single header, no dependencies.

```cpp
#include "multiview.hpp"

struct User { std::uint64_t id; std::string city; int age; };

// One line: these members may be queried. Names come from the compiler.
mv::indexed<User, &User::id, &User::city, &User::age> users;
users.insert({1, "Lund", 31});

// Fields as values: a query reads like a condition. Nothing runs until the terminal call.
constexpr auto city = mv::col<&User::city>;
constexpr auto age  = mv::col<&User::age>;

users.where(city == "Lund" && age >= 30).count();
users.where(city == "Åre").order_by(age, /*descending=*/true).limit(3).first();
for (const User& u : users.where(age < 20).rows()) print(u);

users.where(city == "Lund").explain();  // "probe grouped index on city (equality)"
users.report();                         // every index: state, probe ns, uses, memory
```

[Interactive playground](#playground) · [Examples](examples/) · [Index kinds](docs/KINDS.md) · [Design and cost model](docs/DESIGN.md)

## When to use it

Use it when you do not know the access pattern in advance, or the pattern
changes: a cache with several lookup keys, an in-memory table in a tool or
game, a registry that grows from a handful to millions of entries.

Do not use it when you know the pattern. A fixed set of indexes
(Boost.MultiIndex, or one `unordered_map`) has no learning phase and no
sampling. multiview always pays a price for adapting (see
[the cost](#what-adapting-costs)).

## API

### Declare

```cpp
mv::indexed<T, &T::a, &T::b> c;                 // a grouped hash + an ordered index may serve each field
mv::indexed_all<T, &T::a, &T::b> c;             // every built-in kind may serve each field
mv::multiview<T, mv::fld<&T::a>, mv::field_decl<&T::b, mv::ordered, mv::sorted_array>> c(policy);
```

`mv::field_decl<&T::m, Kinds...>` lists the index kinds the planner may use for
a member, in the order it tries them. A field type must be default
constructible, copyable and ordered by `<`.

### Store

| Call | Meaning |
|---|---|
| `insert(T)`, `emplace(args...)` | add; returns `mv::id` |
| `insert_range(range)` | add many |
| `erase(id)` | remove |
| `modify(id, fn)` | change an element; indexes follow. The only safe way to change one |
| `operator[](id)`, `get(id)`, `contains(id)` | read |
| `size()`, `empty()`, `clear()`, `reserve(n)` | size |
| `for_each_item(fn(id, const T&))` | visit all |

An `id` is a slot number. It stays valid until the element is erased. A later
insert can reuse the slot.

### Query

`where(preds...)` builds a lazy query. All predicates must hold.

| Predicate | Meaning |
|---|---|
| `col<&T::f> == v`, `<`, `<=`, `>`, `>=`, `.between(lo, hi)` | f compared with v |
| `eq<&T::f>(v)`, `ge`, `gt`, `le`, `lt`, `between` | the same as functions |
| `a && b` | both hold: `where(age >= 30 && city == "Lund")` |

| Modifier | Meaning |
|---|---|
| `.order_by(col<&T::f>, descending = false)` or `.order_by<&T::f>(...)` | sort by a field. Equal keys come by id (reversed when descending) |
| `.limit(n)` | at most n results |

| Terminal | Meaning |
|---|---|
| `.for_each(fn)` | call `fn(id)` per result; return `false` to stop |
| `.ids()`, `.rows()` | the ids, or the elements: `for (const T& t : q.rows())` |
| `.first()`, `.exists()`, `.count()` | stop early where they can |
| `.erase()`, `.update(fn)` | change every result; return how many |
| `.explain()` | the plan, as text |

`all()` is a query with no predicate. `order_by` with `limit` walks an ordered
index and stops early, so `all().order_by(f).first()` is a minimum. Result
order is unspecified without `order_by`.

### Control and introspection

```cpp
auto& o = c.options();            // mv::policy&; it is an aggregate, so designated init works too
o.adaptive = false;               // freeze the set of indexes
o.max_index_bytes = 64 << 20;     // memory limit for indexes
o.rent_ns_per_byte_op = 2e-5;     // what a byte of index costs per operation (default 1e-5)
o.eagerness = 0.5;                // build sooner (default 1.0)

c.build_index<&T::a, mv::grouped>();   // build now (a hint: the container may drop it later)
c.drop_index<&T::a, mv::grouped>();
c.indexes();    // every (field, kind): live, probe ns, build ms, uses, bytes
c.report();     // the same as a table
c.stats();      // scans, probes, walks, builds, drops, rent drops, trials
```

See `mv::policy` in the header for every knob, with its unit.

### Index kinds

| Kind | Answers | Use it when |
|---|---|---|
| `grouped` | equality | the default for equality: one slot per distinct key, so fastest with repeated keys and strings, and the leanest hash |
| `swiss` | equality | one slot per (key, id); about as fast as `grouped` on unique keys |
| `dense` | equality, integer keys in a small range | days, enums, small ids: the fastest of all |
| `ordered` | equality, ranges, order | balanced reads and writes |
| `sorted_array` | equality, ranges, order | reads dominate: leanest, fastest lookups, slow writes |
| `hash` | equality | unique keys where latency is all that matters. 2.5x the memory of `grouped` |

[docs/KINDS.md](docs/KINDS.md) has measurements, every tunable parameter and the research behind the choice.

### Add your own index kind

Write a class template over the key type that meets a small contract: `name`,
`supports(op)`, `add`, `remove`, `probe(lo, hi, descending, fn)`, `clear`,
`reserve`, `bytes`. List it in a `field_decl`. The container measures it like
every other kind: it is built, tried, compared and dropped. A missing member
produces a compile error that names it. To configure or rename a built-in kind,
derive from it. `examples/custom_kind.cpp` shows both, plus a custom hash
function.

### Rules

- Change an element only through `modify`. A write through a reference
  breaks the indexes, as in Boost.MultiIndex and any hash container.
- Do not change the container inside a callback. A nested query is allowed.
- No thread safety. A query updates statistics, so a read needs exclusive
  access too.

## How it works

1. A query that finds no index scans. The scan time is measured and charged to
   one field. A walk over an ordered index that filters badly is charged the
   same way.
2. When the charged time reaches the measured build time, the container builds
   an index (ski rental: the waste is bounded by the build cost). How eager it
   is adapts: builds that paid off make it sooner, builds dropped unpaid make
   it later.
3. Later queries probe the index. One call in 16 is timed at first. The
   interval grows while nothing changes.
4. Once the first index has spent as much time probing as it took to build, the
   container builds another kind for the same operation, one at a time. The
   planner uses the cheaper kind (probe time, write time and memory rent,
   weighted by the observed mix) and probes the other now and then.
5. A maintained index is never free. Every live index pays rent in memory on
   every operation and earns credit when it serves a query. One that cannot pay
   its rent, its write cost and its patience is dropped.

[docs/DESIGN.md](docs/DESIGN.md) has the cost model and the reasoning.

## Measurements

Nanoseconds per operation on one core (GCC 16, `-O2`), 1000 operations per
cell, the minimum of several runs. Equal-key probes return about 4 results.
`adaptive` includes the learning phase. `adaptive*` runs 20 000 operations
first, so it shows the steady state. `grouped` is a frozen container with a grouped
hash on `a` and an ordered index on `b`; `ordered` has an ordered index on both.
The Boost column uses hand-picked indexes (a hash on `a`, an ordered
index on `b`).

| Workload | N | scan | adaptive | adaptive* | grouped | ordered | boost |
|---|---:|---:|---:|---:|---:|---:|---:|
| equality on `a` | 10 | 18 | 20 | 22 | 17 | 23 | 11 |
| equality on `a` | 1,000 | 1,758 | 260 | 32 | 27 | 57 | 28 |
| equality on `a` | 100,000 | 338,912 | 17,912 | 39 | 47 | 176 | 54 |
| equality on `a` | 1,000,000 | 4,752,125 | 207,505 | 92 | 244 | 454 | 300 |
| range on `b` | 10 | 21 | 24 | 28 | 23 | 21 | 13 |
| range on `b` | 1,000 | 1,744 | 257 | 69 | 60 | 65 | 135 |
| range on `b` | 100,000 | 339,269 | 22,190 | 117 | 120 | 126 | 372 |
| range on `b` | 1,000,000 | 5,679,456 | 248,634 | 204 | 350 | 333 | 1,516 |
| minimum of `b` (`order_by().first()`) | 10 | 64 | 70 | 64 | 12 | 12 | 0 |
| minimum of `b` (`order_by().first()`) | 1,000 | 1,579 | 302 | 13 | 13 | 13 | 0 |
| minimum of `b` (`order_by().first()`) | 100,000 | 182,506 | 36,562 | 15 | 16 | 17 | 0 |
| minimum of `b` (`order_by().first()`) | 1,000,000 | 3,347,328 | 536,660 | 15 | 17 | 15 | 1 |
| 99 writes to `a`, then 1 equality | 10 | 9 | 9 | 9 | 32 | 53 | 35 |
| 99 writes to `a`, then 1 equality | 1,000 | 39 | 37 | 49 | 55 | 190 | 67 |
| 99 writes to `a`, then 1 equality | 100,000 | 5,474 | 5,542 | 156 | 522 | 1,320 | 244 |
| 99 writes to `a`, then 1 equality | 1,000,000 | 47,690 | 48,303 | 600 | 567 | 1,175 | 544 |

These runs happened on a machine with a load average of about 20 (other builds
were running), so differences under about 30 % are noise. At 1 000 000
elements the numbers move by up to 3x between runs: read that row as an order of
magnitude.

How to read it:

- At 10 elements, scanning is as fast as any index. The container does not
  build one below 32 elements.
- `scan` grows with N. The `adaptive` column includes the learning cost, which
  is about 20 scans at the start.
- `adaptive*` is within about 35 % of the best frozen single-kind column in
  14 of the 16 rows shown, and ahead of Boost on ranges. The two exceptions are
  tables of 10 elements, where scanning is the right plan and the container
  scans.
- The per-kind numbers, parameter sweeps and memory are in
  [docs/KINDS.md](docs/KINDS.md).

### What adapting costs

| Cost | Size |
|---|---|
| Learning phase | about one build, paid as scans before the first index. `eagerness < 1` shortens it |
| Sampling | two clock reads on 1 probe in 16, falling to 1 in 1024 |
| Exploring a second kind | 1 probe in 64, falling to 1 in 4096, ends when a kind is dropped |
| Fixed planning overhead | about 15 ns for the cheapest query |
| Memory | live indexes, capped by `max_index_bytes` |

## Playground

The playground runs the container in the browser as WebAssembly. It holds five
copies of one table and sends them the same workload:

| Copy | What it is |
|---|---|
| adaptive | the container, choosing its own indexes |
| scan only | no index |
| hash only | a hash index on every field, built once. Ranges and order fall back to scans |
| sorted only | an ordered index on every field, built once |
| hash and sorted | both on every field, built once |

You see time per operation (chart and table, by operation type), index memory
per copy, and, for the adaptive copy, its indexes, plans and a timeline of
builds and drops. Sliders set the mix of operations, key skew, table size,
eagerness and an index memory limit.

```sh
make playground EMCC=/path/to/em++   # builds playground/web/multiview.{js,wasm}
make serve                           # http://localhost:8080
```

`make serve` sends the headers that give the browser a finer clock (5 µs). The
page works without them, but choices between index kinds get less exact.

## Build and test

```sh
make test                       # differential tests under ASan and UBSan
make bench BOOST_INC=/path/to/boost/include   # container against Boost.MultiIndex
make kinds                      # per-kind benchmark and parameter sweeps
make examples                   # build and run examples/
```

C++23 is required. Tested with GCC 16.2 and Emscripten 6.0.9. Other compilers
are untested.

## Limits

- The learning phase is real. For a workload of a few queries it can cost more
  than it saves. Set `adaptive = false` and call `build_index` if you know.
- The ordered kinds are not full B-trees: `ordered` is two levels, `sorted_array`
  pays for writes with merges. There is no trie, no bitmap and no filter yet;
  [docs/KINDS.md](docs/KINDS.md) lists them with the trigger that would add each.
- No explicit SIMD. `grouped` and `swiss` match groups of 8 control bytes with 64-bit
  integer arithmetic. Other loops rely on the compiler.
- A hash index with very many equal keys degrades. The planner measures it and
  prefers another kind.
- A first build or a trial runs inside a query call, so one query pays the
  whole build. This shows up as a latency spike at millions of elements.
- Only equality and ranges exist. There is no text, spatial or multi-valued
  index, and no set algebra over several indexes.
- Compile time grows with the number of kinds per field and the number of query
  shapes: every shape instantiates the planner for every kind. The playground's
  WebAssembly build (28 query shapes, 5 kinds per field) takes about 8 minutes
  and produces a 2.7 MB module.
- The playground's timing is coarse in a browser. See `policy::min_sample_ns`.
- Tested with GCC 16.2 and Emscripten 6.0.9 only.
