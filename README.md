# multiview

[![CI](https://github.com/meros/cpp-multiview/actions/workflows/ci.yml/badge.svg)](https://github.com/meros/cpp-multiview/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![C++23](https://img.shields.io/badge/C%2B%2B-23-informational)
![header only](https://img.shields.io/badge/header--only-no%20dependencies-success)

**A C++23 container that picks its own indexes.**

Declare which fields you query. Ask questions. multiview watches the questions,
builds an index when scanning gets expensive, compares index kinds by measured
time, and drops the ones that stop paying for themselves. The same code runs
well with 10 elements and with 10 million, and you never choose a data structure.

```cpp
#include "multiview.hpp"

struct User { std::uint64_t id; std::string city; int age; };

mv::indexed<User, &User::id, &User::city, &User::age> users;   // these fields may be queried
users.insert({1, "Lund", 31});

constexpr auto city = mv::col<&User::city>;
constexpr auto age  = mv::col<&User::age>;

users.where(city == "Lund" && age >= 30).count();                          // reads like a condition
users.where(city == "Åre").order_by(age, /*descending=*/true).limit(3).first();
for (const User& u : users.where(age < 20).rows()) print(u);

users.where(city == "Lund").explain();   // "probe grouped index on city (equality)"
users.report();                          // every index: state, probe ns, uses, memory
```

**[Try it in your browser](https://multiview.meros.vip)**: ten small programs, compiled to WebAssembly, that show the container learning.

## Why multiview

- **No access pattern to guess.** `std::unordered_map` and Boost.MultiIndex need
  the indexes chosen at compile time. multiview chooses them from the queries
  your program runs, and changes its mind when the workload changes.
- **Every index has to earn its place.** A maintained index is never free: it
  costs memory and slows writes. Each index pays rent per operation, and one that
  cannot pay its rent, its write cost and its patience is dropped.
- **Decisions come from measurement.** Build cost, probe cost and write cost are
  timed at run time, so there are no fixed thresholds to tune for your machine.
- **Six index kinds that complement each other.** Hash tables, a direct-address
  table, a chunked ordered index and a sorted array, each tuned and each winning
  a regime the others lose. You can add your own kind.
- **Small and plain.** One header directory, no dependencies, standard C++23.
  Queries read like conditions, and nothing runs until the terminal call.

[Install](#install) · [A tour](#a-tour) · [API](#api) · [Index kinds](#index-kinds) · [How it works](#how-it-works) · [Benchmarks](#benchmarks) · [Playground](#playground) · [Limits](#limits) · [Build and test](#build-and-test)

## Install

multiview is header-only. Add `include/` to your include path and compile with C++23.

```sh
g++ -std=c++23 -O2 -Iinclude your_program.cpp
```

Tested with GCC 16.2 (CI) and Emscripten 6.0.9. Other compilers are untested.

## A tour

| Example | Shows |
|---|---|
| [`quickstart.cpp`](examples/quickstart.cpp) | declare, insert, query, `explain`, `report` |
| [`tuning.cpp`](examples/tuning.cpp) | watch the container adapt, and steer it with the policy |
| [`event_log.cpp`](examples/event_log.cpp) | a sliding window of events: newest per user, a time window, slow requests, expiry |
| [`custom_kind.cpp`](examples/custom_kind.cpp) | your own index kind, and a custom hash function |

`make examples` builds and runs all four. The end of the `quickstart` output
shows what the container chose for 88 000 users: the indexes the queries needed
are live, and the rest were never built.

```text
plan: probe grouped index on city (equality), filter 2 predicates

88338 elements, 11006 KB of indexes
  field        kind          state   probe ns       uses       KB
  id           grouped       live          72       4955     3200
  city         grouped       live       48957       4967     1536
  city         ordered       live      116472         15     6270
  age          grouped       off            0          0        0
```

## API

### Declare

```cpp
mv::indexed<T, &T::a, &T::b> c;            // grouped hash + ordered index may serve each field
mv::indexed_all<T, &T::a, &T::b> c;        // every built-in kind may serve each field
mv::multiview<T, mv::fld<&T::a>,           // full control: kinds per field, in the order tried
              mv::field_decl<&T::b, mv::ordered, mv::sorted_array>> c(policy);
```

A field type must be default constructible, copyable and ordered by `<`.

### Store

| Call | Meaning |
|---|---|
| `insert(T)`, `emplace(args...)` | add an element; returns its `mv::id` |
| `insert_range(range)` | add many |
| `erase(id)` | remove |
| `modify(id, fn)` | change an element; indexes follow. The only safe way to change one |
| `operator[](id)`, `get(id)`, `contains(id)` | read |
| `size()`, `empty()`, `clear()`, `reserve(n)` | size |
| `for_each_item(fn(id, const T&))` | visit all |

An `id` is a slot number. It stays valid until the element is erased, and a later insert can reuse it.

### Query

`where(preds...)` builds a lazy query. All predicates must hold. `all()` is a query with no predicate.

| Predicate | Meaning |
|---|---|
| `col<&T::f> == v`, `<`, `<=`, `>`, `>=`, `.between(lo, hi)` | compare a field with a value |
| `eq<&T::f>(v)`, `ge`, `gt`, `le`, `lt`, `between` | the same, as functions |
| `a && b` | both hold: `where(age >= 30 && city == "Lund")` |

| Modifier | Meaning |
|---|---|
| `.order_by(col<&T::f>, descending = false)` | sort by a field. Equal keys come by id |
| `.limit(n)` | at most n results |

| Terminal | Meaning |
|---|---|
| `.count()`, `.exists()`, `.first()` | stop early where they can |
| `.ids()`, `.rows()` | the ids, or the elements: `for (const T& t : q.rows())` |
| `.for_each(fn)` | call `fn(id)` per result; return `false` to stop |
| `.erase()`, `.update(fn)` | change every result; return how many |
| `.explain()` | the plan, as text |

`order_by` with `limit` walks an ordered index and stops early, so
`all().order_by(f).first()` is a minimum. Result order is unspecified without `order_by`.

### Control and introspection

```cpp
auto& o = c.options();            // mv::policy&; an aggregate, so designated init works too
o.adaptive = false;               // freeze the set of indexes
o.max_index_bytes = 64 << 20;     // memory limit for indexes
o.rent_ns_per_byte_op = 2e-5;     // what a byte of index costs per operation (default 1e-5)
o.eagerness = 0.5;                // build sooner (default 1.0)

c.build_index<&T::a, mv::grouped>();   // build now (a hint: the container may drop it later)
c.drop_index<&T::a, mv::grouped>();
c.indexes();    // every (field, kind): live, probe ns, build ms, uses, bytes
c.report();     // the same, as a table
c.stats();      // scans, probes, walks, builds, drops, rent drops, trials
```

`mv::policy` in the header lists every knob with its unit.

### Rules

- Change an element only through `modify`. A write through a reference breaks
  the indexes, as in Boost.MultiIndex and any hash container.
- Do not change the container inside a callback. A nested query is allowed.
- No thread safety. A query updates statistics, so a read needs exclusive access too.

## Index kinds

| Kind | Answers | Use it when |
|---|---|---|
| `grouped` | equality | the default for equality: one slot per distinct key, so fastest with repeated keys and strings, and the leanest hash |
| `swiss` | equality | one slot per (key, id); about as fast as `grouped` on unique keys |
| `dense` | equality, integer keys in a small range | days, enums, small ids: the fastest of all |
| `ordered` | equality, ranges, order | balanced reads and writes |
| `sorted_array` | equality, ranges, order | reads dominate: leanest, fastest ordered lookups, slower writes |
| `hash` | equality | unique keys where latency is all that matters; 2.5x the memory of `grouped` |

[docs/KINDS.md](docs/KINDS.md) has the layouts, measurements, every tunable parameter and the literature behind the choices.

### Add your own kind

Write a class template over the key type that meets a small contract: `name`,
`supports(op)`, `add`, `remove`, `probe(lo, hi, descending, fn)`, `clear`,
`reserve`, `bytes`. List it in a `field_decl`. The container then builds, trials,
compares and drops it like any built-in kind. A missing member produces a compile
error that names it. To configure or rename a built-in kind, derive from it.
[`examples/custom_kind.cpp`](examples/custom_kind.cpp) shows both.

## How it works

1. **Scan, and keep score.** A query that finds no index scans. The scan time
   is measured and charged to the field. A walk over an ordered index that
   filters badly is charged the same way.
2. **Build when it pays.** When the charged time reaches the measured build time,
   the container builds an index. This is ski rental: the waste is bounded by one
   build. Its eagerness adapts, so builds that paid off make it sooner and builds
   that were dropped unpaid make it later.
3. **Probe and sample.** Later queries probe the index. One call in 16 is timed
   at first, and the interval grows while nothing changes.
4. **Try a second kind.** Once the first index has spent as much time probing as
   it took to build, the container builds another kind for the same operation, one
   at a time. The planner uses the cheaper kind (probe time, write time and memory
   rent, weighted by the observed mix) and probes the other now and then.
5. **Drop what does not pay.** A live index pays rent in memory on every operation
   and earns credit when it serves a query. One that cannot pay its rent, its write
   cost and its patience is dropped.

[docs/DESIGN.md](docs/DESIGN.md) has the cost model and the reasoning.

## Benchmarks

Nanoseconds per operation on one core (GCC 16, `-O2`, x86-64 Linux, Boost 1.91).
Each cell is the minimum of 9 runs up to 10 000 elements, of 3 runs at 100 000,
and one run at 1 000 000. A run is 1 000 operations. Equal-key probes return
about 4 results.

| Column | What it is |
|---|---|
| `scan` | no index |
| `adaptive` | multiview from a cold start; the cost of learning is in the number |
| `adaptive*` | multiview after 20 000 operations: the steady state |
| `grouped` | frozen: a grouped hash on `a`, an ordered index on `b` |
| `ordered` | frozen: an ordered index on both fields |
| `boost` | Boost.MultiIndex with hand-picked indexes (hash on `a`, ordered on `b`) |

| Workload | N | scan | adaptive | adaptive* | grouped | ordered | boost |
|---|---:|---:|---:|---:|---:|---:|---:|
| equality on `a` | 10 | 24 | 26 | 26 | 30 | 34 | 15 |
| equality on `a` | 1,000 | 1,323 | 232 | 25 | 22 | 42 | 23 |
| equality on `a` | 100,000 | 265,847 | 17,297 | 29 | 42 | 133 | 41 |
| equality on `a` | 1,000,000 | 3,192,072 | 182,942 | 53 | 179 | 316 | 201 |
| range on `b` | 10 | 22 | 22 | 31 | 28 | 28 | 14 |
| range on `b` | 1,000 | 1,315 | 227 | 50 | 49 | 52 | 95 |
| range on `b` | 100,000 | 276,098 | 20,702 | 90 | 107 | 110 | 278 |
| range on `b` | 1,000,000 | 3,185,641 | 219,302 | 165 | 243 | 244 | 989 |
| minimum of `b` (`order_by().first()`) | 1,000 | 1,151 | 293 | 10 | 9 | 9 | 0 |
| minimum of `b` (`order_by().first()`) | 1,000,000 | 2,113,418 | 488,748 | 11 | 12 | 12 | 0 |
| 99 writes to `a`, then 1 equality | 10 | 7 | 7 | 7 | 25 | 41 | 26 |
| 99 writes to `a`, then 1 equality | 1,000 | 32 | 30 | 36 | 40 | 139 | 49 |
| 99 writes to `a`, then 1 equality | 100,000 | 2,986 | 3,147 | 78 | 95 | 309 | 109 |
| 99 writes to `a`, then 1 equality | 1,000,000 | 32,103 | 33,694 | 239 | 403 | 826 | 380 |

How to read it:

- **Large tables.** At 1 000 000 elements the steady state answers equality in
  53 ns and a range in 165 ns, where a scan takes 3.2 ms. Boost with hand-picked
  indexes takes 201 ns and 989 ns on the same data.
- **Small tables.** At 10 elements a scan is as fast as any index, so the container
  builds none below 32 elements. Boost is faster there (15 ns against 26 ns)
  because it always keeps its indexes. That is the price of adapting.
- **Writes.** In a write-heavy workload the container keeps no index it does not
  use, so it tracks `scan` where a frozen container pays for index maintenance.
- **Minimum.** Boost's minimum is `begin()` on an ordered index, which takes no
  measurable time.
- **Learning.** The `adaptive` column includes the first scans, about 20 of them
  before the first build. The container pays that once.
- **Variation.** One run at 1 000 000 elements is a single sample. Read that row
  as an order of magnitude.

Per-kind numbers, parameter sweeps and memory per element are in
[docs/KINDS.md](docs/KINDS.md). `make bench` and `make kinds` reproduce all of it.

### What adapting costs

| Cost | Size |
|---|---|
| Learning phase | about one build, paid as scans before the first index. `eagerness < 1` shortens it |
| Sampling | two clock reads on 1 probe in 16, falling to 1 in 1024 |
| Exploring a second kind | 1 probe in 64, falling to 1 in 4096; ends when a kind is dropped |
| Fixed planning overhead | about 15 ns for the cheapest query |
| Memory | live indexes, capped by `max_index_bytes` |

## Playground

**https://multiview.meros.vip** runs the container in your browser as WebAssembly.
It is a course of ten small programs. Each step is a program you edit and run,
a few lines of text, and a plain-text run log that gives the answer to every
query, its time, its plan in words, and what the container did and why:

> Queries 1 to 49: scans, 157 µs each, 7.7 ms in total.
> After query 49: built a grouped index on customer in 1.3 ms. Why now: the scans
> had cost more than the estimate of a build.
> Queries 50 to 2 000: lookups, 2 µs each.

The steps teach one idea each: a query and its answer, what a scan costs, why
repeated queries make the container build an index, conditions and ordering, why
a hash cannot answer a range, what writes cost, memory as rent, the price of
adaptiveness, then free play. A bar chart appears from step 3. Hover a token in the
editor for its meaning; the Syntax button opens a reference card.

The programs in the editor are JavaScript that drives the C++ container through
WebAssembly. The page, its design system ([docs/design-system.md](docs/design-system.md))
and its style guide (`playground/web/styleguide.html`) live in `playground/`. A
`Dockerfile` builds the module and serves the page, and CI deploys it on every
push to `main`.

```sh
make playground EMCC=/path/to/em++   # builds playground/web/multiview.{js,wasm}
make serve                           # http://localhost:8080
```

`make serve` sends the headers that give the browser a finer clock (5 µs). Without
them the page works, but times under 100 µs are shown as bounds. Fonts (Shantell
Sans, Nunito) are self-hosted under `playground/web/fonts/` under the SIL Open
Font License.

## Limits

- The learning phase is real. For a workload of a few queries it can cost more
  than it saves. Set `adaptive = false` and call `build_index` if you know the pattern.
- The ordered kinds are not full B-trees: `ordered` is two levels, and `sorted_array`
  pays for writes with merges. There is no trie, bitmap or filter yet;
  [docs/KINDS.md](docs/KINDS.md) lists each with the trigger that would add it.
- No explicit SIMD. `grouped` and `swiss` match groups of 8 control bytes with
  64-bit integer arithmetic. Other loops rely on the compiler.
- A hash index with very many equal keys degrades. The planner measures this and
  prefers another kind.
- A first build or a trial runs inside a query call, so one query pays the whole
  build. At millions of elements this shows as a latency spike.
- Only equality and ranges exist. There is no text, spatial or multi-valued index,
  and no set algebra over several indexes.
- Compile time grows with the number of kinds per field and the number of query
  shapes, because every shape instantiates the planner for every kind. The
  playground module (28 query shapes, 5 kinds per field) takes about 8 minutes
  to compile and is 2.7 MB.
- Browser clocks are coarse. See `policy::min_sample_ns`.
- Tested with GCC 16.2 and Emscripten 6.0.9 only.

## Build and test

```sh
make test                                      # differential tests under ASan and UBSan
make bench BOOST_INC=/path/to/boost/include    # the table above, against Boost.MultiIndex
make kinds                                     # per-kind benchmark and parameter sweeps
make examples                                  # build and run examples/
```

On NixOS: `BOOST_INC=$(nix build nixpkgs#boost.dev --no-link --print-out-paths)/include`.

## Status and contributing

multiview is an experiment, not a stable library: the API can still change.
Issues and questions are welcome at https://github.com/meros/cpp-multiview/issues.
Open an issue before a large pull request, and run `make test` before you push.

## Licence

MIT. See [LICENSE](LICENSE). The playground fonts are under the SIL Open Font
License; see `playground/web/fonts/OFL.txt`.
