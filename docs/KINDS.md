# Index kinds

multiview ships six index kinds. They were chosen to be complementary: each
one wins a regime the others lose. The planner measures them and keeps the
cheapest, so a kind that never wins costs only a trial.

| Kind | Answers | Layout | Wins when |
|---|---|---|---|
| `grouped` | equality | a swiss-layout table of distinct keys; each key points to a pooled id list | the default for equality: fastest with repeated keys, strings, and the leanest hash |
| `swiss` | equality | groups of 8 control bytes plus one slot per (key, id) | unique keys when you want the simplest layout; slightly faster than `grouped` there |
| `dense` | equality, integer keys in a small range | one bucket per key value | the key range is small (days, enums, ids): one array access per probe |
| `ordered` | equality, ranges, order | chunks of up to 512 entries, keys apart from ids, one array of chunk maxima | reads and writes are balanced and you need ranges or order |
| `sorted_array` | equality, ranges, order | one sorted array, a small sorted delta, a bucket table | reads dominate: fastest ordered lookups and least memory, writes cost more |
| `hash` | equality | open addressing, linear probing, tag byte | unique keys when latency is all that matters: 21 ns against 28; 2.5x the memory |

`fld<M>` allows `grouped` and `ordered`. `fld_all<M>` allows all six, in the
order the planner tries them.

## Measurements

**1 000 000 integer keys, unique**

| Kind | build ns/elem | hit ns | miss ns | range of 100 ns | churn ns | bytes/elem |
|---|---:|---:|---:|---:|---:|---:|
| hash | 37 | 21 | 16 | - | 101 | 71.3 |
| swiss | 29 | 26 | 4 | - | 132 | 35.7 |
| grouped | 58 | 28 | 3 | - | 164 | 28.3 |
| dense | 60 | 70 | 1 | - | 324 | 29.0 |
| ordered | 139 | 256 | 229 | 382 | 833 | 24.3 |
| sorted-array | 122 | 87 | 59 | 167 | 3,910 | 13.6 |

**1 000 000 integer keys, about 4 ids per key**

| Kind | build ns/elem | hit ns | miss ns | range of 100 ns | churn ns | bytes/elem |
|---|---:|---:|---:|---:|---:|---:|
| hash | 105 | 468 | 1 | - | 507 | 35.7 |
| swiss | 29 | 104 | 2 | - | 253 | 35.7 |
| grouped | 49 | 64 | 2 | - | 249 | 21.6 |
| dense | 18 | 43 | 0 | - | 161 | 11.7 |
| ordered | 110 | 207 | 172 | 345 | 714 | 24.3 |
| sorted-array | 116 | 83 | 53 | 154 | 3,711 | 13.6 |

**1 000 000 integer keys, about 64 ids per key**

| Kind | build ns/elem | hit ns | miss ns | range of 100 ns | churn ns | bytes/elem |
|---|---:|---:|---:|---:|---:|---:|
| hash | 201 | 1377 | 1 | - | 1,125 | 35.7 |
| swiss | 52 | 791 | 10 | - | 711 | 35.7 |
| grouped | 29 | 69 | 4 | - | 240 | 17.9 |
| dense | 8 | 40 | 0 | - | 191 | 7.7 |
| ordered | 113 | 318 | 158 | 357 | 717 | 24.3 |
| sorted-array | 101 | 113 | 10 | 150 | 3,161 | 13.6 |

**1 000 000 string keys, about 4 ids per key**

| Kind | build ns/elem | hit ns | miss ns | range of 100 ns | churn ns | bytes/elem |
|---|---:|---:|---:|---:|---:|---:|
| hash | 302 | 426 | 45 | - | 912 | 172.0 |
| swiss | 357 | 528 | 40 | - | 960 | 86.0 |
| grouped | 306 | 354 | 29 | - | 896 | 34.2 |
| ordered | 542 | 1369 | 591 | 3,993 | 4,694 | 72.4 |
| sorted-array | 520 | 1724 | 816 | 2,234 | 21,205 | 37.3 |

**Hash load factor (`hash_index`)** (integer keys, 4 ids per key)

| Setting | hit ns | range of 100 ns | churn ns | bytes/elem |
|---|---:|---:|---:|---:|
| hash 25% | 208 | - | 341 | 71.3 |
| hash 35% | 202 | - | 300 | 71.3 |
| hash 50% | 529 | - | 557 | 35.7 |
| hash 65% | 499 | - | 570 | 35.7 |
| hash 75% | 625 | - | 548 | 35.7 |

**Ordered chunk size (`ordered_index`)** (integer keys, 4 ids per key)

| Setting | hit ns | range of 100 ns | churn ns | bytes/elem |
|---|---:|---:|---:|---:|
| ordered 32 | 200 | 385 | 629 | 26.0 |
| ordered 64 | 202 | 368 | 621 | 25.0 |
| ordered 128 | 178 | 385 | 665 | 24.5 |
| ordered 256 | 204 | 376 | 738 | 24.3 |
| ordered 512 | 220 | 283 | 790 | 24.1 |
| ordered 1024 | 180 | 385 | 1,123 | 24.1 |

Each cell is the best of several repeats (probes: 9, builds: 3, range scans: 5, churn: best of 10 chunks), single run, on a machine with a load average of about 20 because other builds were running. Treat differences under about 30 % as noise. Hit and miss are probes by key; churn is a remove plus an add under a new key. `bench/kinds.cpp` reproduces all of it (`make kinds`).

Reading it: `grouped` stores each key once, so it is the leanest hash in every case, matches `swiss` on unique keys, and is 1.6x (4 ids per key) to 11x (64 ids per key) faster on integer keys, and 1.5x faster on strings. `hash` is fastest only on unique keys (21 ns against 28), at 2.5x the memory. `dense` wins whenever the key range is small. `sorted_array` has the fastest ordered lookups and the least memory, and the slowest writes.

## Tunable parameters

Every kind is a class template. Configure one by naming the parameter in an
alias or a derived class, and give it a new `name` if you want it to show up
separately in `indexes()`:

```cpp
template <class V> struct sparse_hash : mv::hash_index<V, mv::default_hash<V>, 25> {
  static constexpr std::string_view name = "hash-25%";
};
mv::multiview<T, mv::field_decl<&T::k, sparse_hash, mv::ordered>> c;
```

| Kind | Parameter | Default | Effect of moving it |
|---|---|---|---|
| `grouped_index<V, Hash, LoadEighths>` | `LoadEighths` | 7 (87.5 %) | the table holds distinct keys only; lower is faster and larger. Ids per key: 2 inline, then pooled blocks of 4, 8, 16, ... |
| `swiss_index<V, Hash, LoadEighths>` | `LoadEighths` | 7 (87.5 %) | lower is faster and larger; 4 (50 %) roughly doubles memory |
| | `Hash` | `default_hash<V>` | any functor returning 64 bits with well-mixed high bits |
| `hash_index<V, Hash, LoadPct>` | `LoadPct` | 50 | lower is faster and larger. Duplicate keys form long runs, so it degrades with many equal keys |
| `dense_index<V, MaxSpan>` | `MaxSpan` | 2^20 | the widest key range it accepts. It also refuses a range wider than 8 x the element count + 1024, and then reports `usable() == false` |
| `ordered_index<V, Chunk>` | `Chunk` | 256 | larger chunks give faster ranges and fewer chunks; smaller chunks give cheaper inserts and erases. Lookups barely change from 32 to 1024 |
| `sorted_array_index<V, DeltaBase, DeltaDiv, HintDiv>` | delta limit | 256 + n / 256 | a larger delta makes writes cheaper and probes slower |
| | `HintDiv` | 8 | the bucket table has n / `HintDiv` entries; smaller is faster and larger |

`default_hash<V>` costs one multiply for integers and floats, and hashes
strings eight bytes per step. Specialize it for your own key type.

Container-wide parameters are in `mv::policy`: `rent_ns_per_byte_op`,
`eagerness`, `max_index_bytes`, `small_size`, `redundant_fraction`,
`sample_mask`, and the priors.

## What the literature says, and what we took from it

This is a summary of secondary and primary sources found on 29 October 2026.
Numbers marked "author" are the source's own measurements on its own hardware.

**Hash tables.**
- Swiss tables keep one control byte per slot holding a 7-bit hash fragment,
  and compare a whole group of control bytes with one SIMD or integer
  operation. Implementations run at up to 7/8 load. We took the layout and
  8-byte groups (portable, no SIMD).
- Meta's F14 filters 14 slots per chunk with SSE2 or NEON. Meta's 2018 benchmark
  found F14 faster than Abseil's table in most cases and Swiss better with large
  cold payloads (author). Both rely on SIMD.
- Robin Hood hashing reduces probe-length variance, so it holds up at very high
  load. WebKit uses it at about 90 to 95 % load with backward-shift deletion,
  and notes a small insertion cost. Opinions differ on whether backward shift
  beats tombstones. Not built: `swiss` already runs at 87.5 % with tombstones.

**Ordered structures.**
- Algorithmica's S+ tree (a static B+ tree layout with SIMD node search) is up
  to 15x faster than `std::lower_bound` at 6 to 7 % extra memory (author, Zen 2,
  Clang 10). That is the likely next step for `sorted_array`.
- A PGM-index predicts a position within an error window of epsilon and
  finishes with a binary search in that window, so lookup cost depends on
  epsilon, not on n. `sorted_array`'s bucket table is a one-level version of
  this idea.
- The Adaptive Radix Tree bounds space at 52 bytes per key and, per its
  authors, looks up about as fast as a hash table while keeping order. It is
  the strongest candidate for string keys and prefix queries. Not built.

**Sets and filters.**
- Roaring bitmaps switch a 65 536-key chunk from a sorted array to a bitmap at
  4096 entries, and intersect with a merge or with galloping search depending on
  the size ratio. They suit low-cardinality and multi-valued fields. Not built.
- Binary fuse filters take about 9 bits per key at a 0.4 % false-positive rate;
  a Bloom filter needs 1.44 log2(1/epsilon) bits per key. A filter in front of
  an index can reject misses cheaply. Not built.

## Research reports, and what they change

Three research agents (hash, ordered, special structures) reported on 29
October 2026, after the kinds above were built. Their own labels apply: the hash
and ordered agents verified only a few claims from fetched pages and marked
the rest as estimates; the third agent fetched nothing and quoted from memory.
Nothing below was measured here unless the Measurements section says so.

**Hash agent.** Keep the Swiss kind. Add a key-grouped (CSR) hash (built since, as `grouped`; it won every duplicate-heavy case): one slot per
distinct key pointing into a contiguous id list, best at 4 or more ids per key and
for strings (verified claim: Boost's `unordered_flat_map` is 12 to 24 % faster
than Abseil on integer keys and slower on strings with the default hash). A
bucketized 2-choice cuckoo table (about 95 % load, estimate) and a PTHash-style
static perfect hash are candidates for memory and frozen data. Suggestions that
apply to `swiss` today: an overflow flag per group instead of tombstones
(F14 and Boost do this), and a 32-bit hash fragment next to string keys.
Rejected by this agent: Robin Hood, hopscotch, Dash, linear hashing.

**Ordered agent.** Add a cache-conscious B+tree (the write-heavy kind), a
static S+ tree (verified: up to 15x faster than `std::lower_bound` at 6 to 7 %
extra memory), ART for strings and clustered keys, and a PGM-index (verified:
"often orders of magnitude" smaller than tree indexes; dynamic queries cost
O(log^2 n)). It suggests replacing `ordered` and `sorted_array` if the planner
finds no regime where they win. Our data says each wins one (see above), so I
kept them. Rejected by this agent: Eytzinger, FAST, van Emde Boas, Judy, skip
lists, Masstree, RMI, ALEX, LIPP, LSM-style trees.

**Special-structures agent (all from memory).** Roaring-style bitmaps for
fields with under about 1000 distinct values and for AND/OR across predicates;
a small-N sorted array with SIMD scan up to about 16 to 64 entries; a blocked
Bloom guard only when more than about half of lookups miss; maintained
summaries (count, min, max, top-k per key). Composite keys need no new kind:
put `(a, b)` tuples in the ordered index. Rejected: kd-tree, grid file,
cracking, perfect hashing outside frozen tables, WAH/EWAH.

Where the reports and my measurements differ: the hash agent calls Swiss
"slower with many equal keys". In our run it was 4x faster than linear probing
at 4 ids per key and 1.4x faster at 64, but a key-grouped layout was not
tested.

## Not built, and what would add it

Priority is my judgement, from the measurements and the reports.

| Priority | Structure | Add it when |
|---|---|---|
| 1 | S+ tree layout for `sorted_array` | read-only ordered lookups dominate (verified 15x over binary search, author's hardware) |
| 2 | Roaring or plain bitmaps | low-cardinality or multi-valued fields, or two selective predicates |
| 3 | ART | string keys with prefix queries |
| 4 | Maintained summaries | a hot `first()` or `count()` where the ordered walk is too slow |
| 5 | 16-wide SIMD group matching in `swiss` | a profile shows the group match is the cost; unmeasured here |
| 6 | Small-N SIMD array | tables under about 64 entries per index |
| 7 | Blocked Bloom guard | misses dominate and the index is large |
| 8 | PTHash, cuckoo, PGM | frozen data, or memory is the only goal |

Composite keys are not tested here: an ordered index over a tuple field type
should work with the current contract, but no test or example covers it.

## Sources

- [Swiss tables and SIMD hash maps](https://mohakchugh.is-a.dev/blog/swiss-tables-and-simd-hash-maps)
- [Go's Swiss table map](https://golang.google.cn/blog/swisstable)
- [Open-sourcing F14](https://engineering.fb.com/2019/04/25/developer-tools/f14/)
- [F14 against Abseil, benchmark thread](https://groups.google.com/g/hashtable-benchmarks/c/-nT-3fESXq8)
- [Robin Hood hashing](https://programming.guide/robin-hood-hashing.html), [WebKit's table](https://webkit.googlesource.com/WebKit/+/629efca1f005d07be1ee16f8122590580914f3b8/Source/WTF/wtf/RobinHoodHashTable.h)
- [Static B-trees (Algorithmica)](https://en.algorithmica.org/hpc/data-structures/s-tree/)
- [PGM-index](https://pgm.di.unipi.it/docs/)
- [The Adaptive Radix Tree (Leis, Kemper, Neumann)](https://db.in.tum.de/~leis/papers/ART.pdf)
- [Roaring bitmaps](https://arxiv.org/pdf/1603.06549)
- [Binary fuse filters](https://arxiv.org/pdf/2201.01174)
- From the agent reports: [Boost unordered_flat_map](https://bannalia.blogspot.com/2022/11/inside-boostunorderedflatmap.html), [PTHash](https://arxiv.org/abs/2104.10402), [SOSD](https://github.com/learnedsystems/SOSD), [HOT](https://dl.acm.org/doi/10.1145/3183713.3196896), [Khuong and Morin on array layouts](https://arxiv.org/abs/1509.05053), [Cuckoo filter](https://www.cs.cmu.edu/~dga/papers/cuckoo-conext2014.pdf), [Xor filter](https://arxiv.org/abs/1912.08258), [CRoaring](https://github.com/RoaringBitmap/CRoaring), [FastFilter benchmarks](https://github.com/FastFilter/fastfilter_cpp)
