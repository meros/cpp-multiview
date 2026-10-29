// Per-kind micro-benchmark: build, probe (hit, miss), range scan, churn and
// memory, for every built-in index kind and for parameter sweeps of the
// tunable ones. Usage: kinds [n] [string|u64] [ids_per_key]
//   n       element count (default 1000000)
//   string  use string keys instead of 64-bit integers
//   ids_per_key  equal-key group size (default 4; 1 = unique keys)
#include "multiview.hpp"

#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <random>
#include <string>

using clk = std::chrono::steady_clock;
static double ns_since(clk::time_point t0) { return std::chrono::duration<double, std::nano>(clk::now() - t0).count(); }
static volatile std::size_t g_sink;

template <class V> struct Keys;
template <> struct Keys<std::uint64_t> {
  static std::uint64_t make(std::uint64_t x) { return x * 0x9E3779B97F4A7C15ull; } // spread: not dense on purpose
  static std::uint64_t small(std::uint64_t x) { return x; }
};
template <> struct Keys<std::string> {
  static std::string make(std::uint64_t x) { return "user-" + std::to_string(x * 2654435761u); }
  static std::string small(std::uint64_t x) { return "user-" + std::to_string(x); }
};

// Parameterized aliases for the sweeps.
template <unsigned L> struct HashLoad { template <class V> using type = mv::hash_index<V, mv::default_hash<V>, L>; };
template <std::size_t C> struct OrdChunk { template <class V> using type = mv::ordered_index<V, C>; };

static std::uint64_t g_dups = 4;

template <template <class> class K, class V>
static void run(const char* label, std::size_t n, bool dense_keys) {
  if (!K<V>::supports(mv::op::eq)) { std::printf("%-18s unsupported for this key type\n", label); return; }
  std::mt19937_64 rng(1);
  // About 4 ids per key, the typical equality case. Dense kinds get small keys.
  const std::uint64_t domain = std::max<std::uint64_t>(n / g_dups, 1);
  std::vector<std::pair<V, mv::id>> all;
  all.reserve(n);
  for (std::size_t i = 0; i < n; ++i) {
    const std::uint64_t r = rng() % domain;
    all.emplace_back(dense_keys ? Keys<V>::small(r) : Keys<V>::make(r), static_cast<mv::id>(i));
  }
  std::vector<V> probe_keys, miss_keys;
  for (int i = 0; i < 200000; ++i) {
    const std::uint64_t r = rng() % domain;
    probe_keys.push_back(dense_keys ? Keys<V>::small(r) : Keys<V>::make(r));
    const std::uint64_t m = domain + 1 + rng() % domain;
    miss_keys.push_back(dense_keys ? Keys<V>::small(m) : Keys<V>::make(m));
  }

  K<V> idx;
  double build = 1e300;
  for (int rep = 0; rep < 3; ++rep) { // minimum of three builds: robust to a busy machine
    K<V> fresh;
    auto t0 = clk::now();
    if constexpr (requires(K<V> x, std::vector<std::pair<V, mv::id>> v) { x.assign(std::move(v)); }) {
      auto copy = all;
      t0 = clk::now();
      fresh.assign(std::move(copy));
    } else {
      fresh.reserve(n);
      for (const auto& p : all) fresh.add(p.first, p.second);
    }
    build = std::min(build, ns_since(t0) / double(n));
    if (rep == 2) idx = std::move(fresh);
  }
  if constexpr (requires { idx.usable(); }) {
    if (!idx.usable()) { std::printf("%-18s unusable on this data\n", label); return; }
  }

  auto probes = [&](const std::vector<V>& keys) {
    double best = 1e300;
    for (int rep = 0; rep < 9; ++rep) {
      std::size_t sum = 0;
      const auto t = clk::now();
      for (const V& k : keys) idx.probe(&k, &k, false, [&](mv::id i) { sum += i; return true; });
      g_sink = sum;
      best = std::min(best, ns_since(t) / double(keys.size()));
    }
    return best;
  };
  const double hit = probes(probe_keys);
  const double miss = probes(miss_keys);

  double range = -1;
  if (K<V>::supports(mv::op::range)) {
    // A window of about 100 results.
    std::vector<std::pair<V, V>> w;
    std::vector<V> sorted;
    for (const auto& p : all) sorted.push_back(p.first);
    std::sort(sorted.begin(), sorted.end());
    for (int i = 0; i < 20000; ++i) {
      const std::size_t a = rng() % (sorted.size() > 100 ? sorted.size() - 100 : 1);
      w.emplace_back(sorted[a], sorted[std::min(a + 100, sorted.size() - 1)]);
    }
    range = 1e300;
    for (int rep = 0; rep < 5; ++rep) {
      std::size_t sum = 0;
      const auto t = clk::now();
      for (const auto& r : w) idx.probe(&r.first, &r.second, false, [&](mv::id i) { sum += i; return true; });
      g_sink = sum;
      range = std::min(range, ns_since(t) / double(w.size()));
    }
  }

  // Churn: remove an element and add it back under a new key.
  const std::size_t m = std::min<std::size_t>(n, 200000);
  std::vector<std::size_t> pick(m);
  for (auto& x : pick) x = rng() % n;
  double churn = 1e300; // best of ten equal chunks
  for (std::size_t c = 0; c < 10; ++c) {
    const auto tc = clk::now();
    const std::size_t from = c * m / 10, to = (c + 1) * m / 10;
    for (std::size_t j = from; j < to; ++j) {
      auto& p = all[pick[j]];
      idx.remove(p.first, p.second);
      const std::uint64_t r = rng() % domain;
      p.first = dense_keys ? Keys<V>::small(r) : Keys<V>::make(r);
      idx.add(p.first, p.second);
    }
    churn = std::min(churn, ns_since(tc) / double(to - from));
  }

  std::printf("%-18s build %6.0f  hit %6.0f  miss %6.0f  range100 %8s  churn %7.0f  B/elem %5.1f\n", label, build, hit, miss,
              range < 0 ? "-" : std::to_string(static_cast<long>(range)).c_str(), churn, double(idx.bytes()) / double(n));
}

template <class V> static void all_kinds(std::size_t n) {
  std::printf("--- kinds, n = %zu, %s keys, ~%llu ids per key (ns per element or per operation)\n", n, std::is_same_v<V, std::string> ? "string" : "u64", (unsigned long long)g_dups);
  run<mv::hash, V>("hash", n, false);
  run<mv::swiss, V>("swiss", n, false);
  run<mv::grouped, V>("grouped", n, false);
  run<mv::dense, V>("dense", n, true);
  run<mv::ordered, V>("ordered", n, false);
  run<mv::sorted_array, V>("sorted-array", n, false);
  std::printf("--- hash load factor\n");
  run<HashLoad<25>::type, V>("hash 25%", n, false);
  run<HashLoad<35>::type, V>("hash 35%", n, false);
  run<HashLoad<50>::type, V>("hash 50%", n, false);
  run<HashLoad<65>::type, V>("hash 65%", n, false);
  run<HashLoad<75>::type, V>("hash 75%", n, false);
  std::printf("--- ordered chunk size\n");
  run<OrdChunk<32>::type, V>("ordered 32", n, false);
  run<OrdChunk<64>::type, V>("ordered 64", n, false);
  run<OrdChunk<128>::type, V>("ordered 128", n, false);
  run<OrdChunk<256>::type, V>("ordered 256", n, false);
  run<OrdChunk<512>::type, V>("ordered 512", n, false);
  run<OrdChunk<1024>::type, V>("ordered 1024", n, false);
}

int main(int argc, char** argv) {
  const std::size_t n = argc > 1 ? std::strtoull(argv[1], nullptr, 10) : 1'000'000;
  if (argc > 3) g_dups = std::strtoull(argv[3], nullptr, 10);
  if (argc > 2 && std::string(argv[2]) == "string") all_kinds<std::string>(n); else all_kinds<std::uint64_t>(n);
}
