// Index kinds for multiview, and the contract a kind must satisfy.
//
// A kind stores (key, id) pairs and answers probes. The container owns the
// policy: it builds, probes, times, compares and drops kinds. To inject your
// own structure, write a class template `template <class V> class my_kind`
// that satisfies `index_kind` and list it in a `field_decl`. To configure or
// rename a built-in kind, derive from it:
//
//   template <class V> struct small_tree : mv::ordered_index<V, 64> {
//     static constexpr std::string_view name = "tree-64";
//   };
//
// Kinds in this file:
//   grouped_index      one slot per distinct key, ids in pooled lists: the default for equality
//   swiss_index        one slot per (key, id), 8-byte tag groups, high load
//   hash_index         flat hash, linear probing, low load: latency-first on unique keys
//   dense_index        direct address for small integer domains: fastest of all
//   ordered_index      chunked sorted array (a B+tree of height two): ranges, order
//   sorted_array_index one sorted array plus a small delta and a bucket hint:
//                      the leanest ordered kind, best when writes are rare
#pragma once

#include <algorithm>
#include <array>
#include <bit>
#include <concepts>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <functional>
#include <limits>
#include <string>
#include <string_view>
#include <type_traits>
#include <utility>
#include <vector>

namespace mv {

/// Slot number of an element. Stable until the element is erased. After an
/// erase the slot can be reused by a later insert.
using id = std::uint32_t;

inline constexpr std::size_t npos = std::numeric_limits<std::size_t>::max();

/// What an index must answer: equality, or a (possibly open) range.
enum class op : std::uint8_t { eq = 0, range = 1 };
inline constexpr std::size_t n_ops = 2;

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

namespace detail {
inline constexpr std::uint64_t kGolden = 0x9E3779B97F4A7C15ull;

inline std::uint64_t hash_bytes(const char* p, std::size_t n) {
  std::uint64_t h = 0x243F6A8885A308D3ull ^ (n * kGolden);
  while (n >= 8) {
    std::uint64_t w;
    std::memcpy(&w, p, 8);
    h = (h ^ w) * 0xFF51AFD7ED558CCDull;
    h ^= h >> 32;
    p += 8;
    n -= 8;
  }
  if (n) {
    std::uint64_t w = 0;
    std::memcpy(&w, p, n);
    h = (h ^ w) * 0xC4CEB9FE1A85EC53ull;
    h ^= h >> 29;
  }
  return h * kGolden;
}
} // namespace detail

/// Maps a key to 64 bits whose HIGH bits are well mixed (the tables use them).
/// Integers cost one multiply. Strings hash eight bytes per step. Anything
/// else goes through std::hash. Specialize it, or pass your own functor, for
/// other key types.
template <class V> struct default_hash {
  std::uint64_t operator()(const V& v) const { return std::hash<V>{}(v) * detail::kGolden; }
};
template <class V> requires(std::is_integral_v<V> || std::is_enum_v<V>)
struct default_hash<V> {
  std::uint64_t operator()(const V& v) const { return static_cast<std::uint64_t>(v) * detail::kGolden; }
};
template <class V> requires std::is_floating_point_v<V>
struct default_hash<V> {
  std::uint64_t operator()(V v) const {
    if (v == 0) v = 0; // -0.0 equals 0.0
    std::uint64_t b = 0;
    std::memcpy(&b, &v, std::min(sizeof v, sizeof b));
    return b * detail::kGolden;
  }
};
template <> struct default_hash<std::string> {
  std::uint64_t operator()(const std::string& s) const { return detail::hash_bytes(s.data(), s.size()); }
};
template <> struct default_hash<std::string_view> {
  std::uint64_t operator()(std::string_view s) const { return detail::hash_bytes(s.data(), s.size()); }
};

// ---------------------------------------------------------------------------
// hash_index
// ---------------------------------------------------------------------------

/// Open-addressing hash table, linear probing, a tag byte per slot. `LoadPct`
/// is the largest fill in percent: lower is faster and larger. Answers
/// equality only. Many equal keys form long chains; the container then
/// measures it and prefers another kind.
template <class V, class Hash = default_hash<V>, unsigned LoadPct = 50> class hash_index {
public:
  static constexpr std::string_view name = "hash";
  static constexpr bool supports(op o) { return o == op::eq; }

  void add(const V& k, id v) {
    if ((used_ + tomb_ + 1) * 100 > cap_ * LoadPct)
      rehash(used_ * 2 * 100 >= cap_ * LoadPct ? std::max<std::size_t>(cap_ * 2, 16) : std::max<std::size_t>(cap_, 16));
    const std::uint64_t h = Hash{}(k);
    std::size_t i = h >> shift_;
    while (c_[i] >= 0x80) i = (i + 1) & (cap_ - 1);
    if (c_[i] == 1) --tomb_;
    c_[i] = tag(h);
    e_[i] = entry{k, v};
    ++used_;
  }
  void remove(const V& k, id v) {
    if (!used_) return;
    const std::uint64_t h = Hash{}(k);
    const std::uint8_t t = tag(h);
    for (std::size_t i = h >> shift_; c_[i] != 0; i = (i + 1) & (cap_ - 1)) {
      if (c_[i] == t && e_[i].val == v && e_[i].key == k) {
        c_[i] = 1; ++tomb_; --used_;
        return;
      }
    }
  }
  /// Calls fn(id) for each id whose key equals *lo. fn returns false to stop.
  template <class Fn> bool probe(const V* lo, const V*, bool, Fn&& fn) const {
    if (!used_) return true;
    const std::uint64_t h = Hash{}(*lo);
    const std::uint8_t t = tag(h);
    for (std::size_t i = h >> shift_; c_[i] != 0; i = (i + 1) & (cap_ - 1))
      if (c_[i] == t && e_[i].key == *lo && !fn(e_[i].val)) return false;
    return true;
  }
  void clear() { e_.clear(); e_.shrink_to_fit(); c_.clear(); c_.shrink_to_fit(); cap_ = used_ = tomb_ = 0; shift_ = 64; }
  void reserve(std::size_t n) {
    std::size_t want = 16;
    while (want * LoadPct < n * 100) want *= 2;
    if (want > cap_) rehash(want);
  }
  std::size_t bytes() const { return cap_ * (sizeof(entry) + 1); }

private:
  struct entry { V key{}; id val{}; };
  static std::uint8_t tag(std::uint64_t h) { return static_cast<std::uint8_t>(0x80 | ((h >> 8) & 0x7f)); }

  void rehash(std::size_t new_cap) {
    std::vector<entry> oe = std::move(e_);
    std::vector<std::uint8_t> oc = std::move(c_);
    cap_ = new_cap;
    shift_ = 64 - static_cast<unsigned>(std::countr_zero(cap_));
    e_.assign(cap_, entry{});
    c_.assign(cap_, 0);
    used_ = tomb_ = 0;
    for (std::size_t j = 0; j < oe.size(); ++j) {
      if (oc[j] < 0x80) continue;
      const std::uint64_t h = Hash{}(oe[j].key);
      std::size_t i = h >> shift_;
      while (c_[i] != 0) i = (i + 1) & (cap_ - 1);
      c_[i] = tag(h);
      e_[i] = std::move(oe[j]);
      ++used_;
    }
  }

  std::vector<entry> e_;
  std::vector<std::uint8_t> c_; // 0 empty, 1 deleted, 0x80|tag full
  std::size_t cap_ = 0, used_ = 0, tomb_ = 0;
  unsigned shift_ = 64;
};

// ---------------------------------------------------------------------------
// swiss_index
// ---------------------------------------------------------------------------

/// Hash table in groups of eight slots with one control byte each (Swiss
/// table layout, eight-byte groups so it needs no SIMD). A probe matches a
/// whole group of tags with a few integer operations. It runs at up to 87 %
/// load, so it holds the same keys in about half the memory of hash_index, and
/// it degrades gently when many keys are equal. `LoadEighths` is the largest
/// fill in eighths (7 = 87.5 %): lower is faster and larger.
template <class V, class Hash = default_hash<V>, unsigned LoadEighths = 7> class swiss_index {
public:
  static constexpr std::string_view name = "swiss";
  static constexpr bool supports(op o) { return o == op::eq; }

  void add(const V& k, id v) {
    if ((used_ + tomb_ + 1) * 8 > cap_ * LoadEighths) rehash(used_ * 2 >= cap_ ? std::max<std::size_t>(cap_ * 2, 16) : std::max<std::size_t>(cap_, 16));
    const std::uint64_t h = Hash{}(k);
    const std::uint8_t t = tag(h);
    std::size_t g = h >> shift_, stride = 0;
    for (;;) {
      const std::uint64_t grp = load(g);
      if (const std::uint64_t avail = grp & kHigh) { // empty or deleted
        const std::size_t i = g * 8 + (static_cast<std::size_t>(std::countr_zero(avail)) >> 3);
        if (c_[i] == kDeleted) --tomb_;
        c_[i] = t;
        e_[i] = entry{k, v};
        ++used_;
        return;
      }
      g = (g + ++stride) & gmask_;
    }
  }
  void remove(const V& k, id v) {
    if (!used_) return;
    const std::uint64_t h = Hash{}(k);
    const std::uint8_t t = tag(h);
    std::size_t g = h >> shift_, stride = 0;
    for (;;) {
      const std::uint64_t grp = load(g);
      for (std::uint64_t m = match(grp, t); m; m &= m - 1) {
        const std::size_t i = g * 8 + (static_cast<std::size_t>(std::countr_zero(m)) >> 3);
        if (e_[i].val == v && e_[i].key == k) {
          if (empties(grp)) c_[i] = kEmpty; else { c_[i] = kDeleted; ++tomb_; }
          --used_;
          return;
        }
      }
      if (empties(grp)) return;
      g = (g + ++stride) & gmask_;
    }
  }
  template <class Fn> bool probe(const V* lo, const V*, bool, Fn&& fn) const {
    if (!used_) return true;
    const std::uint64_t h = Hash{}(*lo);
    const std::uint8_t t = tag(h);
    std::size_t g = h >> shift_, stride = 0;
    for (;;) {
      const std::uint64_t grp = load(g);
      for (std::uint64_t m = match(grp, t); m; m &= m - 1) {
        const std::size_t i = g * 8 + (static_cast<std::size_t>(std::countr_zero(m)) >> 3);
        if (e_[i].key == *lo && !fn(e_[i].val)) return false;
      }
      if (empties(grp)) return true;
      g = (g + ++stride) & gmask_;
    }
  }
  void clear() { e_.clear(); e_.shrink_to_fit(); c_.clear(); c_.shrink_to_fit(); cap_ = used_ = tomb_ = 0; }
  void reserve(std::size_t n) {
    std::size_t want = 16;
    while (want * LoadEighths < n * 8) want *= 2;
    if (want > cap_) rehash(want);
  }
  std::size_t bytes() const { return cap_ * (sizeof(entry) + 1); }

private:
  struct entry { V key{}; id val{}; };
  static constexpr std::uint8_t kEmpty = 0x80, kDeleted = 0xFE;
  static constexpr std::uint64_t kLow = 0x0101010101010101ull, kHigh = 0x8080808080808080ull;

  // The tag uses the 7 bits just below the group-index bits of the hash.
  std::uint8_t tag(std::uint64_t h) const { return static_cast<std::uint8_t>((h >> (shift_ - 7)) & 0x7f); }
  std::uint64_t load(std::size_t g) const { std::uint64_t x; std::memcpy(&x, &c_[g * 8], 8); return x; }
  // Bytes equal to t (may report a false positive next to a true match; callers verify the key).
  static std::uint64_t match(std::uint64_t grp, std::uint8_t t) {
    const std::uint64_t x = grp ^ (kLow * t);
    return (x - kLow) & ~x & kHigh;
  }
  static std::uint64_t empties(std::uint64_t grp) { return grp & ~(grp << 6) & kHigh; }

  void rehash(std::size_t new_cap) {
    std::vector<entry> oe = std::move(e_);
    std::vector<std::uint8_t> oc = std::move(c_);
    cap_ = new_cap;
    gmask_ = cap_ / 8 - 1;
    shift_ = 64 - static_cast<unsigned>(std::countr_zero(cap_ / 8));
    e_.assign(cap_, entry{});
    c_.assign(cap_, kEmpty);
    used_ = tomb_ = 0;
    for (std::size_t j = 0; j < oe.size(); ++j) {
      if (oc[j] & 0x80) continue;
      add(oe[j].key, oe[j].val);
    }
  }

  std::vector<entry> e_;
  std::vector<std::uint8_t> c_;
  std::size_t cap_ = 0, used_ = 0, tomb_ = 0, gmask_ = 0;
  unsigned shift_ = 64;
};

// ---------------------------------------------------------------------------
// grouped_index
// ---------------------------------------------------------------------------

/// A Swiss-layout table with one slot per DISTINCT key. A slot holds the first
/// two ids inline; more ids live in a pooled block (sizes 4, 8, 16, ...) that
/// the slot points to. Each key is stored once however many ids it has, so it
/// is the leanest kind when keys repeat (4 or more ids per key) and when keys
/// are long strings, and a probe walks one contiguous id list. With mostly
/// unique keys it costs a little more than `swiss`. Removing an id scans that
/// key's list, so a key with tens of thousands of ids is slow to change.
/// Ids come back in no particular order.
template <class V, class Hash = default_hash<V>, unsigned LoadEighths = 7> class grouped_index {
public:
  static constexpr std::string_view name = "grouped";
  static constexpr bool supports(op o) { return o == op::eq; }

  void add(const V& k, id v) {
    if (const std::size_t i = find(k); i != kNone) { append(e_[i], v); return; }
    if ((used_ + tomb_ + 1) * 8 > cap_ * LoadEighths) rehash(used_ * 2 >= cap_ ? std::max<std::size_t>(cap_ * 2, 16) : std::max<std::size_t>(cap_, 16));
    place(k, entry{V{}, 1, v, 0}, true);
  }
  void remove(const V& k, id v) {
    const std::size_t i = find(k);
    if (i == kNone) return;
    entry& e = e_[i];
    if (e.n <= 2) {
      if (e.n == 2) {
        if (e.a == v) e.a = e.b; else if (e.b != v) return;
        e.n = 1;
      } else {
        if (e.a != v) return;
        erase_slot(i);
      }
      return;
    }
    id* ids = &pool_[e.a];
    std::uint32_t j = 0;
    while (j < e.n && ids[j] != v) ++j;
    if (j == e.n) return;
    ids[j] = ids[e.n - 1];
    if (--e.n == 2) {
      const id x = ids[0], y = ids[1];
      release(e.a, e.b);
      e.a = x; e.b = y;
    }
  }
  template <class Fn> bool probe(const V* lo, const V*, bool, Fn&& fn) const {
    if (!used_) return true;
    const std::size_t i = find(*lo);
    if (i == kNone) return true;
    const entry& e = e_[i];
    if (e.n == 1) return fn(e.a);
    if (e.n == 2) return fn(e.a) && fn(e.b);
    const id* ids = &pool_[e.a];
    for (std::uint32_t j = 0; j < e.n; ++j)
      if (!fn(ids[j])) return false;
    return true;
  }
  void clear() {
    e_.clear(); e_.shrink_to_fit(); c_.clear(); c_.shrink_to_fit();
    pool_.clear(); pool_.shrink_to_fit();
    for (auto& f : free_) f.clear();
    cap_ = used_ = tomb_ = 0;
  }
  void reserve(std::size_t) {}
  std::size_t bytes() const {
    std::size_t b = cap_ * (sizeof(entry) + 1) + pool_.capacity() * sizeof(id);
    for (const auto& f : free_) b += f.capacity() * sizeof(std::uint32_t);
    return b;
  }

private:
  struct entry { V key{}; std::uint32_t n = 0, a = 0, b = 0; }; // n <= 2: ids in a, b. n > 2: a = pool offset, b = size class
  static constexpr std::size_t kNone = ~std::size_t{0};
  static constexpr std::uint8_t kEmpty = 0x80, kDeleted = 0xFE;
  static constexpr std::uint64_t kLow = 0x0101010101010101ull, kHigh = 0x8080808080808080ull;
  static constexpr std::size_t kClasses = 28;

  std::uint8_t tag(std::uint64_t h) const { return static_cast<std::uint8_t>((h >> (shift_ - 7)) & 0x7f); }
  std::uint64_t load(std::size_t g) const { std::uint64_t x; std::memcpy(&x, &c_[g * 8], 8); return x; }
  static std::uint64_t match(std::uint64_t grp, std::uint8_t t) {
    const std::uint64_t x = grp ^ (kLow * t);
    return (x - kLow) & ~x & kHigh;
  }
  static std::uint64_t empties(std::uint64_t grp) { return grp & ~(grp << 6) & kHigh; }

  std::size_t find(const V& k) const {
    if (!used_) return kNone;
    const std::uint64_t h = Hash{}(k);
    const std::uint8_t t = tag(h);
    std::size_t g = h >> shift_, stride = 0;
    for (;;) {
      const std::uint64_t grp = load(g);
      for (std::uint64_t m = match(grp, t); m; m &= m - 1) {
        const std::size_t i = g * 8 + (static_cast<std::size_t>(std::countr_zero(m)) >> 3);
        if (e_[i].key == k) return i;
      }
      if (empties(grp)) return kNone;
      g = (g + ++stride) & gmask_;
    }
  }
  // Put a new distinct key. With `set_key`, the key comes from `k`; otherwise `en` already holds it.
  void place(const V& k, entry en, bool set_key) {
    const std::uint64_t h = Hash{}(set_key ? k : en.key);
    const std::uint8_t t = tag(h);
    std::size_t g = h >> shift_, stride = 0;
    for (;;) {
      const std::uint64_t grp = load(g);
      if (const std::uint64_t avail = grp & kHigh) {
        const std::size_t i = g * 8 + (static_cast<std::size_t>(std::countr_zero(avail)) >> 3);
        if (c_[i] == kDeleted) --tomb_;
        c_[i] = t;
        if (set_key) en.key = k;
        e_[i] = std::move(en);
        ++used_;
        return;
      }
      g = (g + ++stride) & gmask_;
    }
  }
  void erase_slot(std::size_t i) {
    const std::uint64_t grp = load(i / 8);
    if (empties(grp)) c_[i] = kEmpty; else { c_[i] = kDeleted; ++tomb_; }
    e_[i] = entry{};
    --used_;
  }
  std::uint32_t alloc(std::uint32_t cls) {
    if (!free_[cls].empty()) { const std::uint32_t o = free_[cls].back(); free_[cls].pop_back(); return o; }
    const std::size_t o = pool_.size();
    pool_.resize(o + (std::size_t{4} << cls));
    return static_cast<std::uint32_t>(o);
  }
  void release(std::uint32_t off, std::uint32_t cls) { free_[cls].push_back(off); }
  void append(entry& e, id v) {
    if (e.n == 1) { e.b = v; e.n = 2; return; }
    if (e.n == 2) {
      const std::uint32_t off = alloc(0);
      pool_[off] = e.a; pool_[off + 1] = e.b; pool_[off + 2] = v;
      e.a = off; e.b = 0; e.n = 3;
      return;
    }
    if (e.n == (std::uint32_t{4} << e.b)) { // block full: move to the next size
      const std::uint32_t off = alloc(e.b + 1);
      std::copy_n(pool_.begin() + e.a, e.n, pool_.begin() + off);
      release(e.a, e.b);
      e.a = off; ++e.b;
    }
    pool_[e.a + e.n++] = v;
  }
  void rehash(std::size_t new_cap) {
    std::vector<entry> oe = std::move(e_);
    std::vector<std::uint8_t> oc = std::move(c_);
    cap_ = new_cap;
    gmask_ = cap_ / 8 - 1;
    shift_ = 64 - static_cast<unsigned>(std::countr_zero(cap_ / 8));
    e_.assign(cap_, entry{});
    c_.assign(cap_, kEmpty);
    used_ = tomb_ = 0;
    for (std::size_t j = 0; j < oe.size(); ++j) {
      if (oc[j] & 0x80) continue;
      place(oe[j].key, std::move(oe[j]), false);
    }
  }

  std::vector<entry> e_;
  std::vector<std::uint8_t> c_;
  std::vector<id> pool_;
  std::array<std::vector<std::uint32_t>, kClasses> free_;
  std::size_t cap_ = 0, used_ = 0, tomb_ = 0, gmask_ = 0;
  unsigned shift_ = 64;
};

// ---------------------------------------------------------------------------
// dense_index
// ---------------------------------------------------------------------------

/// Direct-address table for integer keys in a small range (days, enums, small
/// ids, flags): a probe is one array access. If the keys spread too wide the
/// kind reports `usable() == false` and the container drops it. Answers
/// equality only, and only for integer keys. `MaxSpan` is the widest key range
/// it accepts; it also refuses a range over 8 x the element count + 1024.
template <class V, std::uint64_t MaxSpan = (1u << 20)> class dense_index {
  static constexpr bool kOk = std::is_integral_v<V> && sizeof(V) <= 8;

public:
  static constexpr std::string_view name = "dense";
  static constexpr bool supports(op o) { return kOk && o == op::eq; }
  /// false once the keys no longer fit a small direct-address table.
  bool usable() const { return !broken_; }

  void add(const V& k, id v) {
    if constexpr (kOk) {
      if (broken_) return;
      if (b_.empty()) { base_ = k; b_.resize(1); }
      if (k < base_) {
        const std::uint64_t grow = static_cast<std::uint64_t>(base_) - static_cast<std::uint64_t>(k);
        if (b_.size() + grow > MaxSpan) { broken_ = true; return; }
        b_.insert(b_.begin(), static_cast<std::size_t>(grow), std::vector<id>{});
        base_ = k;
      }
      const std::uint64_t off = static_cast<std::uint64_t>(k) - static_cast<std::uint64_t>(base_);
      if (off >= MaxSpan) { broken_ = true; return; }
      if (off >= b_.size()) b_.resize(static_cast<std::size_t>(off) + 1);
      b_[static_cast<std::size_t>(off)].push_back(v);
    }
  }
  void remove(const V& k, id v) {
    if constexpr (kOk) {
      if (broken_ || b_.empty() || k < base_) return;
      const std::uint64_t off = static_cast<std::uint64_t>(k) - static_cast<std::uint64_t>(base_);
      if (off >= b_.size()) return;
      auto& bucket = b_[static_cast<std::size_t>(off)];
      const auto it = std::find(bucket.begin(), bucket.end(), v);
      if (it == bucket.end()) return;
      *it = bucket.back();
      bucket.pop_back();
    }
  }
  /// Bulk build. Refuses (usable() becomes false) if the keys are too spread.
  void assign(std::vector<std::pair<V, id>>&& all) {
    clear();
    if constexpr (kOk) {
      if (all.empty()) return;
      V lo = all[0].first, hi = all[0].first;
      for (const auto& p : all) { lo = std::min(lo, p.first); hi = std::max(hi, p.first); }
      const std::uint64_t span = static_cast<std::uint64_t>(hi) - static_cast<std::uint64_t>(lo) + 1;
      if (span > MaxSpan || span > 8 * all.size() + 1024) { broken_ = true; return; }
      base_ = lo;
      std::vector<std::uint32_t> count(static_cast<std::size_t>(span), 0);
      for (const auto& p : all) ++count[static_cast<std::size_t>(static_cast<std::uint64_t>(p.first) - static_cast<std::uint64_t>(lo))];
      b_.resize(static_cast<std::size_t>(span));
      for (std::size_t i = 0; i < b_.size(); ++i) b_[i].reserve(count[i]);
      for (const auto& p : all) b_[static_cast<std::size_t>(static_cast<std::uint64_t>(p.first) - static_cast<std::uint64_t>(lo))].push_back(p.second);
    }
  }
  template <class Fn> bool probe(const V* lo, const V*, bool, Fn&& fn) const {
    if constexpr (kOk) {
      if (b_.empty() || *lo < base_) return true;
      const std::uint64_t off = static_cast<std::uint64_t>(*lo) - static_cast<std::uint64_t>(base_);
      if (off >= b_.size()) return true;
      for (id v : b_[static_cast<std::size_t>(off)])
        if (!fn(v)) return false;
    }
    return true;
  }
  void clear() { b_.clear(); b_.shrink_to_fit(); broken_ = false; }
  void reserve(std::size_t) {}
  std::size_t bytes() const {
    std::size_t n = b_.capacity() * sizeof(std::vector<id>);
    for (const auto& x : b_) n += x.capacity() * sizeof(id);
    return n;
  }

private:
  std::vector<std::vector<id>> b_;
  V base_{};
  bool broken_ = false;
};

// ---------------------------------------------------------------------------
// ordered_index
// ---------------------------------------------------------------------------

/// Ordered index: a sorted sequence of chunks of up to 2 x `Chunk` entries (a
/// flat B+tree of height two). Answers equality and ranges in both directions.
/// Entries sort by (key, id). Keys and ids are stored apart, so a search reads
/// only keys, and the last (key, id) of every chunk sits in one contiguous
/// array, so the search over chunks does not chase a pointer per step.
template <class V, std::size_t Chunk = 256> class ordered_index {
public:
  static constexpr std::string_view name = "ordered";
  static constexpr bool supports(op) { return true; }

  void add(const V& k, id v) {
    if (ch_.empty()) {
      ch_.emplace_back();
      ch_.back().k.reserve(Chunk * 2);
      ch_.back().v.reserve(Chunk * 2);
      ch_.back().k.push_back(k);
      ch_.back().v.push_back(v);
      maxk_.push_back(k);
      maxv_.push_back(v);
      return;
    }
    std::size_t c = chunk_ge(k, v);
    if (c == ch_.size()) c = ch_.size() - 1;
    auto& ch = ch_[c];
    const std::size_t i = pos_ge(ch, k, v);
    ch.k.insert(ch.k.begin() + static_cast<std::ptrdiff_t>(i), k);
    ch.v.insert(ch.v.begin() + static_cast<std::ptrdiff_t>(i), v);
    if (i + 1 == ch.k.size()) { maxk_[c] = k; maxv_[c] = v; }
    if (ch.k.size() > 2 * Chunk) split(c);
  }
  void remove(const V& k, id v) {
    const std::size_t c = chunk_ge(k, v);
    if (c == ch_.size()) return;
    auto& ch = ch_[c];
    const std::size_t i = pos_ge(ch, k, v);
    if (i == ch.k.size() || ch.v[i] != v || k < ch.k[i] || ch.k[i] < k) return;
    ch.k.erase(ch.k.begin() + static_cast<std::ptrdiff_t>(i));
    ch.v.erase(ch.v.begin() + static_cast<std::ptrdiff_t>(i));
    if (ch.k.empty()) {
      ch_.erase(ch_.begin() + static_cast<std::ptrdiff_t>(c));
      maxk_.erase(maxk_.begin() + static_cast<std::ptrdiff_t>(c));
      maxv_.erase(maxv_.begin() + static_cast<std::ptrdiff_t>(c));
    } else if (i == ch.k.size()) {
      maxk_[c] = ch.k.back();
      maxv_[c] = ch.v.back();
    }
  }
  /// Bulk load, much faster than repeated add().
  void assign(std::vector<std::pair<V, id>>&& all) {
    std::sort(all.begin(), all.end(), [](const auto& a, const auto& b) { return lt(a.first, a.second, b.first, b.second); });
    clear();
    for (std::size_t i = 0; i < all.size(); i += Chunk) {
      auto& ch = ch_.emplace_back();
      const std::size_t e = std::min(i + Chunk, all.size());
      ch.k.reserve(Chunk * 2);
      ch.v.reserve(Chunk * 2);
      for (std::size_t j = i; j < e; ++j) { ch.k.push_back(std::move(all[j].first)); ch.v.push_back(all[j].second); }
      maxk_.push_back(ch.k.back());
      maxv_.push_back(ch.v.back());
    }
  }
  /// Calls fn(id) for each id with *lo <= key <= *hi (null = open), ascending,
  /// or descending when `desc`. fn returns false to stop.
  template <class Fn> bool probe(const V* lo, const V* hi, bool desc, Fn&& fn) const {
    return desc ? walk_desc(lo, hi, fn) : walk_asc(lo, hi, fn);
  }
  void clear() { ch_.clear(); ch_.shrink_to_fit(); maxk_.clear(); maxk_.shrink_to_fit(); maxv_.clear(); maxv_.shrink_to_fit(); }
  void reserve(std::size_t) {}
  std::size_t bytes() const {
    std::size_t b = ch_.capacity() * sizeof(chunk) + maxk_.capacity() * sizeof(V) + maxv_.capacity() * sizeof(id);
    for (const auto& c : ch_) b += c.k.capacity() * sizeof(V) + c.v.capacity() * sizeof(id);
    return b;
  }

private:
  struct chunk { std::vector<V> k; std::vector<id> v; };

  static bool lt(const V& ka, id ia, const V& kb, id ib) { return ka < kb || (!(kb < ka) && ia < ib); }

  // First chunk whose last entry is >= (k, v).
  std::size_t chunk_ge(const V& k, id v) const {
    std::size_t a = 0, b = maxk_.size();
    while (a < b) {
      const std::size_t m = (a + b) / 2;
      if (lt(maxk_[m], maxv_[m], k, v)) a = m + 1; else b = m;
    }
    return a;
  }
  // First position in the chunk with entry >= (k, v).
  static std::size_t pos_ge(const chunk& ch, const V& k, id v) {
    std::size_t i = static_cast<std::size_t>(std::lower_bound(ch.k.begin(), ch.k.end(), k) - ch.k.begin());
    while (i < ch.k.size() && !(k < ch.k[i]) && ch.v[i] < v) ++i;
    return i;
  }
  void split(std::size_t c) {
    chunk right;
    {
      auto& ch = ch_[c];
      right.k.assign(std::make_move_iterator(ch.k.begin() + Chunk), std::make_move_iterator(ch.k.end()));
      right.v.assign(ch.v.begin() + Chunk, ch.v.end());
      right.k.reserve(Chunk * 2);
      right.v.reserve(Chunk * 2);
      ch.k.resize(Chunk);
      ch.v.resize(Chunk);
      maxk_.insert(maxk_.begin() + static_cast<std::ptrdiff_t>(c) + 1, right.k.back());
      maxv_.insert(maxv_.begin() + static_cast<std::ptrdiff_t>(c) + 1, right.v.back());
      maxk_[c] = ch.k.back();
      maxv_[c] = ch.v.back();
    }
    ch_.insert(ch_.begin() + static_cast<std::ptrdiff_t>(c) + 1, std::move(right));
  }
  template <class Fn> bool walk_asc(const V* lo, const V* hi, Fn& fn) const {
    std::size_t c = 0, pos = 0;
    if (lo) {
      std::size_t a = 0, b = maxk_.size();
      while (a < b) {
        const std::size_t m = (a + b) / 2;
        if (maxk_[m] < *lo) a = m + 1; else b = m;
      }
      if (a == ch_.size()) return true;
      c = a;
      const auto& ch = ch_[c];
      pos = static_cast<std::size_t>(std::lower_bound(ch.k.begin(), ch.k.end(), *lo) - ch.k.begin());
    }
    for (; c < ch_.size(); ++c, pos = 0) {
      const auto& ch = ch_[c];
      for (std::size_t i = pos; i < ch.k.size(); ++i) {
        if (hi && *hi < ch.k[i]) return true;
        if (!fn(ch.v[i])) return false;
      }
    }
    return true;
  }
  template <class Fn> bool walk_desc(const V* lo, const V* hi, Fn& fn) const {
    if (ch_.empty()) return true;
    std::size_t c = ch_.size() - 1, pos = ch_[c].k.size();
    if (hi) {
      std::size_t a = 0, b = maxk_.size();
      while (a < b) {
        const std::size_t m = (a + b) / 2;
        if (!(*hi < maxk_[m])) a = m + 1; else b = m;
      }
      if (a < ch_.size()) {
        c = a;
        const auto& ch = ch_[c];
        pos = static_cast<std::size_t>(std::upper_bound(ch.k.begin(), ch.k.end(), *hi) - ch.k.begin());
      }
    }
    for (;;) {
      const auto& ch = ch_[c];
      for (std::size_t i = pos; i-- > 0;) {
        if (lo && ch.k[i] < *lo) return true;
        if (!fn(ch.v[i])) return false;
      }
      if (c == 0) return true;
      pos = ch_[--c].k.size();
    }
  }

  std::vector<chunk> ch_;
  std::vector<V> maxk_;
  std::vector<id> maxv_;
};

// ---------------------------------------------------------------------------
// sorted_array_index
// ---------------------------------------------------------------------------

/// One sorted array (keys and ids apart) plus a small sorted delta of recent
/// inserts. Removals mark the array entry dead; the delta merges into the
/// array when it grows, and the array compacts when many entries are dead.
/// For numeric keys a bucket table over the key range narrows each binary
/// search to a few entries (a one-level learned index). It holds the keys in
/// the least memory of any ordered kind and probes fast, but writes cost more:
/// the container measures that and uses it when writes are rare. Tunables: the
/// delta merges into the array at `DeltaBase + n / DeltaDiv` entries (a larger
/// delta makes writes cheaper and probes slower), and the hint table has
/// n / `HintDiv` buckets (smaller = faster search, more memory).
template <class V, std::size_t DeltaBase = 256, std::size_t DeltaDiv = 256, std::size_t HintDiv = 8> class sorted_array_index {
  static constexpr bool kNumeric = std::is_arithmetic_v<V>;

public:
  static constexpr std::string_view name = "sorted-array";
  static constexpr bool supports(op) { return true; }

  void add(const V& k, id v) {
    entry e{k, v};
    delta_.insert(std::lower_bound(delta_.begin(), delta_.end(), e, less), std::move(e));
    if (delta_.size() > delta_limit()) merge();
  }
  void remove(const V& k, id v) {
    const entry e{k, v};
    // The delta first: it holds the newest copy.
    auto d = std::lower_bound(delta_.begin(), delta_.end(), e, less);
    if (d != delta_.end() && !less(e, *d)) { delta_.erase(d); return; }
    // Entries sort by (key, id), so find the id by binary search inside the key's run.
    const std::size_t lo = lower(k), hi = upper(k);
    const auto it = std::lower_bound(ids_.begin() + static_cast<std::ptrdiff_t>(lo), ids_.begin() + static_cast<std::ptrdiff_t>(hi), v);
    const std::size_t i = static_cast<std::size_t>(it - ids_.begin());
    if (i < hi && ids_[i] == v && !dead_[i]) {
      dead_[i] = 1;
      if (++ndead_ * 4 > keys_.size()) merge();
    }
  }
  void assign(std::vector<std::pair<V, id>>&& all) {
    std::sort(all.begin(), all.end(), [](const auto& a, const auto& b) {
      return a.first < b.first || (!(b.first < a.first) && a.second < b.second);
    });
    keys_.clear(); ids_.clear(); delta_.clear();
    keys_.reserve(all.size()); ids_.reserve(all.size());
    for (auto& p : all) { keys_.push_back(std::move(p.first)); ids_.push_back(p.second); }
    dead_.assign(keys_.size(), 0);
    ndead_ = 0;
    build_hint();
  }
  template <class Fn> bool probe(const V* lo, const V* hi, bool desc, Fn&& fn) const {
    // Window of the array and of the delta, then a merge of the two in order.
    std::size_t b0 = lo ? lower(*lo) : 0;
    std::size_t b1 = hi ? upper(*hi) : keys_.size();
    std::size_t d0 = lo ? static_cast<std::size_t>(std::lower_bound(delta_.begin(), delta_.end(), *lo,
                           [](const entry& e, const V& k) { return e.key < k; }) - delta_.begin()) : 0;
    std::size_t d1 = hi ? static_cast<std::size_t>(std::upper_bound(delta_.begin(), delta_.end(), *hi,
                           [](const V& k, const entry& e) { return k < e.key; }) - delta_.begin()) : delta_.size();
    if (!desc) {
      while (b0 < b1 || d0 < d1) {
        const bool take_delta = d0 < d1 && (b0 >= b1 || lt(delta_[d0].key, delta_[d0].val, keys_[b0], ids_[b0]));
        if (take_delta) { if (!fn(delta_[d0++].val)) return false; }
        else { if (!dead_[b0] && !fn(ids_[b0])) return false; ++b0; }
      }
    } else {
      while (b0 < b1 || d0 < d1) {
        const bool take_delta = d0 < d1 && (b0 >= b1 || lt(keys_[b1 - 1], ids_[b1 - 1], delta_[d1 - 1].key, delta_[d1 - 1].val));
        if (take_delta) { if (!fn(delta_[--d1].val)) return false; }
        else { --b1; if (!dead_[b1] && !fn(ids_[b1])) return false; }
      }
    }
    return true;
  }
  void clear() {
    keys_.clear(); keys_.shrink_to_fit(); ids_.clear(); ids_.shrink_to_fit(); dead_.clear();
    delta_.clear(); delta_.shrink_to_fit(); hint_.clear(); hint_.shrink_to_fit(); ndead_ = 0;
  }
  void reserve(std::size_t) {}
  std::size_t bytes() const {
    return keys_.capacity() * sizeof(V) + ids_.capacity() * sizeof(id) + dead_.capacity() +
           delta_.capacity() * sizeof(entry) + hint_.capacity() * sizeof(std::uint32_t);
  }

private:
  struct entry { V key; id val; };
  static bool lt(const V& ka, id ia, const V& kb, id ib) {
    return ka < kb || (!(kb < ka) && ia < ib);
  }
  static bool less(const entry& a, const entry& b) { return lt(a.key, a.val, b.key, b.val); }
  std::size_t delta_limit() const { return DeltaBase + keys_.size() / DeltaDiv; }

  // Bucket of a key for the hint table; monotone in the key, so the window it
  // gives always contains the true position.
  std::size_t bucket(const V& k) const {
    if constexpr (kNumeric) {
      const double x = (static_cast<double>(k) - kmin_) * scale_;
      return x <= 0 ? 0 : x >= double(hsize_ - 1) ? hsize_ - 1 : static_cast<std::size_t>(x);
    } else {
      return 0;
    }
  }
  void build_hint() {
    hint_.clear();
    if constexpr (kNumeric) {
      if (keys_.size() < 64) return;
      hsize_ = std::min<std::size_t>(std::max<std::size_t>(keys_.size() / HintDiv, 16), 1u << 20);
      kmin_ = static_cast<double>(keys_.front());
      const double range = static_cast<double>(keys_.back()) - kmin_;
      scale_ = range > 0 ? double(hsize_) / (range * (1 + 1e-12)) : 0;
      hint_.assign(hsize_ + 1, static_cast<std::uint32_t>(keys_.size()));
      std::size_t b = 0;
      for (std::size_t i = 0; i < keys_.size(); ++i) {
        const std::size_t bi = bucket(keys_[i]);
        while (b <= bi) hint_[b++] = static_cast<std::uint32_t>(i);
      }
    }
  }
  std::size_t lower(const V& k) const { // first index with key >= k
    std::size_t a = 0, b = keys_.size();
    if (!hint_.empty()) { const std::size_t g = bucket(k); a = hint_[g]; b = hint_[g + 1]; if (g + 1 == hsize_) b = keys_.size(); }
    return static_cast<std::size_t>(std::lower_bound(keys_.begin() + static_cast<std::ptrdiff_t>(a), keys_.begin() + static_cast<std::ptrdiff_t>(b), k) - keys_.begin());
  }
  std::size_t upper(const V& k) const { // first index with key > k
    std::size_t a = 0, b = keys_.size();
    if (!hint_.empty()) { const std::size_t g = bucket(k); a = hint_[g]; b = hint_[g + 1]; if (g + 1 == hsize_) b = keys_.size(); }
    return static_cast<std::size_t>(std::upper_bound(keys_.begin() + static_cast<std::ptrdiff_t>(a), keys_.begin() + static_cast<std::ptrdiff_t>(b), k) - keys_.begin());
  }
  void merge() {
    std::vector<V> nk;
    std::vector<id> ni;
    nk.reserve(keys_.size() - ndead_ + delta_.size());
    ni.reserve(nk.capacity());
    std::size_t b = 0, d = 0;
    while (b < keys_.size() || d < delta_.size()) {
      if (b < keys_.size() && dead_[b]) { ++b; continue; }
      if (d < delta_.size() && (b >= keys_.size() || lt(delta_[d].key, delta_[d].val, keys_[b], ids_[b]))) {
        nk.push_back(std::move(delta_[d].key)); ni.push_back(delta_[d].val); ++d;
      } else {
        nk.push_back(std::move(keys_[b])); ni.push_back(ids_[b]); ++b;
      }
    }
    keys_ = std::move(nk);
    ids_ = std::move(ni);
    dead_.assign(keys_.size(), 0);
    ndead_ = 0;
    delta_.clear();
    build_hint();
  }

  std::vector<V> keys_;
  std::vector<id> ids_;
  std::vector<std::uint8_t> dead_;
  std::vector<entry> delta_;
  std::vector<std::uint32_t> hint_;
  std::size_t ndead_ = 0, hsize_ = 0;
  double kmin_ = 0, scale_ = 0;
};

// ---------------------------------------------------------------------------
// The contract
// ---------------------------------------------------------------------------

/// What a kind must provide. `probe` calls fn(id) per match and stops when fn
/// returns false; it returns false if it was stopped. Optional members:
/// `assign(std::vector<std::pair<V, id>>&&)` for a fast bulk build, and
/// `usable()` for a kind that can find out it does not fit the data.
template <template <class> class K, class V>
concept index_kind = requires(K<V> i, const K<V> ci, const V& k, id x) {
  { K<V>::name } -> std::convertible_to<std::string_view>;
  { K<V>::supports(op::eq) } -> std::convertible_to<bool>;
  i.add(k, x);
  i.remove(k, x);
  i.clear();
  i.reserve(std::size_t{});
  { ci.probe(&k, &k, false, [](id) { return true; }) } -> std::convertible_to<bool>;
  { ci.bytes() } -> std::convertible_to<std::size_t>;
};

/// Checks a kind one requirement at a time, so that the compiler error names
/// the missing member instead of printing a failed concept.
template <template <class> class K, class V> consteval bool check_kind() {
  using X = K<V>;
  static_assert(requires { { X::name } -> std::convertible_to<std::string_view>; },
                "multiview index kind: add `static constexpr std::string_view name = \"...\";`");
  static_assert(requires { { X::supports(op::eq) } -> std::convertible_to<bool>; },
                "multiview index kind: add `static constexpr bool supports(mv::op) { ... }`");
  static_assert(requires(X x, const V& k, id i) { x.add(k, i); },
                "multiview index kind: add `void add(const V& key, mv::id)`");
  static_assert(requires(X x, const V& k, id i) { x.remove(k, i); },
                "multiview index kind: add `void remove(const V& key, mv::id)` (it must find the exact pair)");
  static_assert(requires(const X x, const V& k) { { x.probe(&k, &k, false, [](id) { return true; }) } -> std::convertible_to<bool>; },
                "multiview index kind: add `template <class Fn> bool probe(const V* lo, const V* hi, bool descending, Fn&& fn) const` "
                "(call fn(id) per match; stop and return false when fn returns false; a null bound is open)");
  static_assert(requires(X x) { x.clear(); },   "multiview index kind: add `void clear()`");
  static_assert(requires(X x) { x.reserve(std::size_t{}); }, "multiview index kind: add `void reserve(std::size_t)`");
  static_assert(requires(const X x) { { x.bytes() } -> std::convertible_to<std::size_t>; },
                "multiview index kind: add `std::size_t bytes() const`");
  static_assert(std::is_default_constructible_v<X>, "multiview index kind: it must be default constructible");
  return true;
}

/// A field of T and the index kinds that may serve it. The first kind that
/// supports an operation is built first for that operation; the others are
/// tried later, one at a time.
template <auto M, template <class> class... Ks> struct field_decl {
  static constexpr auto member = M;
};

// Aliases that fix the extra parameters, so a configured kind can be listed in
// a field_decl: the field decl wants `template <class> class`.
template <class V> using hash = hash_index<V>;
template <class V> using swiss = swiss_index<V>;
template <class V> using grouped = grouped_index<V>;
template <class V> using dense = dense_index<V>;
template <class V> using ordered = ordered_index<V>;
template <class V> using sorted_array = sorted_array_index<V>;

/// The default: a grouped hash for equality and an ordered index for ranges and
/// order. Both measured best in their class (bench/kinds.cpp).
template <auto M> using fld = field_decl<M, grouped, ordered>;
/// Every built-in kind may serve the field, in the order the planner tries
/// them: grouped, swiss (the other Swiss-layout table), dense (integer keys in a
/// small range), ordered, sorted-array (read-mostly, leanest), hash
/// (latency-first on unique keys).
template <auto M> using fld_all = field_decl<M, grouped, swiss, dense, ordered, sorted_array, hash>;

} // namespace mv
