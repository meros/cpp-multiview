// ns per operation, adaptation cost included, for four workloads and six
// variants: scan only, adaptive, hash only, ordered only, both kinds (adaptive
// controller on), and Boost.MultiIndex with hand-picked indexes.
// Usage: bench [max_n]   (default 1000000)
#include "multiview.hpp"

#include <boost/multi_index/hashed_index.hpp>
#include <boost/multi_index/member.hpp>
#include <boost/multi_index/ordered_index.hpp>
#include <boost/multi_index_container.hpp>

#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <random>

struct Rec {
  std::uint64_t a, b, c;
};

namespace bmi = boost::multi_index;
using BoostC = bmi::multi_index_container<
    Rec, bmi::indexed_by<bmi::hashed_non_unique<bmi::member<Rec, std::uint64_t, &Rec::a>>,
                         bmi::ordered_non_unique<bmi::member<Rec, std::uint64_t, &Rec::b>>>>;

using MV = mv::multiview<Rec, mv::fld<&Rec::a>, mv::fld<&Rec::b>>;
enum class Pre { none, hash, ordered, both };

// Every variant offers the same four operations.
struct MvOps {
  MV c;
  std::vector<mv::id> ids;
  MvOps(mv::policy p, Pre pre, const std::vector<Rec>& d) : c(p) {
    c.reserve(d.size());
    for (auto& r : d) ids.push_back(c.insert(r));
    if (pre == Pre::hash || pre == Pre::both) c.build_index<&Rec::a, mv::grouped>();
    if (pre == Pre::ordered || pre == Pre::both) c.build_index<&Rec::a, mv::ordered_index>();
    if (pre != Pre::none) c.build_index<&Rec::b, mv::ordered_index>();
  }
  std::size_t eq_a(std::uint64_t k) { return c.where(mv::eq<&Rec::a>(k)).count(); }
  std::size_t range_b(std::uint64_t lo, std::uint64_t hi) { return c.where(mv::between<&Rec::b>(lo, hi)).count(); }
  std::size_t min_b() { return *c.all().order_by<&Rec::b>().first(); }
  void set_a(std::size_t i, std::uint64_t v) { c.modify(ids[i], [&](Rec& r) { r.a = v; }); }
};

struct BoostOps {
  BoostC c;
  std::vector<BoostC::iterator> its;
  explicit BoostOps(const std::vector<Rec>& d) {
    for (auto& r : d) its.push_back(c.insert(r).first);
  }
  std::size_t eq_a(std::uint64_t k) {
    auto [b, e] = c.get<0>().equal_range(k);
    return std::distance(b, e);
  }
  std::size_t range_b(std::uint64_t lo, std::uint64_t hi) {
    auto& ix = c.get<1>();
    return std::distance(ix.lower_bound(lo), ix.upper_bound(hi));
  }
  std::size_t min_b() { return c.get<1>().begin()->c; }
  void set_a(std::size_t i, std::uint64_t v) { c.modify(its[i], [&](Rec& r) { r.a = v; }); }
};

template <class Ops, class Run> double time_ns_per_op(Ops& ops, std::size_t n_ops, Run&& run) {
  auto t0 = std::chrono::steady_clock::now();
  std::size_t sink = run(ops);
  auto t1 = std::chrono::steady_clock::now();
  if (sink == 0xdeadbeef) std::puts("");
  return std::chrono::duration<double, std::nano>(t1 - t0).count() / double(n_ops);
}

int main(int argc, char** argv) {
  const std::size_t max_n = argc > 1 ? std::strtoull(argv[1], nullptr, 10) : 1'000'000;
  constexpr std::size_t kOps = 1000, kWarm = 20000;
  std::printf("%-9s %-8s %11s %11s %11s %11s %11s %11s %11s %11s   (ns/op)\n", "workload", "N", "scan", "adaptive", "adaptive*",
              "grouped", "ordered", "both", "both*", "boost");
  for (std::size_t n : {10ul, 100ul, 1000ul, 10000ul, 100000ul, 1000000ul}) {
    if (n > max_n) break;
    std::mt19937_64 rng(7);
    std::vector<Rec> data(n);
    const std::uint64_t keys = n / 4 + 1, bmax = 1'000'000'000;
    for (std::size_t i = 0; i < n; ++i) data[i] = {rng() % keys, rng() % bmax, i};
    const std::uint64_t width = std::max<std::uint64_t>(1, bmax * 4 / n);

    // Fresh container per repetition, so the adaptive variant pays its build
    // every time. The minimum over repetitions removes scheduler noise.
    const int reps = n >= 1'000'000 ? 1 : n >= 100'000 ? 3 : 9;
    auto workload = [&](const char* name, auto&& body) {
      mv::policy off; off.adaptive = false;
      mv::policy on;
      // warm > 0: run that many untimed operations first (steady state).
      auto best = [&](auto&& make, std::size_t warm = 0) {
        double m = 1e300;
        for (int k = 0; k < reps; ++k) {
          auto ops = make();
          std::mt19937_64 rw(123);
          for (std::size_t q = 0; q < warm; ++q) body(ops, rw, q);
          std::mt19937_64 r(99);
          m = std::min(m, time_ns_per_op(ops, kOps, [&](auto& o) {
            std::size_t s = 0;
            for (std::size_t q = 0; q < kOps; ++q) s += body(o, r, q);
            return s;
          }));
        }
        return m;
      };
      const double a = best([&] { return MvOps(off, Pre::none, data); });
      const double b = best([&] { return MvOps(on, Pre::none, data); });
      const double b2 = best([&] { return MvOps(on, Pre::none, data); }, kWarm);
      const double c = best([&] { return MvOps(off, Pre::hash, data); });
      const double d = best([&] { return MvOps(off, Pre::ordered, data); });
      const double e = best([&] { return MvOps(on, Pre::both, data); });
      const double e2 = best([&] { return MvOps(on, Pre::both, data); }, kWarm);
      const double f = best([&] { return BoostOps(data); });
      std::printf("%-9s %-8zu %11.0f %11.0f %11.0f %11.0f %11.0f %11.0f %11.0f %11.0f\n", name, n, a, b, b2, c, d, e, e2, f);
    };

    workload("eq_a", [&](auto& o, auto& r, std::size_t) { return o.eq_a(r() % keys); });
    workload("range_b", [&](auto& o, auto& r, std::size_t) { auto lo = r() % bmax; return o.range_b(lo, lo + width); });
    workload("min_b", [&](auto& o, auto&, std::size_t) { return o.min_b(); });
    // 99 writes that change the indexed field a, then 1 eq query.
    workload("write99", [&](auto& o, auto& r, std::size_t q) {
      if (q % 100 == 99) return o.eq_a(r() % keys);
      o.set_a(r() % n, r() % keys);
      return std::size_t{1};
    });
  }
}
