# Design

This file explains why multiview is built the way it is. The README explains
how to use it.

## The problem

A container that answers many kinds of lookups has two bad options. A scan is
simple and slow once the data grows. A fixed set of indexes (Boost.MultiIndex)
is fast, but you must know the workload when you write the code, and every
index costs memory and write time even if no query uses it.

multiview picks a third option. You declare which fields may be queried. The
container watches the queries and builds, tries and drops indexes on its own.
It accepts a price for this: a learning phase, sampling overhead, and some
memory. The design goal is to keep that price small and bounded.

## The use cases

The design came from a list of lookups the container must serve, from 10
elements to millions:

| Group | Use cases |
|---|---|
| Lookup shape | equality on a unique or non-unique key, several fields, range, prefix, IN-list, not-equal, exists, predecessor and successor |
| Order and consumption | sorted iteration, `first`, `min`, `max`, top-k, pagination, count |
| Data shape | low-cardinality flags, multi-valued fields, computed keys, text, spatial |
| Lifecycle | bulk load then read-only, append-only, heavy churn, priority-queue use |
| Load | hot keys, misses, workload phases, latency limits, memory limits |

## The atoms

Six parts cover the core use cases. Each one answers: what breaks if it is
removed?

| Atom | In the code | Job | If removed |
|---|---|---|---|
| Slots | `multiview` storage | Stable ids and one place where every change passes | Derived structures cannot stay consistent |
| Shape | `pred`, `query` | A typed description of a lookup: predicates, order, limit, terminal operation | The container cannot see what callers need |
| Index | `index_kind` and the kinds in [KINDS.md](KINDS.md) | Answers a probe for equality or a range | Only scans remain |
| Planner | `choose`, `exec` | Picks scan, probe or ordered walk | Indexes exist and nothing uses them |
| Meter | `slot` statistics | Sampled timings of probes, writes, scans and builds | The controller falls back to guesses |
| Controller | `charge_scan`, `after_sample`, `note_write` | Builds, tries and drops indexes | The container never adapts |

One ordered index answers equality, ranges, order, minimum, maximum, top-k and
neighbours. A hash index answers equality only. It exists because it measures
faster for equality at most sizes, and the planner decides that by measurement,
not by rule. The remaining kinds each win a regime the others lose; see
[KINDS.md](KINDS.md).

### Not built

These are not in the core and have no code. Each has a trigger that adds it.

| Left out | Add it when |
|---|---|
| Id-set algebra (sorted ids, bitmaps) | multi-valued fields, low-cardinality flags, or two selective predicates whose AND is far smaller than each |
| Maintained summaries (min, max, count, top-k per key) | a workload shows that the ordered walk is too slow for a hot `first()` |
| Incremental build (cracking) | a latency limit forbids one long build at millions of items |
| Spatial, text, Bloom | a real consumer needs them. Each implements `index_kind`. |
| Concurrency | more than one thread touches the container |

## The cost model

All decisions use measured time in nanoseconds. Priors apply only until the
first measurement. One idea runs through it: **a maintained index is never
free**. It costs runtime on every write and memory on every operation.

**First build (ski rental).** Each scan is charged to one field: the first
equality predicate, else the first range predicate, else the order field. The
container builds an index when the scan time paid reaches the estimated build
time (`eagerness` times a learned multiplier times the measured build time per
element times the size). This bounds the waste to about the cost of the build,
so the total cost stays within a factor of two of an ideal that knew the
future. That bound holds only if the cost estimates are right, which is why
they are measured.

A walk over an ordered index (`order_by` with `limit`) filters as it goes. If it
visits far more entries than it returns, a predicate it could not use is the
real cost, and the container charges that field as if the walk had been a scan.
Without this feedback a bad walk would never be corrected.

**Learned eagerness.** Each field and operation has a multiplier on the build
threshold. A build that earns back its cost lowers it (down to 1/8). A build
dropped before it paid raises it (up to 8). The container becomes eager where
building has paid and careful where it has not.

**Choosing between kinds.** A kind costs its probe time plus its write time,
weighted by the ratio of writes to probes seen on that field, plus its memory
rent per probe (below). The planner uses the cheapest kind. A kind with fewer
than 8 samples is tried first. Every 64th call goes to another live kind so its
estimate stays fresh. The interval doubles while the ranking holds, up to 4096.

**Trying another kind.** Once the live kind has spent as much time probing as
its build took, and every live kind of that operation has 16 samples, the
container builds one untried kind. Kinds are tried one at a time.

**Rent and dropping.** Every live index pays rent: `rent_ns_per_byte_op` times
its bytes, on every container operation (charged every 128 operations). It
earns credit on each probe: the measured scan cost minus its own cost, or, when
another live kind serves the operation, the difference to that kind, so a slower
twin earns nothing. It pays for writes too. A kind is dropped when its balance
falls below minus its build cost times a patience factor, or, for a redundant
kind (another kind serves every operation it has served), below 5 % of that.
Unused indexes drain through rent alone: a maintained index that serves nothing
goes.

A kind is never dropped for losing a comparison if it is the only live provider
of an operation that queries use. A kind that says it does not fit the data
(`usable() == false`, for example `dense` on widely spread keys) is dropped at
once and not tried again.

**Learning patience.** A drop that is soon followed by a rebuild of the same
index was a mistake: its patience doubles. A drop that holds trims it by a
quarter. After an automatic drop, the next build of that kind needs twice the
evidence (up to 64 times), and earning back the build cost clears that.

**Default rent.** 1e-5 ns per byte per operation: a 34 MB index costs 340 ns per
operation. The cloud price of memory is roughly 100 times lower, so the default
favours frugality. Set `rent_ns_per_byte_op = 0` to ignore memory.

## What the adaptiveness costs

| Cost | Size | Reduced by |
|---|---|---|
| Learning phase | about the cost of one build, paid as scans before the first index | `eagerness` below 1, and learned eagerness |
| Timing probes | two clock reads on 1 call in 16 at first | the interval grows to 1 in 1024 while the ranking holds |
| Exploring another kind | one call in 64 at first | the interval grows to 1 in 4096; a drop ends it |
| Planning | about 15 ns on the smallest query (`min` over an ordered index) | none yet |
| Rent accounting | one pass over the live indexes every 128 operations | none needed |
| Memory | the live indexes | rent, `policy::max_index_bytes` |
| Compile time | every query shape instantiates the planner for every kind of its fields | fewer kinds per field |

The README has measurements.

## Correctness

Indexes are derived data. The result of a query equals the result of a scan.
`test/test.cpp` checks this against brute force over random inserts, erases,
modifies and queries, under AddressSanitizer and UndefinedBehaviorSanitizer,
with four clocks: the real clock, a fast fake, a slow fake that forces
builds and drops, and a run that forces both kinds live.

The contract has one rule: change an element only through `modify`. A direct
write through a reference breaks the indexes, as it does in Boost.MultiIndex
and in any hash container.

## Browser timers

A browser clock resolves 5 µs at best (with cross-origin isolation) and 100 µs
or more otherwise. A probe takes 50 to 500 ns. `policy::min_sample_ns` makes
the container repeat a timed probe until the elapsed time is well above the
resolution. The playground sets it. Native builds leave it at zero.
