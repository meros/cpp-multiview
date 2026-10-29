// multiview: a container whose indexes are built, tried and dropped at run time
// from the queries it sees. See README.md for the model and docs/DESIGN.md for
// the reasoning. Header only, C++23, no dependencies. The index kinds live in
// multiview/kinds.hpp, with the contract for writing your own.
//
//   struct User { std::uint64_t id; std::string city; int age; };
//   mv::multiview<User, mv::fld<&User::id>, mv::fld<&User::city>, mv::fld<&User::age>> users;
//   users.insert({1, "Lund", 31});
//   users.where(mv::eq<&User::city>("Lund"), mv::ge<&User::age>(30))
//        .order_by<&User::age>().limit(10).for_each([&](mv::id i) { use(users[i]); });
//
// You declare fields and ask questions. The container decides which indexes
// exist. Thread safety: none. Queries update statistics, so even a read needs
// exclusive access. Do not change the container from inside a callback.
#pragma once

#include <algorithm>
#include <array>
#include <bit>
#include <chrono>
#include <concepts>
#include <cstdio>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <limits>
#include <optional>
#include <string>
#include <string_view>
#include <tuple>
#include <type_traits>
#include <utility>
#include <vector>

#include "multiview/kinds.hpp"

namespace mv {

/// Default clock of the cost model, in nanoseconds.
inline std::uint64_t steady_ns() {
  return static_cast<std::uint64_t>(
      std::chrono::duration_cast<std::chrono::nanoseconds>(
          std::chrono::steady_clock::now().time_since_epoch())
          .count());
}

namespace detail {
template <class C, class V> V value_of(V C::*);
}

/// The value type of a data member pointer.
template <auto M>
using value_t = std::remove_cvref_t<decltype(detail::value_of(M))>;

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

/// A condition on one declared field. Build one with eq, between, ge, gt, le, lt.
/// The field type must be default constructible, copyable and ordered by `<`.
template <auto M> struct pred {
  using V = value_t<M>;
  static constexpr auto member = M;

  op kind = op::eq;
  V lo{}, hi{};
  bool has_lo = true, has_hi = true;
  bool lo_incl = true, hi_incl = true;

  bool test(const auto& t) const {
    const V& v = t.*M;
    if (has_lo && (lo_incl ? v < lo : !(lo < v))) return false;
    if (has_hi && (hi_incl ? hi < v : !(v < hi))) return false;
    return true;
  }
  /// True if an index probe on this predicate returns exactly the matches.
  bool exact() const { return kind == op::eq || (lo_incl && hi_incl); }
  const V* lo_ptr() const { return has_lo ? &lo : nullptr; }
  const V* hi_ptr() const { return has_hi ? &hi : nullptr; }
};

/// field == v
template <auto M> pred<M> eq(value_t<M> v) {
  pred<M> p; p.kind = op::eq; p.lo = v; p.hi = std::move(v); return p;
}
/// lo <= field <= hi
template <auto M> pred<M> between(value_t<M> lo, value_t<M> hi) {
  pred<M> p; p.kind = op::range; p.lo = std::move(lo); p.hi = std::move(hi); return p;
}
/// field >= v
template <auto M> pred<M> ge(value_t<M> v) {
  pred<M> p; p.kind = op::range; p.lo = std::move(v); p.has_hi = false; return p;
}
/// field > v
template <auto M> pred<M> gt(value_t<M> v) {
  pred<M> p = ge<M>(std::move(v)); p.lo_incl = false; return p;
}
/// field <= v
template <auto M> pred<M> le(value_t<M> v) {
  pred<M> p; p.kind = op::range; p.hi = std::move(v); p.has_lo = false; return p;
}
/// field < v
template <auto M> pred<M> lt(value_t<M> v) {
  pred<M> p = le<M>(std::move(v)); p.hi_incl = false; return p;
}

/// The name of a data member, taken from the compiler at compile time:
/// member_name<&User::city>() is "city". Returns "" if the compiler does not
/// print it in a form we know.
template <auto M> constexpr std::string_view member_name() {
#if defined(__GNUC__) || defined(__clang__)
  constexpr std::string_view f = __PRETTY_FUNCTION__;
  const auto a = f.find("M = ");
  if (a == std::string_view::npos) return {};
  const auto b = f.find_first_of(";]", a);
  auto expr = f.substr(a + 4, b - a - 4);
  if (const auto c = expr.rfind("::"); c != std::string_view::npos) expr = expr.substr(c + 2);
  while (!expr.empty() && (expr.front() == '&' || expr.front() == ' ')) expr.remove_prefix(1);
  return expr;
#else
  return {};
#endif
}

template <class... P> struct conj { std::tuple<P...> ps; };

template <class> inline constexpr bool is_pred_v = false;
template <auto M> inline constexpr bool is_pred_v<pred<M>> = true;

/// Both predicates must hold: where(a == 1 && b > 2).
template <auto A, auto B> conj<pred<A>, pred<B>> operator&&(pred<A> a, pred<B> b) { return {{std::move(a), std::move(b)}}; }
template <class... P, auto B> conj<P..., pred<B>> operator&&(conj<P...> a, pred<B> b) {
  return {std::tuple_cat(std::move(a.ps), std::tuple<pred<B>>(std::move(b)))};
}

/// A field as a value, so a query reads like a condition:
///   constexpr auto age = mv::col<&User::age>;
///   users.where(age >= 30 && city == "Lund").order_by(age).first();
template <auto M> struct col_t {
  using V = value_t<M>;
  static constexpr auto member = M;
  pred<M> operator==(V v) const { return eq<M>(std::move(v)); }
  pred<M> operator<(V v) const { return lt<M>(std::move(v)); }
  pred<M> operator<=(V v) const { return le<M>(std::move(v)); }
  pred<M> operator>(V v) const { return gt<M>(std::move(v)); }
  pred<M> operator>=(V v) const { return ge<M>(std::move(v)); }
  pred<M> between(V lo, V hi) const { return mv::between<M>(std::move(lo), std::move(hi)); }
  constexpr std::string_view name() const { return member_name<M>(); }
};
template <auto M> inline constexpr col_t<M> col{};

// ---------------------------------------------------------------------------
// Policy and introspection
// ---------------------------------------------------------------------------

/// Tuning knobs. The container measures costs; the priors only apply until
/// the first measurement. Times are nanoseconds.
struct policy {
  bool adaptive = true;            ///< false freezes the set of indexes
  std::size_t small_size = 32;     ///< below this size a scan always wins
  std::size_t max_index_bytes = 0; ///< 0 means no limit
  double prior_scan_ns = 5;        ///< per element
  double prior_build_ns = 150;     ///< per element
  double prior_write_ns = 100;     ///< per write to one index
  unsigned sample_mask = 15;       ///< time one probe in (mask+1) at first; backs off when stable
  double redundant_fraction = 0.05; ///< a redundant kind goes at this fraction of its build cost in write cost
  /// What a byte of index costs per container operation, in nanoseconds. Every
  /// live index pays this rent on every operation and earns credit when it
  /// serves a query. With 1e-5, a 34 MB index costs 340 ns per operation. The
  /// cloud price of memory is about 100 times lower; this default favours
  /// frugality. Use 0 to ignore memory.
  double rent_ns_per_byte_op = 1e-5;
  double eagerness = 1.0;          ///< build when scan time reaches eagerness x build cost; <1 builds sooner
  std::uint64_t min_sample_ns = 0; ///< coarse clocks (browsers): repeat a sampled probe until it spans this long
  std::uint64_t (*now)() = &steady_ns; ///< replace for deterministic tests
};

/// One row of multiview::indexes().
struct index_info {
  std::size_t field;
  std::string field_name;
  std::string_view kind;
  bool live;
  double probe_ns;       ///< recent mean time of one probe, 0 if unmeasured
  double build_ms;       ///< time of the last build
  std::uint64_t uses;    ///< probes since the last build
  std::size_t bytes;
};

/// Event counters, for the playground and for tests.
struct counters {
  std::uint64_t scans = 0, probes = 0, walks = 0, builds = 0, drops = 0, rent_drops = 0, trials = 0;
};

namespace detail {

inline constexpr unsigned kWarm = 16;     // every probe is timed until a kind has this many samples
inline constexpr unsigned kMeasured = 8;  // samples before a kind's estimate is trusted

template <class I> struct slot {
  I idx;
  bool live = false, tried = false;
  double balance = 0;                      // estimated savings minus write cost
  double build_ns = 0, build_per_elem = 0; // last build
  double probe_ns = 0, ema = 0;            // estimated total, recent mean
  double credit = 0;                       // estimated saving per use
  double write_ema = 0;
  unsigned samples = 0, w_samples = 0;
  std::uint32_t calls = 0, writes = 0;
  std::uint32_t mask = 15;                // sampling interval minus one; grows while stable
  double bpe = 0;                         // bytes per element at the last build
  bool earned = false;                    // balance has reached the build cost since the last build
  std::uint64_t rent_dropped_at = 0;      // when it was dropped for not earning its rent, 0 if not
  double patience = 1.0;                  // multiplier on the drop threshold, learned from regret
  std::uint8_t penalty = 0;               // each automatic drop doubles the evidence needed to rebuild
  std::array<std::uint64_t, n_ops> uses{};
};

template <class F> struct field_state;

template <auto M, template <class> class... Ks> struct field_state<field_decl<M, Ks...>> {
  static constexpr auto member = M;
  using V = value_t<M>;
  static constexpr std::size_t nk = sizeof...(Ks);
  static_assert((check_kind<Ks, V>() && ...));
  static constexpr std::array<std::array<bool, n_ops>, nk> caps = {
      {std::array<bool, n_ops>{Ks<V>::supports(op::eq), Ks<V>::supports(op::range)}...}};

  std::tuple<slot<Ks<V>>...> slots;
  // Cached by refresh(): the kind to use per op (-1 = none), and how many serve it.
  std::array<std::int8_t, n_ops> best{-1, -1};
  std::array<std::uint8_t, n_ops> nlive{};
  std::uint8_t live_total = 0;
  // Measured cost of a scan charged to this field, per op.
  std::array<double, n_ops> scan_cost{}, scan_spent{};
  std::array<std::size_t, n_ops> scan_size{};
  std::uint32_t tick = 0, explore_every = 64;
  // Observed traffic on this field; the cost of a kind is its probe time plus
  // its write time weighted by the ratio of writes to probes.
  std::array<std::uint64_t, n_ops> n_probe{};
  std::uint64_t n_write = 0, n_ticks = 0; // writes and container operations seen
  // Learned from outcomes: below 1 after builds that paid off, above 1 after
  // builds that were dropped without paying off. Scales the build threshold.
  std::array<double, n_ops> eager_mult{1.0, 1.0};

  template <class Fn> void each_k(Fn&& fn) {
    [&]<std::size_t... J>(std::index_sequence<J...>) {
      (fn(J, std::get<J>(slots)), ...);
    }(std::make_index_sequence<nk>{});
  }
  template <class Fn> void visit(std::size_t k, Fn&& fn) {
    each_k([&](std::size_t j, auto& sl) { if (j == k) fn(sl); });
  }
  template <template <class> class K> static constexpr std::size_t kind_index() {
    std::size_t r = nk, j = 0;
    ((std::is_same_v<K<V>, Ks<V>> && r == nk ? (void)(r = j) : (void)0, ++j), ...);
    return r;
  }

  /// Expected cost of one probe of op `o` on this kind, writes included.
  // `rent_unit` is the rent of one element-byte per operation, times the size.
  template <class Sl> double cost(const Sl& sl, std::size_t o, double prior_write_ns, double rent_unit) const {
    const double probes = double(std::max<std::uint64_t>(n_probe[o], 1));
    const double w = sl.w_samples ? sl.write_ema : prior_write_ns;
    return sl.ema + (w * double(n_write) + rent_unit * sl.bpe * double(n_ticks)) / probes;
  }

  /// Recompute best[] and nlive[]. The lowest cost wins; a kind with too few
  /// samples goes first so that it gets measured.
  void refresh(double prior_write_ns, double rent_unit) {
    live_total = 0;
    if (n_write > (1u << 24) || n_ticks > (1u << 24)) { n_write /= 2; n_ticks /= 2; for (auto& p : n_probe) p /= 2; }
    for (std::size_t o = 0; o < n_ops; ++o) {
      int bk = -1; double be = 0; bool unmeasured = false; std::uint8_t n = 0;
      each_k([&](std::size_t j, auto& sl) {
        if (!sl.live || !caps[j][o]) return;
        ++n;
        if (unmeasured) return;
        if (sl.samples < kMeasured) { bk = int(j); unmeasured = true; return; }
        const double c = cost(sl, o, prior_write_ns, rent_unit);
        if (bk < 0 || c < be) { bk = int(j); be = c; }
      });
      best[o] = static_cast<std::int8_t>(bk);
      nlive[o] = n;
    }
    each_k([&](std::size_t, auto& sl) { live_total += sl.live; });
  }
  /// The kind to probe on an exploration call: the live kinds take turns.
  int explore(op o) {
    std::array<int, nk> c{};
    std::size_t nc = 0;
    each_k([&](std::size_t j, auto& sl) { if (sl.live && caps[j][std::size_t(o)]) c[nc++] = int(j); });
    return nc ? c[(tick / explore_every) % nc] : -1;
  }
};

/// How a query reaches its candidates.
struct plan {
  enum class access : std::uint8_t { scan, probe, walk };
  access how = access::scan;
  int pred = -1;  // position of the probed (or bounding) predicate in the pack
  int kind = -1;  // index kind within the field
  std::size_t field = 0;
  op o = op::eq;
  bool explore = false;
};

/// What one index probe saw, for feedback to the controller.
struct probe_stats {
  std::size_t visited = 0, accepted = 0;
  double ns = 0;       // estimated cost of this kind of call, if it was timed
  bool sampled = false;
};

} // namespace detail

template <class MV, class Tup, auto Ord> class query;

// ---------------------------------------------------------------------------
// The container
// ---------------------------------------------------------------------------

/// A set of T with adaptive indexes over the declared fields.
/// `Fs` are field_decl types, usually written mv::fld<&T::member>.
template <class T, class... Fs> class multiview {
  using states_t = std::tuple<detail::field_state<Fs>...>;
  template <class, class, auto> friend class query;

public:
  using value_type = T;
  static constexpr std::size_t n_fields = sizeof...(Fs);

  explicit multiview(policy p = {}) : pol_(p) {}

  // ---- storage ------------------------------------------------------------

  std::size_t size() const { return size_; }
  bool empty() const { return size_ == 0; }
  bool contains(id i) const { return i < items_.size() && live_[i]; }
  const T& operator[](id i) const { return items_[i]; }
  const T& get(id i) const { return items_[i]; }

  void reserve(std::size_t n) { items_.reserve(n); live_.reserve(n); }

  id insert(T t) {
    id i;
    if (!free_.empty()) {
      i = free_.back();
      free_.pop_back();
      items_[i] = std::move(t);
      live_[i] = 1;
    } else {
      i = static_cast<id>(items_.size());
      items_.push_back(std::move(t));
      live_.push_back(1);
    }
    ++size_;
    tick_ops();
    each_field([&](auto& s) { add_key(s, i, items_[i].*std::decay_t<decltype(s)>::member); });
    return i;
  }
  template <class... A> id emplace(A&&... a) { return insert(T(std::forward<A>(a)...)); }
  template <class R> void insert_range(R&& r) {
    if constexpr (requires { std::size(r); }) reserve(size_ + std::size(r));
    for (auto&& x : r) insert(T(x));
  }

  void erase(id i) {
    tick_ops();
    each_field([&](auto& s) { remove_key(s, i, items_[i].*std::decay_t<decltype(s)>::member); });
    live_[i] = 0;
    free_.push_back(i);
    --size_;
  }

  /// The only safe way to change an element: indexes follow the change.
  /// Direct writes through a reference or pointer break them, as in
  /// Boost.MultiIndex and any hash container. If `f` throws, the indexes
  /// follow the element as it is at that point.
  template <class F> void modify(id i, F&& f) {
    tick_ops();
    std::tuple<std::optional<value_t<Fs::member>>...> old;
    [&]<std::size_t... K>(std::index_sequence<K...>) {
      ((std::get<K>(fs_).live_total ? (void)(std::get<K>(old) = items_[i].*Fs::member) : (void)0), ...);
    }(std::make_index_sequence<n_fields>{});

    auto reindex = [&] {
      [&]<std::size_t... K>(std::index_sequence<K...>) {
        (([&] {
           auto& s = std::get<K>(fs_);
           auto& o = std::get<K>(old);
           if (o && !(*o == items_[i].*Fs::member)) {
             remove_key(s, i, *o);
             add_key(s, i, items_[i].*Fs::member);
           }
         }()),
         ...);
      }(std::make_index_sequence<n_fields>{});
    };
    try {
      std::forward<F>(f)(items_[i]);
    } catch (...) {
      reindex();
      throw;
    }
    reindex();
  }

  /// Remove all elements. Indexes stay live and empty.
  void clear() {
    items_.clear(); live_.clear(); free_.clear(); size_ = 0;
    each_field([&](auto& s) { s.each_k([&](std::size_t, auto& sl) { if (sl.live) sl.idx.clear(); }); });
  }

  /// Visit every element: fn(id, const T&).
  template <class Fn> void for_each_item(Fn&& fn) const {
    for (id i = 0; i < items_.size(); ++i)
      if (live_[i]) fn(i, items_[i]);
  }

  // ---- queries ------------------------------------------------------------

  /// A lazy query: all the predicates must hold. Nothing runs until a
  /// terminal call (for_each, ids, first, exists, count, erase, update).
  template <class... P> requires(is_pred_v<P> && ...)
  auto where(P... ps) {
    return query<multiview, std::tuple<P...>, nullptr>(*this, std::tuple<P...>(std::move(ps)...));
  }
  template <class... P> auto where(conj<P...> c) {
    return query<multiview, std::tuple<P...>, nullptr>(*this, std::move(c.ps));
  }
  /// A query with no predicate: every element.
  auto all() { return where(); }

  // ---- control and introspection -----------------------------------------

  policy& options() { return pol_; }
  const counters& stats() const { return ctr_; }

  /// Give the fields display names for indexes() and explain().
  void name_fields(std::array<std::string_view, n_fields> names) { names_ = names; }

  /// Build an index now, for callers that know their workload.
  template <auto M, template <class> class K> void build_index() {
    auto& s = state_of<M>();
    using S = std::decay_t<decltype(s)>;
    constexpr std::size_t k = S::template kind_index<K>();
    static_assert(k < S::nk, "kind is not declared for this field");
    s.visit(k, [&](auto& sl) { build<S>(s, sl); sl.tried = true; });
  }
  template <auto M, template <class> class K> void drop_index() {
    auto& s = state_of<M>();
    s.visit(std::decay_t<decltype(s)>::template kind_index<K>(), [&](auto& sl) { drop(s, sl); });
  }
  template <auto M, template <class> class K> bool index_live() {
    auto& s = state_of<M>();
    bool r = false;
    s.visit(std::decay_t<decltype(s)>::template kind_index<K>(), [&](auto& sl) { r = sl.live; });
    return r;
  }
  /// Probes served by this index since its last build.
  template <auto M, template <class> class K> std::uint64_t uses() {
    auto& s = state_of<M>();
    std::uint64_t r = 0;
    s.visit(std::decay_t<decltype(s)>::template kind_index<K>(),
            [&](auto& sl) { for (auto u : sl.uses) r += u; });
    return r;
  }

  // ---- runtime selection of kinds (for tools and the playground) ---------

  /// Number of kinds declared for a field.
  std::size_t n_kinds(std::size_t field) {
    std::size_t r = 0;
    [&]<std::size_t... F>(std::index_sequence<F...>) {
      ((F == field ? (void)(r = std::tuple_element_t<F, states_t>::nk) : (void)0), ...);
    }(std::make_index_sequence<n_fields>{});
    return r;
  }
  /// Build kind `kind` of field `field` now.
  void build_index_at(std::size_t field, std::size_t kind) {
    [&]<std::size_t... F>(std::index_sequence<F...>) {
      ((F == field ? std::get<F>(fs_).visit(kind, [&](auto& sl) {
         build<std::tuple_element_t<F, states_t>>(std::get<F>(fs_), sl);
         sl.tried = true;
       }) : void()), ...);
    }(std::make_index_sequence<n_fields>{});
  }
  void drop_index_at(std::size_t field, std::size_t kind) {
    [&]<std::size_t... F>(std::index_sequence<F...>) {
      ((F == field ? std::get<F>(fs_).visit(kind, [&](auto& sl) { drop(std::get<F>(fs_), sl); }) : void()), ...);
    }(std::make_index_sequence<n_fields>{});
  }

  /// Every declared (field, kind) pair with its state and measurements.
  std::vector<index_info> indexes() {
    std::vector<index_info> out;
    [&]<std::size_t... F>(std::index_sequence<F...>) {
      (std::get<F>(fs_).each_k([&](std::size_t, auto& sl) {
         std::uint64_t u = 0;
         for (auto x : sl.uses) u += x;
         out.push_back({F, field_name(F), std::decay_t<decltype(sl.idx)>::name, sl.live,
                        sl.samples ? sl.ema : 0.0, sl.build_ns / 1e6, u, sl.live ? sl.idx.bytes() : 0});
       }),
       ...);
    }(std::make_index_sequence<n_fields>{});
    return out;
  }

  /// A table of every declared index: state, measured probe time, uses, memory.
  std::string report() {
    std::string o;
    char b[160];
    std::snprintf(b, sizeof b, "%zu elements, %zu KB of indexes\n", size_, total_index_bytes() / 1024);
    o += b;
    std::snprintf(b, sizeof b, "  %-12s %-13s %-5s %10s %10s %8s\n", "field", "kind", "state", "probe ns", "uses", "KB");
    o += b;
    for (const auto& i : indexes()) {
      std::snprintf(b, sizeof b, "  %-12s %-13s %-5s %10.0f %10llu %8zu\n", i.field_name.c_str(),
                    std::string(i.kind).c_str(), i.live ? "live" : "off", i.probe_ns,
                    static_cast<unsigned long long>(i.uses), i.bytes / 1024);
      o += b;
    }
    return o;
  }

  /// Bytes held by live indexes (estimate for node-free kinds).
  std::size_t index_bytes() { return total_index_bytes(); }

private:
  // ---- field lookup -------------------------------------------------------

  template <auto A, auto B> static constexpr bool same_member() {
    if constexpr (std::is_same_v<decltype(A), decltype(B)>) return A == B;
    else return false;
  }
  template <auto M> static constexpr std::size_t index_of() {
    std::size_t r = n_fields, j = 0;
    ((same_member<M, Fs::member>() && r == n_fields ? (void)(r = j) : (void)0, ++j), ...);
    return r;
  }
  template <auto M> auto& state_of() {
    static_assert(index_of<M>() < n_fields,
                  "multiview: this field is not declared. Add mv::fld<&T::member> (or mv::field_decl<&T::member, kinds...>) to the multiview template arguments");
    return std::get<index_of<M>()>(fs_);
  }
  template <class F> void each_field(F&& f) {
    std::apply([&](auto&... s) { (f(s), ...); }, fs_);
  }
  std::string field_name(std::size_t f) const {
    return names_[f].empty() ? "field#" + std::to_string(f) : std::string(names_[f]);
  }

  // ---- maintenance and the controller ------------------------------------

  static double cap_of(const auto& sl) { return std::max(sl.build_ns, 1.0); }

  // A build that is dropped before it paid for itself says: be less eager.
  template <class S, class Sl> void learn_from_drop(S& s, const Sl& sl, std::size_t k) {
    if (sl.earned) return;
    for (std::size_t o = 0; o < n_ops; ++o)
      if (S::caps[k][o]) s.eager_mult[o] = std::min(s.eager_mult[o] * 2, 8.0);
  }

  template <class S, class Sl> void drop(S& s, Sl& sl) {
    sl.live = false;
    sl.idx.clear();
    sl.balance = 0;
    s.explore_every = 64;
    ++ctr_.drops;
    s.refresh(pol_.prior_write_ns, rent_unit());
  }

  // May an index kind be dropped? Not if it is the only live provider of an
  // operation that queries use.
  template <class S> bool can_drop(S& s, std::size_t k) {
    bool ok = true;
    s.visit(k, [&](auto& sl) {
      for (std::size_t o = 0; o < n_ops; ++o) {
        if (!S::caps[k][o] || sl.uses[o] == 0) continue;
        bool other = false;
        s.each_k([&](std::size_t j, auto& sj) { other = other || (j != k && sj.live && S::caps[j][o]); });
        if (!other) ok = false;
      }
    });
    return ok;
  }

  // Redundant: droppable, and for every op it has served, the planner prefers
  // another kind.
  template <class S> bool redundant(S& s, std::size_t k) {
    if (!can_drop(s, k)) return false;
    bool r = true;
    s.visit(k, [&](auto& sl) {
      for (std::size_t o = 0; o < n_ops; ++o)
        if (S::caps[k][o] && sl.uses[o] > 0 && s.best[o] == int(k)) r = false;
    });
    return r;
  }

  template <class S, class Sl> void note_write(S& s, Sl& sl, std::size_t k, bool sampled, std::uint64_t ns) {
    if (sampled) {
      sl.write_ema = sl.w_samples ? 0.8 * sl.write_ema + 0.2 * double(ns) : double(ns);
      ++sl.w_samples;
    }
    sl.balance -= sl.w_samples ? sl.write_ema : pol_.prior_write_ns;
    if (!pol_.adaptive) return;
    // Carrying an index costs writes. Drop it when that exceeds the cost of
    // building it again, or, for a redundant kind, a twentieth of that.
    const double limit = cap_of(sl) * sl.patience;
    if (sl.balance < -limit * pol_.redundant_fraction && (sl.balance < -limit || redundant(s, k))) {
      sl.penalty = static_cast<std::uint8_t>(std::min(sl.penalty + 1, 6));
      learn_from_drop(s, sl, k);
      drop(s, sl);
    }
  }

  template <class S> void add_key(S& s, id i, const auto& key) {
    if (!s.live_total) return;
    ++s.n_write;
    s.each_k([&](std::size_t k, auto& sl) {
      if (!sl.live) return;
      const bool sample = pol_.adaptive && (sl.w_samples < detail::kWarm || (++sl.writes & pol_.sample_mask) == 0);
      const std::uint64_t t0 = sample ? pol_.now() : 0;
      sl.idx.add(key, i);
      if constexpr (requires { sl.idx.usable(); }) {
        if (!sl.idx.usable()) { sl.tried = true; drop(s, sl); return; }
      }
      note_write(s, sl, k, sample, sample ? pol_.now() - t0 : 0);
    });
  }
  template <class S> void remove_key(S& s, id i, const auto& key) {
    if (!s.live_total) return;
    ++s.n_write;
    s.each_k([&](std::size_t k, auto& sl) {
      if (!sl.live) return;
      const bool sample = pol_.adaptive && (sl.w_samples < detail::kWarm || (++sl.writes & pol_.sample_mask) == 0);
      const std::uint64_t t0 = sample ? pol_.now() : 0;
      sl.idx.remove(key, i);
      note_write(s, sl, k, sample, sample ? pol_.now() - t0 : 0);
    });
  }

  std::size_t total_index_bytes() {
    std::size_t b = 0;
    each_field([&](auto& s) { s.each_k([&](std::size_t, auto& sl) { if (sl.live) b += sl.idx.bytes(); }); });
    return b;
  }
  bool budget_allows() {
    if (!pol_.max_index_bytes) return true;
    return total_index_bytes() + size_ * 32 <= pol_.max_index_bytes;
  }

  double rent_unit() const { return pol_.rent_ns_per_byte_op * double(size_); }

  // Operations an index survives without earning anything: the threshold
  // divided by its rent per operation.
  template <class Sl> double patience_ops(const Sl& sl) const {
    const double rent = pol_.rent_ns_per_byte_op * sl.bpe * double(size_);
    return rent > 0 ? cap_of(sl) * sl.patience / rent : 1e18;
  }

  // Every 128 operations each live index pays its memory rent. One that has
  // spent its credit and its patience is dropped: a maintained index is never
  // free, in memory or in runtime. A drop that is soon regretted (the index is
  // built again) doubles the patience for that index. A drop that holds trims
  // it by a quarter.
  void charge_rent() {
    constexpr std::uint64_t kStep = 128;
    each_field([&](auto& s) {
      s.n_ticks += kStep;
      if (!pol_.adaptive || !s.live_total) return;
      s.each_k([&](std::size_t k, auto& sl) {
        if (!sl.live) return;
        sl.balance -= double(kStep) * pol_.rent_ns_per_byte_op * sl.bpe * double(size_);
        const double limit = cap_of(sl) * sl.patience;
        if (sl.balance >= -limit * pol_.redundant_fraction) return;
        if (sl.balance >= -limit && !redundant(s, k)) return;
        learn_from_drop(s, sl, k);
        sl.rent_dropped_at = ops_;
        sl.patience = std::max(1.0, sl.patience * 0.75);
        ++ctr_.rent_drops;
        drop(s, sl);
      });
    });
  }
  void tick_ops() {
    if ((++ops_ & 127) == 0) charge_rent();
  }

  template <class S, class Sl> void build(S& s, Sl& sl) {
    using V = typename S::V;
    if (sl.rent_dropped_at && double(ops_ - sl.rent_dropped_at) < 8 * patience_ops(sl))
      sl.patience = std::min(sl.patience * 2, 4096.0); // regret: it was needed after all
    sl.rent_dropped_at = 0;
    const std::uint64_t t0 = pol_.now();
    sl.idx.clear();
    if constexpr (requires(decltype(sl.idx) ix, std::vector<std::pair<V, id>> v) { ix.assign(std::move(v)); }) {
      std::vector<std::pair<V, id>> all;
      all.reserve(size_);
      for (id i = 0; i < items_.size(); ++i)
        if (live_[i]) all.emplace_back(items_[i].*S::member, i);
      sl.idx.assign(std::move(all));
    } else {
      sl.idx.reserve(size_);
      for (id i = 0; i < items_.size(); ++i)
        if (live_[i]) sl.idx.add(items_[i].*S::member, i);
    }
    const double ns = double(pol_.now() - t0);
    sl.live = true;
    sl.balance = 0;
    sl.build_ns = ns;
    sl.build_per_elem = size_ ? ns / double(size_) : 0;
    sl.probe_ns = sl.ema = sl.credit = 0;
    sl.samples = sl.calls = 0;
    sl.earned = false;
    sl.mask = pol_.sample_mask;
    sl.uses = {};
    s.explore_every = 64;
    sl.bpe = size_ ? double(sl.idx.bytes()) / double(size_) : 0;
    ++ctr_.builds;
    s.refresh(pol_.prior_write_ns, rent_unit());
    if constexpr (requires { sl.idx.usable(); }) {
      if (!sl.idx.usable()) { // the data does not suit this kind
        sl.tried = true;
        drop(s, sl);
      }
    }
  }

  template <class S> double est_build_ns(S& s, std::size_t k) {
    double per_elem = pol_.prior_build_ns;
    s.visit(k, [&](auto& sl) { if (sl.build_per_elem > 0) per_elem = sl.build_per_elem; });
    return per_elem * double(size_);
  }

  // After a sampled probe: try another kind once the incumbent has spent as
  // much time probing as it took to build; drop a kind that stays clearly
  // slower than the best one.
  template <class S> void after_sample(S& s, op o, int k) {
    bool paid = false;
    s.visit(std::size_t(k), [&](auto& sl) { paid = sl.build_ns > 0 && sl.probe_ns >= sl.build_ns; });
    bool resolved = true;
    s.each_k([&](std::size_t j, auto& sj) {
      if (sj.live && S::caps[j][std::size_t(o)] && sj.samples < detail::kWarm) resolved = false;
    });
    if (paid && resolved && budget_allows()) {
      bool done = false;
      s.each_k([&](std::size_t j, auto& sj) {
        if (!done && !sj.live && !sj.tried && S::caps[j][std::size_t(o)]) {
          build<S>(s, sj);
          sj.tried = true;
          ++ctr_.trials;
          done = true;
        }
      });
    }
    std::array<std::size_t, S::nk> c{};
    std::array<double, S::nk> e{};
    std::size_t nc = 0;
    bool ready = true;
    s.each_k([&](std::size_t j, auto& sl) {
      if (sl.live && S::caps[j][std::size_t(o)]) {
        c[nc] = j; e[nc] = s.cost(sl, std::size_t(o), pol_.prior_write_ns, rent_unit());
        ready = ready && sl.samples >= detail::kWarm;
        ++nc;
      }
    });
    if (nc < 2 || !ready) return;
    const double best = *std::min_element(e.begin(), e.begin() + static_cast<std::ptrdiff_t>(nc));
    for (std::size_t q = 0; q < nc; ++q)
      if (e[q] > 1.25 * best && can_drop(s, c[q]))
        s.visit(c[q], [&](auto& sl) { drop(s, sl); });
  }

  // ---- planning -----------------------------------------------------------

  template <class Tup, class Fn> static void visit_pred(const Tup& ps, int pos, Fn&& fn) {
    [&]<std::size_t... J>(std::index_sequence<J...>) {
      ((int(J) == pos ? (void)fn(std::get<J>(ps)) : (void)0), ...);
    }(std::make_index_sequence<std::tuple_size_v<Tup>>{});
  }

  template <auto Ord, class Tup> detail::plan choose(const Tup& ps) {
    using detail::plan;
    plan pl;
    constexpr bool ordered = !std::is_null_pointer_v<decltype(Ord)>;
    auto try_probe = [&](op want) {
      [&]<std::size_t... J>(std::index_sequence<J...>) {
        ((pl.how == detail::plan::access::scan && std::get<J>(ps).kind == want ? [&] {
           auto& s = state_of<std::decay_t<decltype(std::get<J>(ps))>::member>();
           int k = s.best[std::size_t(want)];
           if (k < 0) return;
           bool explore = false;
           if (s.nlive[std::size_t(want)] > 1 && (++s.tick & (s.explore_every - 1)) == 0) { k = s.explore(want); explore = true; }
           pl = {detail::plan::access::probe, int(J), k, 0, want, explore};
         }() : void()),
         ...);
      }(std::make_index_sequence<std::tuple_size_v<Tup>>{});
    };
    if constexpr (ordered) {
      // With an order, an equality probe gives few candidates to sort. Without
      // one, walk the ordered index and stop early.
      try_probe(op::eq);
      if (pl.how == detail::plan::access::scan) {
        auto& os = state_of<Ord>();
        if (os.best[std::size_t(op::range)] >= 0) {
          pl = {detail::plan::access::walk, -1, os.best[std::size_t(op::range)], index_of<Ord>(), op::range, false};
          [&]<std::size_t... J>(std::index_sequence<J...>) {
            ((pl.pred < 0 && same_member<std::decay_t<decltype(std::get<J>(ps))>::member, Ord>() ? (void)(pl.pred = int(J)) : (void)0), ...);
          }(std::make_index_sequence<std::tuple_size_v<Tup>>{});
        } else {
          try_probe(op::range);
        }
      }
    } else {
      try_probe(op::eq);
      if (pl.how == detail::plan::access::scan) try_probe(op::range);
    }
    return pl;
  }

  template <class Tup> bool accept(const Tup& ps, id i) const {
    const T& t = items_[i];
    return std::apply([&](const auto&... p) { return (p.test(t) && ...); }, ps);
  }

  // Like accept(), but trust the predicate at `skip`: an exact index probe has
  // already checked it. With no other predicate the element is never loaded.
  template <class Tup> bool accept_skip(const Tup& ps, id i, int skip) const {
    if constexpr (std::tuple_size_v<Tup> == 0) {
      return true;
    } else {
      const T& t = items_[i];
      return [&]<std::size_t... J>(std::index_sequence<J...>) {
        return ((int(J) == skip || std::get<J>(ps).test(t)) && ...);
      }(std::make_index_sequence<std::tuple_size_v<Tup>>{});
    }
  }

  // Run a plan: call sink(id) for each match, at most `limit`, until sink says stop.
  template <auto Ord, class Tup, class Sink>
  void exec(const Tup& ps, const detail::plan& pl, bool desc, std::size_t limit, Sink& sink) {
    using detail::plan;
    if (limit == 0) return;
    if (pl.how == detail::plan::access::scan) { run_scan<Ord>(ps, limit, sink); return; }
    if (pl.how == detail::plan::access::probe) {
      ++ctr_.probes;
      visit_pred(ps, pl.pred, [&](const auto& p) {
        detail::probe_stats st;
        run_index(p.lo_ptr(), p.hi_ptr(), state_of<std::decay_t<decltype(p)>::member>(), pl, ps,
                  p.exact() ? pl.pred : -1, false, limit, sink, st);
      });
      return;
    }
    ++ctr_.walks;
    if constexpr (!std::is_null_pointer_v<decltype(Ord)>) {
      const typename std::decay_t<decltype(state_of<Ord>())>::V* lo = nullptr;
      const typename std::decay_t<decltype(state_of<Ord>())>::V* hi = nullptr;
      int skip = -1;
      if (pl.pred >= 0) visit_pred(ps, pl.pred, [&](const auto& p) {
        if constexpr (std::is_same_v<std::decay_t<decltype(p)>, pred<Ord>>) {
          lo = p.lo_ptr(); hi = p.hi_ptr();
          if (p.exact()) skip = pl.pred;
        }
      });
      detail::probe_stats st;
      run_index(lo, hi, state_of<Ord>(), pl, ps, skip, desc, limit, sink, st);
      // A walk filters as it goes. If it visits far more entries than it
      // returns, a predicate it could not use is the real cost: charge that
      // field as if the walk had been a scan, so that an index can appear.
      if (st.sampled && st.visited >= 64 && st.accepted * 16 < st.visited) charge_scan<Ord>(ps, st.ns, false);
    }
  }

  template <class V, class S, class Tup, class Sink>
  void run_index(const V* lo, const V* hi, S& s, const detail::plan& pl, const Tup& ps, int skip,
                 bool desc, std::size_t limit, Sink& sink, detail::probe_stats& st) {
    const std::size_t o = std::size_t(pl.o);
    s.visit(std::size_t(pl.kind), [&](auto& sl) {
      ++sl.uses[o];
      ++s.n_probe[o];
      const bool sample = pol_.adaptive &&
          (pl.explore || sl.samples < detail::kWarm || (++sl.calls & sl.mask) == 0);
      if (!sample) {
        std::size_t n = 0;
        sl.idx.probe(lo, hi, desc, [&](id i) {
          if (!accept_skip(ps, i, skip)) return true;
          ++n;
          return sink(i) && n < limit;
        });
        st.accepted = n;
        sl.balance = std::min(sl.balance + sl.credit, cap_of(sl));
        if (sl.balance >= cap_of(sl)) {
          sl.penalty = 0;
          if (!sl.earned) { sl.earned = true; s.eager_mult[o] = std::max(s.eager_mult[o] * 0.7, 0.125); }
        }
        return;
      }
      // Sampled: time the traversal and the filter, not the caller's sink.
      scratch_guard g(*this);
      auto& buf = *g.buf;
      const std::uint64_t t0 = pol_.now();
      sl.idx.probe(lo, hi, desc, [&](id i) {
        ++st.visited;
        if (!accept_skip(ps, i, skip)) return true;
        buf.push_back(i);
        return buf.size() < limit;
      });
      double ns = double(pol_.now() - t0);
      if (pol_.min_sample_ns && ns < double(pol_.min_sample_ns)) {
        // The clock cannot resolve one probe. Repeat the (read-only) probe in
        // growing batches until the elapsed time is well above the resolution.
        for (std::size_t reps = 8; reps <= (std::size_t{1} << 22); reps *= 4) {
          const std::uint64_t r0 = pol_.now();
          for (std::size_t r = 0; r < reps; ++r) {
            std::size_t n = 0;
            sl.idx.probe(lo, hi, desc, [&](id i) {
              if (!accept_skip(ps, i, skip)) return true;
              return ++n < limit;
            });
            repeat_sink_ += n;
          }
          const double el = double(pol_.now() - r0);
          if (el >= double(pol_.min_sample_ns)) { ns = el / double(reps); break; }
        }
      }
      const double weight = sl.samples < detail::kWarm ? 1.0 : double(sl.mask + 1);
      st.sampled = true;
      st.ns = ns * weight;
      st.accepted = buf.size();
      // The first sample of a kind is cold (caches, page faults): the second
      // replaces it. Later samples are clamped so that one stall moves little.
      if (sl.samples < 2) sl.ema = ns;
      else sl.ema = 0.8 * sl.ema + 0.2 * std::min(ns, 4 * sl.ema);
      ++sl.samples;
      sl.probe_ns += ns * weight;
      const double scan = s.scan_cost[o] > 0
          ? s.scan_cost[o] * double(size_) / double(std::max<std::size_t>(s.scan_size[o], 1))
          : pol_.prior_scan_ns * double(size_);
      // What this kind saves: compared with a scan, or, when another live
      // kind serves the op, compared with that kind (a slower twin saves nothing).
      double ref = scan;
      s.each_k([&](std::size_t j, auto& sj) {
        if (static_cast<void*>(&sj) != static_cast<void*>(&sl) && sj.live && S::caps[j][o] && sj.samples >= detail::kMeasured)
          ref = std::min(ref, sj.ema);
      });
      sl.credit = std::max(0.0, ref - sl.ema);
      sl.balance = std::min(sl.balance + sl.credit, cap_of(sl));
      if (sl.balance >= cap_of(sl) && !sl.earned) { sl.earned = true; s.eager_mult[o] = std::max(s.eager_mult[o] * 0.7, 0.125); }
      for (id i : buf)
        if (!sink(i)) break;
      // While the ranking holds, time less often and explore less often.
      const auto prev = s.best[o];
      s.refresh(pol_.prior_write_ns, rent_unit());
      const bool stable = s.best[o] == prev;
      if (sl.samples >= detail::kWarm) sl.mask = stable ? std::min<std::uint32_t>(sl.mask * 2 + 1, 1023) : pol_.sample_mask;
      if (pl.explore) s.explore_every = stable ? std::min<std::uint32_t>(s.explore_every * 2, 4096) : 64;
      after_sample(s, pl.o, pl.kind);
    });
  }

  template <auto Ord, class Tup, class Sink>
  void run_scan(const Tup& ps, std::size_t limit, Sink& sink) {
    ++ctr_.scans;
    const bool timed = pol_.adaptive && size_ >= pol_.small_size;
    const std::uint64_t t0 = timed ? pol_.now() : 0;
    std::size_t n = 0;
    for (id i = 0; i < items_.size(); ++i) {
      if (!live_[i] || !accept(ps, i)) continue;
      ++n;
      if (!sink(i) || n >= limit) break;
    }
    if (timed) charge_scan<Ord>(ps, double(pol_.now() - t0), true);
  }

  // Charge the scan to one field: the first eq predicate, else the first
  // range predicate, else the order field. Build when the charged time passes
  // the estimated cost of building the first kind that serves that op. A walk
  // that filtered badly is charged the same way (`measured_scan` false): it
  // skips the order field, which the walk already uses.
  template <auto Ord, class Tup> void charge_scan(const Tup& ps, double ns, bool measured_scan) {
    bool charged = false;
    auto charge = [&](auto& s, op want) {
      using S = std::decay_t<decltype(s)>;
      if (charged) return;
      std::size_t first = S::nk;
      for (std::size_t j = S::nk; j-- > 0;)
        if (S::caps[j][std::size_t(want)]) first = j;
      if (first == S::nk) return;
      charged = true;
      const std::size_t o = std::size_t(want);
      if (measured_scan) {
        s.scan_cost[o] = s.scan_size[o] ? 0.8 * s.scan_cost[o] + 0.2 * ns : ns;
        s.scan_size[o] = size_;
      }
      s.scan_spent[o] += ns;
      std::uint8_t penalty = 0;
      s.visit(first, [&](auto& sl) { penalty = sl.penalty; });
      if (s.scan_spent[o] >= est_build_ns(s, first) * pol_.eagerness * s.eager_mult[o] * double(1u << penalty) && budget_allows()) {
        s.each_k([&](std::size_t, auto& sl) { sl.tried = false; });
        s.visit(first, [&](auto& sl) { build<S>(s, sl); });
        s.scan_spent[o] = 0;
      }
    };
    for (op want : {op::eq, op::range})
      std::apply([&](const auto&... p) {
        ((p.kind == want && (measured_scan || !same_member<std::decay_t<decltype(p)>::member, Ord>())
              ? charge(state_of<std::decay_t<decltype(p)>::member>(), want) : void()), ...);
      }, ps);
    if constexpr (!std::is_null_pointer_v<decltype(Ord)>) { if (measured_scan) charge(state_of<Ord>(), op::range); }
  }

  // The whole pipeline of a query, ordering included.
  template <auto Ord, class Tup, class Sink>
  void run_query(const Tup& ps, bool desc, std::size_t limit, Sink& sink) {
    tick_ops();
    const detail::plan pl = choose<Ord>(ps);
    if constexpr (std::is_null_pointer_v<decltype(Ord)>) {
      exec<Ord>(ps, pl, false, limit, sink);
    } else {
      if (pl.how == detail::plan::access::walk) {
        exec<Ord>(ps, pl, desc, limit, sink);
        return;
      }
      std::vector<id> buf;
      auto collect = [&](id i) { buf.push_back(i); return true; };
      exec<Ord>(ps, pl, false, npos, collect);
      auto cmp = [&](id a, id b) {
        const auto& x = items_[a].*Ord;
        const auto& y = items_[b].*Ord;
        if (x < y) return !desc;
        if (y < x) return desc;
        return desc ? b < a : a < b; // descending is the exact reverse of ascending
      };
      const std::size_t k = std::min(limit, buf.size());
      if (k < buf.size()) std::partial_sort(buf.begin(), buf.begin() + static_cast<std::ptrdiff_t>(k), buf.end(), cmp);
      else std::sort(buf.begin(), buf.end(), cmp);
      for (std::size_t i = 0; i < k; ++i)
        if (!sink(buf[i])) break;
    }
  }

  template <auto Ord, class Tup> std::string explain_query(const Tup& ps, bool desc, std::size_t limit) {
    using detail::plan;
    const plan pl = choose<Ord>(ps);
    std::string out;
    auto kind_name = [&](std::size_t f, int k) {
      std::string_view r = "?";
      [&]<std::size_t... F>(std::index_sequence<F...>) {
        ((F == f ? std::get<F>(fs_).visit(std::size_t(k), [&](auto& sl) { r = std::decay_t<decltype(sl.idx)>::name; }) : void()), ...);
      }(std::make_index_sequence<n_fields>{});
      return std::string(r);
    };
    auto field_of = [&](const auto& p) { return field_name(index_of<std::decay_t<decltype(p)>::member>()); };
    if (pl.how == detail::plan::access::scan) {
      out = "scan " + std::to_string(size_) + " elements";
    } else if (pl.how == detail::plan::access::probe) {
      visit_pred(ps, pl.pred, [&](const auto& p) {
        const std::size_t f = index_of<std::decay_t<decltype(p)>::member>();
        out = "probe " + kind_name(f, pl.kind) + " index on " + field_of(p) + (pl.o == op::eq ? " (equality)" : " (range)");
      });
    } else {
      if constexpr (!std::is_null_pointer_v<decltype(Ord)>)
        out = std::string("walk ") + kind_name(index_of<Ord>(), pl.kind) + " index on " + field_name(index_of<Ord>()) + (desc ? " descending" : " ascending");
    }
    constexpr std::size_t np = std::tuple_size_v<Tup>;
    if (np > 0) out += ", filter " + std::to_string(np) + " predicate" + (np > 1 ? "s" : "");
    if constexpr (!std::is_null_pointer_v<decltype(Ord)>)
      if (pl.how != detail::plan::access::walk) out += std::string(", sort by ") + field_name(index_of<Ord>()) + (desc ? " descending" : " ascending");
    if (limit != npos) out += ", limit " + std::to_string(limit);
    return out;
  }

  // A reusable buffer for sampled probes. A nested query gets its own.
  struct scratch_guard {
    multiview& m;
    std::vector<id> local;
    std::vector<id>* buf;
    bool owner;
    explicit scratch_guard(multiview& mm) : m(mm), owner(!mm.scratch_busy_) {
      if (owner) { m.scratch_busy_ = true; m.scratch_.clear(); buf = &m.scratch_; }
      else buf = &local;
    }
    ~scratch_guard() { if (owner) m.scratch_busy_ = false; }
  };
  std::vector<id> scratch_;
  bool scratch_busy_ = false;
  volatile std::size_t repeat_sink_ = 0; // keeps repeated probes from being optimized away

  std::vector<T> items_;
  std::vector<std::uint8_t> live_;
  std::vector<id> free_;
  std::size_t size_ = 0;
  states_t fs_;
  policy pol_;
  counters ctr_;
  std::uint64_t ops_ = 0; // queries and writes so far: the clock for idleness
  std::array<std::string_view, n_fields> names_{member_name<Fs::member>()...};
};

/// One line to declare a table: every listed member may be queried, and the
/// container picks a hash or an ordered index for it on demand.
///   mv::indexed<User, &User::id, &User::city, &User::age> users;
template <class T, auto... Ms> using indexed = multiview<T, fld<Ms>...>;
/// The same, with every built-in kind available to the planner.
template <class T, auto... Ms> using indexed_all = multiview<T, fld_all<Ms>...>;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/// A lazy query over a multiview. Copyable and cheap; holds the predicates and
/// a reference to the container, so it must not outlive it.
template <class MV, class Tup, auto Ord = nullptr> class query {
  static constexpr bool ordered = !std::is_null_pointer_v<decltype(Ord)>;

public:
  query(MV& mv, Tup ps) : mv_(&mv), ps_(std::move(ps)) {}

  /// Return at most n results.
  query limit(std::size_t n) const { auto q = *this; q.limit_ = n; return q; }

  /// order_by(col<&T::f>, descending): the same, with the field as a value.
  template <auto F> auto order_by(col_t<F>, bool descending = false) const { return order_by<F>(descending); }

  /// Return results sorted by a field. Equal keys come by ascending id, or by
  /// descending id when `descending`. With limit(), the planner
  /// may walk an ordered index and stop early.
  template <auto F> auto order_by(bool descending = false) const {
    query<MV, Tup, F> q(*mv_, ps_);
    q.limit_ = limit_;
    q.desc_ = descending;
    return q;
  }

  /// Call fn(id) per result; fn may return false to stop.
  template <class Fn> void for_each(Fn&& fn) const {
    auto sink = [&](id i) {
      if constexpr (std::is_convertible_v<std::invoke_result_t<Fn&, id>, bool>) return static_cast<bool>(fn(i));
      else { fn(i); return true; }
    };
    mv_->template run_query<Ord>(ps_, desc_, limit_, sink);
  }
  std::vector<id> ids() const {
    std::vector<id> out;
    for_each([&](id i) { out.push_back(i); });
    return out;
  }
  /// The results as elements: for (const User& u : users.where(...).rows()).
  auto rows() const {
    struct view {
      const MV* mv;
      std::vector<id> v;
      struct iterator {
        const MV* mv; const id* p;
        const typename MV::value_type& operator*() const { return (*mv)[*p]; }
        iterator& operator++() { ++p; return *this; }
        bool operator==(const iterator& o) const { return p == o.p; }
      };
      iterator begin() const { return {mv, v.data()}; }
      iterator end() const { return {mv, v.data() + v.size()}; }
      std::size_t size() const { return v.size(); }
    };
    return view{mv_, ids()};
  }
  std::optional<id> first() const {
    std::optional<id> r;
    limit(1).for_each([&](id i) { r = i; });
    return r;
  }
  bool exists() const { return first().has_value(); }
  std::size_t count() const {
    std::size_t n = 0;
    for_each([&](id) { ++n; });
    return n;
  }
  /// Erase every result. Returns how many.
  std::size_t erase() const {
    const auto v = ids();
    for (id i : v) mv_->erase(i);
    return v.size();
  }
  /// Apply fn(T&) to every result through modify(). Returns how many.
  template <class Fn> std::size_t update(Fn&& fn) const {
    const auto v = ids();
    for (id i : v) mv_->modify(i, fn);
    return v.size();
  }
  /// The plan the query would use now, as text.
  std::string explain() const { return mv_->template explain_query<Ord>(ps_, desc_, limit_); }

private:
  template <class, class, auto> friend class query;
  MV* mv_;
  Tup ps_;
  std::size_t limit_ = npos;
  bool desc_ = false;
};

} // namespace mv
