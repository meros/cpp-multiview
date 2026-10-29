// Inject your own structure, and configure the built-in ones.
//
// A kind is a class template over the key type that meets a small contract:
// name, supports(op), add, remove, probe, clear, reserve, bytes. The container
// measures it like any other kind: it is built, tried, compared and dropped.
#include "multiview.hpp"

#include <cctype>
#include <cstdio>
#include <map>
#include <random>
#include <string>

// 1. A new structure: integer keys in buckets of 64, each bucket a small
//    sorted vector. Equality and ranges, about 40 lines.
template <class V> class bucket_index {
public:
  static constexpr std::string_view name = "buckets-64";
  static constexpr bool supports(mv::op) { return std::is_integral_v<V>; }

  void add(const V& k, mv::id v) {
    auto& b = b_[k >> 6];
    b.insert(std::lower_bound(b.begin(), b.end(), std::pair{k, v}), {k, v});
  }
  void remove(const V& k, mv::id v) {
    auto it = b_.find(k >> 6);
    if (it == b_.end()) return;
    auto& b = it->second;
    auto e = std::lower_bound(b.begin(), b.end(), std::pair{k, v});
    if (e != b.end() && *e == std::pair{k, v}) b.erase(e);
    if (b.empty()) b_.erase(it);
  }
  template <class Fn> bool probe(const V* lo, const V* hi, bool desc, Fn&& fn) const {
    auto first = lo ? b_.lower_bound(*lo >> 6) : b_.begin();
    auto last = hi ? b_.upper_bound(*hi >> 6) : b_.end();
    auto ok = [&](const std::pair<V, mv::id>& p) { return (!lo || !(p.first < *lo)) && (!hi || !(*hi < p.first)); };
    if (!desc) {
      for (auto it = first; it != last; ++it)
        for (const auto& p : it->second)
          if (ok(p) && !fn(p.second)) return false;
    } else {
      for (auto it = last; it != first;) {
        --it;
        for (auto p = it->second.rbegin(); p != it->second.rend(); ++p)
          if (ok(*p) && !fn(p->second)) return false;
      }
    }
    return true;
  }
  void clear() { b_.clear(); }
  void reserve(std::size_t) {}
  std::size_t bytes() const {
    std::size_t n = 0;
    for (const auto& [k, v] : b_) n += 48 + v.capacity() * sizeof(std::pair<V, mv::id>);
    return n;
  }

private:
  std::map<V, std::vector<std::pair<V, mv::id>>> b_;
};

// 2. Configure a built-in kind: derive, change the parameter, rename it.
template <class V> struct small_tree : mv::ordered_index<V, 64> {
  static constexpr std::string_view name = "tree-64";
};
template <class V> struct sparse_hash : mv::hash_index<V, mv::default_hash<V>, 25> {
  static constexpr std::string_view name = "hash-25%";
};

// 3. Plug in a different hash function: case-insensitive strings.
struct ci_hash {
  std::uint64_t operator()(const std::string& s) const {
    std::uint64_t h = 1469598103934665603ull;
    for (unsigned char c : s) h = (h ^ std::tolower(c)) * 1099511628211ull;
    return h * 0x9E3779B97F4A7C15ull;
  }
};
// Keys compare case-sensitively, so this only groups; the container re-checks
// equality on the element. Shown here for the hook, not as a recommendation.
template <class V> struct ci_hash_index : mv::hash_index<V, ci_hash> {
  static constexpr std::string_view name = "hash-ci";
};

struct Event { std::uint64_t ts; std::uint64_t user; std::string tag; };

int main() {
  // Every field lists the kinds the planner may use, in order of preference.
  mv::multiview<Event,
                mv::field_decl<&Event::ts, bucket_index, small_tree, mv::sorted_array>,
                mv::field_decl<&Event::user, sparse_hash, mv::swiss, mv::dense>,
                mv::field_decl<&Event::tag, ci_hash_index, mv::ordered>> events;

  std::mt19937_64 rng(1);
  for (int i = 0; i < 200000; ++i)
    events.insert({std::uint64_t(i), rng() % 5000, rng() % 2 ? "login" : "logout"});

  constexpr auto ts = mv::col<&Event::ts>;
  constexpr auto user = mv::col<&Event::user>;
  for (int i = 0; i < 4000; ++i) {
    events.where(user == rng() % 5000).count();
    events.where(ts.between(rng() % 190000, 190000 + rng() % 10000)).count();
  }
  std::printf("%s", events.report().c_str());
}
