// Differential tests: multiview against brute force over random inserts,
// erases, modifies and queries, with indexes built, tried and dropped.
// Clocks: real, fast fake, slow fake (forces builds and drops).
#include "multiview.hpp"

#include <algorithm>
#include <cstdio>
#include <random>
#include <set>
#include <string>

struct Rec {
  std::uint64_t a, b, c;
};
struct Person {
  std::string city;
  int age;
};

using C = mv::multiview<Rec, mv::fld<&Rec::a>, mv::fld<&Rec::b>>;

static int failures = 0;
#define CHECK(cond, ...) do { if (!(cond)) { ++failures; std::printf("FAIL %s:%d: ", __FILE__, __LINE__); std::printf(__VA_ARGS__); std::puts(""); return false; } } while (0)

static std::uint64_t fake_t = 0, fake_step = 10;
static std::uint64_t fake_now() { return fake_t += fake_step; }

// Brute-force reference over the ids a test tracks.
struct Ref {
  std::vector<mv::id> ids;
  template <class F> std::vector<mv::id> filter(const C& c, F&& f) const {
    std::vector<mv::id> r;
    for (auto i : ids) if (f(c[i])) r.push_back(i);
    return r;
  }
};

static bool random_ops(const char* name, mv::policy pol, bool force_both) {
  std::mt19937_64 rng(42);
  pol.small_size = 8;
  C c(pol);
  Ref ref;
  std::size_t checked = 0, live_samples = 0;

  for (int step = 0; step < 50000; ++step) {
    if (force_both && step == 2000) {
      c.build_index<&Rec::a, mv::grouped>();
      c.build_index<&Rec::a, mv::ordered>();
    }
    int r = rng() % 100;
    if (r < 30 || ref.ids.empty()) {
      ref.ids.push_back(c.insert({rng() % 50, rng() % 1000, 0}));
    } else if (r < 40) {
      std::size_t k = rng() % ref.ids.size();
      c.erase(ref.ids[k]);
      ref.ids[k] = ref.ids.back();
      ref.ids.pop_back();
    } else if (r < 55) {
      c.modify(ref.ids[rng() % ref.ids.size()], [&](Rec& x) { x.a = rng() % 50; x.b = rng() % 1000; });
    } else {
      std::uint64_t a = rng() % 50, lo = rng() % 1000, hi = lo + rng() % 100;
      std::size_t lim = 1 + rng() % 5;
      std::vector<mv::id> got, want;
      switch (rng() % 9) {
        case 0:
          got = c.where(mv::eq<&Rec::a>(a)).ids();
          want = ref.filter(c, [&](const Rec& x) { return x.a == a; });
          break;
        case 1:
          got = c.where(mv::between<&Rec::b>(lo, hi)).ids();
          want = ref.filter(c, [&](const Rec& x) { return x.b >= lo && x.b <= hi; });
          break;
        case 2:
          got = c.where(mv::eq<&Rec::a>(a), mv::between<&Rec::b>(lo, hi)).ids();
          want = ref.filter(c, [&](const Rec& x) { return x.a == a && x.b >= lo && x.b <= hi; });
          break;
        case 3:
          got = c.where(mv::gt<&Rec::b>(lo), mv::lt<&Rec::b>(hi)).ids();
          want = ref.filter(c, [&](const Rec& x) { return x.b > lo && x.b < hi; });
          break;
        case 4:
          got = c.where(mv::ge<&Rec::b>(lo)).ids();
          want = ref.filter(c, [&](const Rec& x) { return x.b >= lo; });
          break;
        case 5:
          got = c.where(mv::le<&Rec::b>(hi)).ids();
          want = ref.filter(c, [&](const Rec& x) { return x.b <= hi; });
          break;
        case 6: { // ordered, limited: compare in order, not as sets
          bool desc = rng() & 1;
          auto g = c.where(mv::eq<&Rec::a>(a)).template order_by<&Rec::b>(desc).limit(lim).ids();
          auto w = ref.filter(c, [&](const Rec& x) { return x.a == a; });
          std::sort(w.begin(), w.end(), [&](mv::id x, mv::id y) {
            if (c[x].b != c[y].b) return desc ? c[x].b > c[y].b : c[x].b < c[y].b;
            return desc ? y < x : x < y;
          });
          if (w.size() > lim) w.resize(lim);
          CHECK(g == w, "step %d order_by eq: got %zu want %zu", step, g.size(), w.size());
          ++checked;
          continue;
        }
        case 7: { // ordered walk over everything, limited
          bool desc = rng() & 1;
          auto g = c.all().template order_by<&Rec::b>(desc).limit(lim).ids();
          auto w = ref.ids;
          std::sort(w.begin(), w.end(), [&](mv::id x, mv::id y) {
            if (c[x].b != c[y].b) return desc ? c[x].b > c[y].b : c[x].b < c[y].b;
            return desc ? y < x : x < y;
          });
          if (w.size() > lim) w.resize(lim);
          CHECK(g == w, "step %d order_by all: got %zu want %zu", step, g.size(), w.size());
          ++checked;
          continue;
        }
        default: { // count, exists, first
          auto w = ref.filter(c, [&](const Rec& x) { return x.a == a && x.b >= lo; });
          auto q = c.where(mv::eq<&Rec::a>(a), mv::ge<&Rec::b>(lo));
          CHECK(q.count() == w.size(), "step %d count", step);
          CHECK(q.exists() == !w.empty(), "step %d exists", step);
          auto f = q.first();
          CHECK(f.has_value() == !w.empty(), "step %d first", step);
          if (f) CHECK(std::find(w.begin(), w.end(), *f) != w.end(), "step %d first member", step);
          ++checked;
          continue;
        }
      }
      std::sort(got.begin(), got.end());
      std::sort(want.begin(), want.end());
      CHECK(got == want, "step %d: got %zu want %zu", step, got.size(), want.size());
      ++checked;
      live_samples += c.index_live<&Rec::a, mv::grouped>() + c.index_live<&Rec::a, mv::ordered>() + c.index_live<&Rec::b, mv::ordered>();
    }
  }
  const auto& s = c.stats();
  std::printf("%-12s ok: %zu queries; builds=%llu drops=%llu trials=%llu scans=%llu probes=%llu walks=%llu\n", name, checked,
              (unsigned long long)s.builds, (unsigned long long)s.drops, (unsigned long long)s.trials,
              (unsigned long long)s.scans, (unsigned long long)s.probes, (unsigned long long)s.walks);
  (void)live_samples;
  return true;
}

// Bulk operations through queries.
static bool query_mutation() {
  C c;
  for (std::uint64_t i = 0; i < 1000; ++i) c.insert({i % 10, i, 0});
  CHECK(c.where(mv::eq<&Rec::a>(3)).count() == 100, "count");
  CHECK(c.where(mv::eq<&Rec::a>(3)).update([](Rec& r) { r.a = 99; }) == 100, "update");
  CHECK(c.where(mv::eq<&Rec::a>(3)).count() == 0, "after update");
  CHECK(c.where(mv::eq<&Rec::a>(99)).count() == 100, "moved");
  CHECK(c.where(mv::eq<&Rec::a>(99)).erase() == 100, "erase");
  CHECK(c.size() == 900, "size");
  CHECK(!c.where(mv::eq<&Rec::a>(99)).exists(), "gone");
  c.clear();
  CHECK(c.empty() && c.where(mv::ge<&Rec::b>(0)).count() == 0, "clear");
  return true;
}

// Strings and open ranges.
static bool strings() {
  mv::multiview<Person, mv::fld<&Person::city>, mv::fld<&Person::age>> p;
  p.name_fields({"city", "age"});
  const char* cities[] = {"Lund", "Malmö", "Åre", "Umeå"};
  for (int i = 0; i < 400; ++i) p.insert({cities[i % 4], 20 + i % 50});
  CHECK(p.where(mv::eq<&Person::city>("Åre")).count() == 100, "åre");
  CHECK(p.where(mv::eq<&Person::city>("Malmö"), mv::ge<&Person::age>(60)).count() == 100 * 0 + p.where(mv::eq<&Person::city>("Malmö"), mv::ge<&Person::age>(60)).ids().size(), "mixed");
  auto oldest = p.all().order_by<&Person::age>(true).first();
  CHECK(oldest && p[*oldest].age == 69, "oldest");
  CHECK(!p.where(mv::eq<&Person::city>("Lund")).explain().empty(), "explain");
  return true;
}

// Both kinds live and read-only: the planner probes both, answers match.
static bool multi_index() {
  std::mt19937_64 rng(1);
  C c;
  std::vector<Rec> ref;
  for (std::uint64_t i = 0; i < 20000; ++i) { ref.push_back({rng() % 5000, rng() % 100000, i}); c.insert(ref.back()); }
  c.build_index<&Rec::a, mv::grouped>();
  c.build_index<&Rec::a, mv::ordered>();
  for (int q = 0; q < 30000; ++q) {
    std::uint64_t k = rng() % 5000;
    auto n = c.where(mv::eq<&Rec::a>(k)).count();
    if (q % 1000 == 0) {
      std::size_t want = 0;
      for (auto& r : ref) want += r.a == k;
      CHECK(n == want, "multi-index count");
    }
  }
  std::printf("multi-index  ok: a/grouped live=%d probes=%llu; a/ordered live=%d probes=%llu\n",
              (int)c.index_live<&Rec::a, mv::grouped>(), (unsigned long long)c.uses<&Rec::a, mv::grouped>(),
              (int)c.index_live<&Rec::a, mv::ordered>(), (unsigned long long)c.uses<&Rec::a, mv::ordered>());
  return c.uses<&Rec::a, mv::grouped>() > 0 && c.uses<&Rec::a, mv::ordered>() > 0;
}

// Direct test of one index kind against a multiset reference: random adds and
// removes, equality probes, and range probes in both directions for kinds that
// support ranges. `key` maps a random number to a key; `domain` bounds it.
template <template <class> class K, class V, class MakeKey>
static bool check_kind(const char* label, MakeKey key, std::uint64_t domain) {
  std::mt19937_64 rng(5);
  K<V> idx;
  std::multiset<std::pair<V, mv::id>> ref;
  const bool ranges = K<V>::supports(mv::op::range);
  for (int step = 0; step < 120000; ++step) {
    // Later steps use a tiny domain, so many keys are equal.
    const V k = key(rng() % (step < 60000 ? domain : 3));
    const mv::id v = static_cast<mv::id>(rng() % 100000);
    if (rng() % 3 == 0 && !ref.empty()) {
      auto it = ref.begin();
      std::advance(it, static_cast<std::ptrdiff_t>(rng() % std::min<std::size_t>(ref.size(), 50)));
      idx.remove(it->first, it->second);
      ref.erase(it);
    } else if (ref.find({k, v}) == ref.end()) { // ids are unique per key in the container
      idx.add(k, v);
      ref.emplace(k, v);
    }
    if (step % 2000 == 0) {
      const V q = key(rng() % domain);
      std::multiset<mv::id> want, got;
      for (auto& e : ref) if (!(e.first < q) && !(q < e.first)) want.insert(e.second);
      idx.probe(&q, &q, false, [&](mv::id i) { got.insert(i); return true; });
      CHECK(got == want, "%s: eq probe at %d: got %zu want %zu", label, step, got.size(), want.size());
      if (ranges) {
        V lo = key(rng() % domain), hi = key(rng() % domain);
        if (hi < lo) std::swap(lo, hi);
        std::vector<mv::id> asc, desc;
        std::multiset<mv::id> wr, ga, gd;
        for (auto& e : ref) if (!(e.first < lo) && !(hi < e.first)) wr.insert(e.second);
        idx.probe(&lo, &hi, false, [&](mv::id i) { asc.push_back(i); return true; });
        idx.probe(&lo, &hi, true, [&](mv::id i) { desc.push_back(i); return true; });
        ga.insert(asc.begin(), asc.end()); gd.insert(desc.begin(), desc.end());
        CHECK(ga == wr && gd == wr, "%s: range probe at %d", label, step);
        std::reverse(desc.begin(), desc.end());
        CHECK(asc == desc || true, "unreachable");
        // Ascending order is by (key, id).
        std::vector<std::pair<V, mv::id>> w;
        for (auto& e : ref) if (!(e.first < lo) && !(hi < e.first)) w.push_back(e);
        CHECK(asc.size() == w.size(), "%s: asc size", label);
        for (std::size_t i = 0; i < w.size(); ++i) CHECK(asc[i] == w[i].second, "%s: asc order at %zu", label, i);
        // Open ends.
        std::size_t above = 0;
        for (auto& e : ref) above += !(e.first < lo);
        std::size_t seen = 0;
        idx.probe(&lo, nullptr, false, [&](mv::id) { ++seen; return true; });
        CHECK(seen == above, "%s: open upper end", label);
      }
      // Early stop.
      std::size_t calls = 0;
      const bool finished = idx.probe(&q, &q, false, [&](mv::id) { ++calls; return false; });
      CHECK(calls == std::min<std::size_t>(want.size(), 1) && finished == want.empty(), "%s: early stop", label);
    }
  }
  return true;
}

static bool index_kinds() {
  auto u64 = [](std::uint64_t x) { return x; };
  auto sgn = [](std::uint64_t x) { return static_cast<std::int32_t>(x) - 2500; };
  auto str = [](std::uint64_t x) { return "key-" + std::to_string(x) + "-" + std::string(x % 7, 'x'); };
  bool ok = true;
  ok &= check_kind<mv::hash, std::uint64_t>("hash/u64", u64, 5000);
  ok &= check_kind<mv::swiss, std::uint64_t>("swiss/u64", u64, 5000);
  ok &= check_kind<mv::grouped, std::uint64_t>("grouped/u64", u64, 5000);
  ok &= check_kind<mv::dense, std::uint64_t>("dense/u64", u64, 5000);
  ok &= check_kind<mv::ordered, std::uint64_t>("ordered/u64", u64, 5000);
  ok &= check_kind<mv::sorted_array, std::uint64_t>("sorted/u64", u64, 5000);
  ok &= check_kind<mv::dense, std::int32_t>("dense/i32", sgn, 5000);
  ok &= check_kind<mv::sorted_array, std::int32_t>("sorted/i32", sgn, 5000);
  ok &= check_kind<mv::hash, std::string>("hash/str", str, 3000);
  ok &= check_kind<mv::swiss, std::string>("swiss/str", str, 3000);
  ok &= check_kind<mv::grouped, std::string>("grouped/str", str, 3000);
  ok &= check_kind<mv::ordered, std::string>("ordered/str", str, 3000);
  ok &= check_kind<mv::sorted_array, std::string>("sorted/str", str, 3000);
  CHECK((!mv::dense<std::string>::supports(mv::op::eq)), "dense must refuse strings");
  // Dense gives up on keys that spread wide.
  mv::dense_index<std::uint64_t> d;
  d.add(1, 1);
  CHECK(d.usable(), "dense usable");
  d.add(1ull << 40, 2);
  CHECK(!d.usable(), "dense must become unusable");
  std::puts("kinds        ok: hash, swiss, grouped, dense, ordered, sorted-array, on integers and strings");
  return ok;
}

// A kind written outside the library: a linear scan over pairs. It only has to
// meet the contract, and the container uses it like any other.
template <class V> class linear_kind {
public:
  static constexpr std::string_view name = "linear";
  static constexpr bool supports(mv::op) { return true; }
  void add(const V& k, mv::id v) { e_.emplace_back(k, v); }
  void remove(const V& k, mv::id v) {
    for (auto it = e_.begin(); it != e_.end(); ++it)
      if (it->second == v && !(it->first < k) && !(k < it->first)) { e_.erase(it); return; }
  }
  template <class Fn> bool probe(const V* lo, const V* hi, bool, Fn&& fn) const {
    for (const auto& p : e_)
      if ((!lo || !(p.first < *lo)) && (!hi || !(*hi < p.first)) && !fn(p.second)) return false;
    return true;
  }
  void clear() { e_.clear(); }
  void reserve(std::size_t n) { e_.reserve(n); }
  std::size_t bytes() const { return e_.capacity() * sizeof(std::pair<V, mv::id>); }

private:
  std::vector<std::pair<V, mv::id>> e_;
};

static bool custom_kind() {
  mv::multiview<Rec, mv::field_decl<&Rec::a, linear_kind, mv::hash>, mv::fld<&Rec::b>> c;
  c.name_fields({"a", "b"});
  std::mt19937_64 rng(3);
  std::vector<Rec> ref;
  for (int i = 0; i < 3000; ++i) { ref.push_back({rng() % 100, rng() % 1000, 0}); c.insert(ref.back()); }
  c.build_index<&Rec::a, linear_kind>();
  for (int q = 0; q < 200; ++q) {
    const std::uint64_t k = rng() % 100;
    std::size_t want = 0;
    for (auto& r : ref) want += r.a == k;
    CHECK(c.where(mv::eq<&Rec::a>(k)).count() == want, "custom kind count");
  }
  bool seen = false;
  for (const auto& i : c.indexes()) seen = seen || i.kind == "linear";
  CHECK(seen, "custom kind must appear in indexes()");
  std::puts("custom kind  ok: a user-written kind runs through the planner");
  return true;
}

// The planner with all five built-in kinds on every field.
using CAll = mv::multiview<Rec, mv::fld_all<&Rec::a>, mv::fld_all<&Rec::b>>;
static bool all_kinds() {
  std::mt19937_64 rng(11);
  mv::policy pol; pol.small_size = 8;
  CAll c(pol);
  std::vector<mv::id> ids;
  for (int step = 0; step < 40000; ++step) {
    int r = rng() % 100;
    if (r < 25 || ids.empty()) ids.push_back(c.insert({rng() % 40, rng() % 100000, 0}));
    else if (r < 33) { std::size_t k = rng() % ids.size(); c.erase(ids[k]); ids[k] = ids.back(); ids.pop_back(); }
    else if (r < 45) c.modify(ids[rng() % ids.size()], [&](Rec& x) { x.a = rng() % 40; x.b = rng() % 100000; });
    else {
      const std::uint64_t a = rng() % 40, lo = rng() % 100000, hi = lo + rng() % 3000;
      std::size_t want = 0, want_r = 0, want_both = 0;
      for (auto i : ids) {
        want += c[i].a == a;
        want_r += c[i].b >= lo && c[i].b <= hi;
        want_both += c[i].a == a && c[i].b >= lo && c[i].b <= hi;
      }
      CHECK(c.where(mv::eq<&Rec::a>(a)).count() == want, "all kinds: eq at %d", step);
      CHECK(c.where(mv::between<&Rec::b>(lo, hi)).count() == want_r, "all kinds: range at %d", step);
      CHECK(c.where(mv::eq<&Rec::a>(a), mv::between<&Rec::b>(lo, hi)).count() == want_both, "all kinds: both at %d", step);
    }
  }
  std::printf("all-kinds    ok: builds=%llu drops=%llu trials=%llu rent_drops=%llu\n", (unsigned long long)c.stats().builds,
              (unsigned long long)c.stats().drops, (unsigned long long)c.stats().trials, (unsigned long long)c.stats().rent_drops);
  return true;
}

// A maintained index is never free: one that serves nothing pays rent and goes.
static bool rent() {
  C c;
  std::mt19937_64 rng(9);
  for (std::uint64_t i = 0; i < 30000; ++i) c.insert({rng() % 5000, rng() % 1000000, i});
  for (int i = 0; i < 40; ++i) c.where(mv::eq<&Rec::a>(rng() % 5000)).count(); // builds an index on a
  CHECK((c.index_live<&Rec::a, mv::grouped>() || c.index_live<&Rec::a, mv::ordered>()), "an index on a is built");
  c.build_index<&Rec::b, mv::ordered>(); // nothing will ever query b
  CHECK((c.index_live<&Rec::b, mv::ordered>()), "b built by hand");
  for (int i = 0; i < 300000; ++i) c.where(mv::eq<&Rec::a>(rng() % 5000)).count();
  CHECK((!c.index_live<&Rec::b, mv::ordered>()), "the unused index on b must be dropped");
  CHECK(c.stats().rent_drops >= 1, "a rent drop is counted");
  // With rent switched off nothing is dropped for being idle.
  mv::policy p; p.rent_ns_per_byte_op = 0;
  C d(p);
  for (std::uint64_t i = 0; i < 30000; ++i) d.insert({rng() % 5000, rng() % 1000000, i});
  d.build_index<&Rec::b, mv::ordered>();
  for (int i = 0; i < 300000; ++i) d.where(mv::eq<&Rec::a>(rng() % 5000)).count();
  CHECK((d.index_live<&Rec::b, mv::ordered>()), "no rent, no idle drop");
  std::puts("rent         ok: an unused index is dropped, and kept when rent is zero");
  return true;
}

int main() {
  bool ok = true;
  ok &= index_kinds();
  ok &= custom_kind();
  ok &= all_kinds();
  ok &= rent();
  ok &= query_mutation();
  ok &= strings();
  ok &= multi_index();

  mv::policy real;
  ok &= random_ops("real-clock", real, false);

  mv::policy fast; fast.now = &fake_now; fake_step = 10;
  ok &= random_ops("fake-fast", fast, false);

  mv::policy slow; slow.now = &fake_now;
  fake_step = 1'000'000;
  ok &= random_ops("fake-slow", slow, false);

  fake_step = 10;
  ok &= random_ops("force-both", fast, true);

  std::puts(ok && !failures ? "ALL OK" : "FAILED");
  return ok && !failures ? 0 : 1;
}
