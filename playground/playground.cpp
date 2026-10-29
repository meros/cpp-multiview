// WebAssembly side of the playground. One table of orders, six copies that
// receive the same operations:
//   adaptive         the container choosing its own indexes (all built-in kinds allowed)
//   scan only        no index
//   grouped only     a grouped hash on every field, built once
//   sorted only      an ordered index on every field, built once
//   grouped + sorted both on every field, built once
//   yours            the kinds you pick per field, built once
// The page drives it two ways: pg_run (a workload mix) and pg_exec (an op list
// compiled from a script). State comes back as JSON from pg_json.
#include "multiview.hpp"

#include <emscripten/emscripten.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <memory>
#include <random>
#include <string>

namespace {

struct Row {
  std::uint64_t customer = 0, amount = 0, day = 0;
};

// Kind order within every field, the order of fld_all: grouped, swiss, dense, ordered, sorted-array, hash.
using MV = mv::multiview<Row, mv::fld_all<&Row::customer>, mv::fld_all<&Row::amount>, mv::fld_all<&Row::day>>;
constexpr int kFields = 3, kKinds = 6;

constexpr int kTypes = 7;
constexpr const char* kNames[kTypes] = {
    "customer = ?", "amount in range", "top 10 by amount", "customer = ? and amount >= ?",
    "day = ?", "update amount", "insert and delete",
};

std::uint64_t now_ns() { return static_cast<std::uint64_t>(emscripten_get_now() * 1e6); }

struct Params {
  std::uint64_t a = 0, b = 0;
  std::size_t row = 0;
  Row fresh;
};

// One copy of the table. Frozen copies build their indexes once and never change them.
struct Variant {
  const char* name;
  std::unique_ptr<MV> c;
  std::vector<mv::id> ids;
  std::array<double, kTypes> ms{};
  double total_ms = 0;
};

constexpr int kVariants = 6;
constexpr int kAdaptive = 0, kScan = 1, kCustom = 5;

struct State {
  std::array<Variant, kVariants> v;
  std::mt19937_64 rng{1};
  std::size_t n = 0;
  std::uint64_t customers = 1;
  mv::policy pol;
  std::array<std::size_t, kTypes> ops{};
  std::size_t batch_ops = 0;
  std::uint64_t batches = 0;
  std::array<int, kFields> custom_mask{0, 0, 0};
} S;

std::string g_json;

mv::policy make_policy(bool adaptive) {
  mv::policy p = S.pol;
  p.adaptive = adaptive;
  p.now = &now_ns;
  p.min_sample_ns = 50'000; // browser clocks are coarse; see policy::min_sample_ns
  return p;
}

void freeze(MV& c, const std::array<int, kFields>& mask) {
  for (int f = 0; f < kFields; ++f)
    for (int k = 0; k < kKinds; ++k)
      if (mask[f] >> k & 1) c.build_index_at(std::size_t(f), std::size_t(k));
}

// ---- the weighted workload (pg_run) ----------------------------------------

std::size_t run_op(MV& c, int type, const Params& p, std::vector<mv::id>& ids) {
  switch (type) {
    case 0: return c.where(mv::eq<&Row::customer>(p.a)).count();
    case 1: return c.where(mv::between<&Row::amount>(p.a, p.b)).count();
    case 2: {
      std::size_t s = 0;
      c.all().order_by<&Row::amount>(true).limit(10).for_each([&](mv::id i) { s += c[i].amount; });
      return s;
    }
    case 3: return c.where(mv::eq<&Row::customer>(p.a), mv::ge<&Row::amount>(p.b)).count();
    case 4: return c.where(mv::eq<&Row::day>(p.a)).count();
    case 5: c.modify(ids[p.row], [&](Row& r) { r.amount = p.b; }); return 1;
    default: {
      c.erase(ids[p.row]);
      ids[p.row] = c.insert(p.fresh);
      return 1;
    }
  }
}

std::uint64_t pick_key(double skew, std::uint64_t k) {
  std::uniform_real_distribution<double> u(0, 1);
  const double x = std::pow(u(S.rng), 1.0 + 4.0 * skew);
  return std::min<std::uint64_t>(k - 1, static_cast<std::uint64_t>(x * double(k)));
}

// ---- the compiled script (pg_exec) ------------------------------------------
//
// An op is 16 doubles:
//   0 opcode: 0 query, 1 update amount, 2 churn (erase a row, insert a fresh one)
//   query:  1 label, 2 npreds, 3 fieldA, 4 opA, 5 aLo, 6 aHi, 7 fieldB, 8 opB, 9 bLo, 10 bHi,
//           11 order field (-1 none), 12 descending, 13 limit (0 none), 14 terminal
//   update: 1 label, 2 row, 3 new amount
//   churn:  1 label, 2 row, 3 customer, 4 amount, 5 day
// Predicate ops: 0 eq, 1 ge, 2 le, 3 between, 4 gt, 5 lt. Terminals: 0 count,
// 1 exists, 2 first, 3 sum of amount. Fields: 0 customer, 1 amount, 2 day.
constexpr int kOpSize = 16;

struct QOp {
  int npreds, fa, opa, fb, opb, order, desc, terminal;
  double alo, ahi, blo, bhi;
  std::size_t limit;
};

template <auto M> mv::pred<M> mk(int opc, double lo, double hi) {
  using V = mv::value_t<M>;
  const V a = static_cast<V>(std::max(lo, 0.0)), b = static_cast<V>(std::max(hi, 0.0));
  switch (opc) {
    case 0: return mv::eq<M>(a);
    case 1: return mv::ge<M>(a);
    case 2: return mv::le<M>(a);
    case 3: return mv::between<M>(a, b);
    case 4: return mv::gt<M>(a);
    default: return mv::lt<M>(a);
  }
}

// Terminal operations. Comparable results only: "first" without an order has
// no defined answer, so it reports whether there is one.
template <class Q> std::uint64_t terminal(Q q, const QOp& o, MV& c) {
  if (o.limit) q = q.limit(o.limit);
  switch (o.terminal) {
    case 0: return q.count();
    case 1: return q.exists() ? 1 : 0;
    case 2: {
      const auto f = q.first();
      return o.order >= 0 ? (f ? std::uint64_t(*f) + 1 : 0) : (f ? 1 : 0);
    }
    default: {
      std::uint64_t s = 0;
      q.for_each([&](mv::id i) { s += c[i].amount; });
      return o.order >= 0 || !o.limit ? s : 0; // a limit without an order picks arbitrary rows
    }
  }
}

template <class Q> std::uint64_t ordered(Q q, const QOp& o, MV& c) {
  switch (o.order) {
    case 0: return terminal(q.template order_by<&Row::customer>(o.desc != 0), o, c);
    case 1: return terminal(q.template order_by<&Row::amount>(o.desc != 0), o, c);
    case 2: return terminal(q.template order_by<&Row::day>(o.desc != 0), o, c);
    default: return terminal(q, o, c);
  }
}

// Runs a query, or returns its plan (explain != nullptr).
std::uint64_t dispatch(MV& c, const QOp& o, std::string* explain) {
  auto go = [&](auto q) -> std::uint64_t {
    if (!explain) return ordered(q, o, c);
    auto text = [&](auto qq) { *explain = qq.explain(); };
    switch (o.order) {
      case 0: text(q.template order_by<&Row::customer>(o.desc != 0)); break;
      case 1: text(q.template order_by<&Row::amount>(o.desc != 0)); break;
      case 2: text(q.template order_by<&Row::day>(o.desc != 0)); break;
      default: text(q);
    }
    return 0;
  };
  if (o.npreds == 0) return go(c.all());
  const int fa = o.fa;
  if (o.npreds == 1) {
    switch (fa) {
      case 0: return go(c.where(mk<&Row::customer>(o.opa, o.alo, o.ahi)));
      case 1: return go(c.where(mk<&Row::amount>(o.opa, o.alo, o.ahi)));
      default: return go(c.where(mk<&Row::day>(o.opa, o.alo, o.ahi)));
    }
  }
  // Two predicates on different fields. Canonical pair order.
  const int lo_f = std::min(o.fa, o.fb), hi_f = std::max(o.fa, o.fb);
  const bool swap = o.fa > o.fb;
  const int op1 = swap ? o.opb : o.opa, op2 = swap ? o.opa : o.opb;
  const double l1 = swap ? o.blo : o.alo, h1 = swap ? o.bhi : o.ahi;
  const double l2 = swap ? o.alo : o.blo, h2 = swap ? o.ahi : o.bhi;
  if (lo_f == 0 && hi_f == 1) return go(c.where(mk<&Row::customer>(op1, l1, h1), mk<&Row::amount>(op2, l2, h2)));
  if (lo_f == 0 && hi_f == 2) return go(c.where(mk<&Row::customer>(op1, l1, h1), mk<&Row::day>(op2, l2, h2)));
  return go(c.where(mk<&Row::amount>(op1, l1, h1), mk<&Row::day>(op2, l2, h2)));
}

QOp decode(const double* r) {
  QOp o{};
  o.npreds = int(r[2]); o.fa = int(r[3]); o.opa = int(r[4]); o.alo = r[5]; o.ahi = r[6];
  o.fb = int(r[7]); o.opb = int(r[8]); o.blo = r[9]; o.bhi = r[10];
  o.order = int(r[11]); o.desc = int(r[12]); o.limit = static_cast<std::size_t>(r[13]); o.terminal = int(r[14]);
  return o;
}

// ---- JSON ----------------------------------------------------------------------

void append_kv(std::string& o, const char* k, double v) {
  char buf[64];
  std::snprintf(buf, sizeof buf, "\"%s\":%.6g", k, v);
  o += buf;
}

std::string esc(const std::string& s) {
  std::string o;
  for (char c : s) { if (c == '"' || c == '\\') o += '\\'; o += c; }
  return o;
}

void write_json() {
  std::string& o = g_json;
  o.clear();
  o += "{";
  append_kv(o, "n", double(S.n)); o += ",";
  append_kv(o, "batches", double(S.batches)); o += ",";
  append_kv(o, "batch_ops", double(S.batch_ops)); o += ",";
  append_kv(o, "prior_build_ns", S.pol.prior_build_ns); o += ",";
  append_kv(o, "rent", S.pol.rent_ns_per_byte_op); o += ",\"types\":[";
  for (int t = 0; t < kTypes; ++t) {
    if (t) o += ",";
    o += "{\"name\":\""; o += kNames[t]; o += "\","; append_kv(o, "ops", double(S.ops[t])); o += "}";
  }
  o += "],\"variants\":[";
  for (int k = 0; k < kVariants; ++k) {
    const Variant& v = S.v[k];
    if (k) o += ",";
    o += "{\"name\":\""; o += v.name; o += "\",";
    append_kv(o, "ns", S.batch_ops ? v.total_ms * 1e6 / double(S.batch_ops) : 0); o += ",";
    append_kv(o, "bytes", double(v.c->index_bytes())); o += ",\"types\":[";
    for (int t = 0; t < kTypes; ++t) {
      if (t) o += ",";
      char buf[48];
      std::snprintf(buf, sizeof buf, "%.6g", S.ops[t] ? v.ms[t] * 1e6 / double(S.ops[t]) : 0.0);
      o += buf;
    }
    o += "]}";
  }
  o += "],\"indexes\":[";
  auto& a = *S.v[kAdaptive].c;
  bool first = true;
  for (const auto& i : a.indexes()) {
    if (!first) o += ",";
    first = false;
    o += "{\"field\":\""; o += i.field_name; o += "\",\"kind\":\""; o += std::string(i.kind); o += "\",";
    o += i.live ? "\"live\":true," : "\"live\":false,";
    append_kv(o, "probe_ns", i.probe_ns); o += ",";
    append_kv(o, "build_ms", i.build_ms); o += ",";
    append_kv(o, "uses", double(i.uses)); o += ",";
    append_kv(o, "bytes", double(i.bytes));
    o += "}";
  }
  const auto& c = a.stats();
  o += "],\"counters\":{";
  append_kv(o, "scans", double(c.scans)); o += ",";
  append_kv(o, "probes", double(c.probes)); o += ",";
  append_kv(o, "walks", double(c.walks)); o += ",";
  append_kv(o, "builds", double(c.builds)); o += ",";
  append_kv(o, "drops", double(c.drops)); o += ",";
  append_kv(o, "rent_drops", double(c.rent_drops)); o += ",";
  append_kv(o, "trials", double(c.trials));
  o += "},\"plans\":[";
  const std::string plans[kTypes - 2] = {
      a.where(mv::eq<&Row::customer>(0)).explain(),
      a.where(mv::between<&Row::amount>(0, 1)).explain(),
      a.all().order_by<&Row::amount>(true).limit(10).explain(),
      a.where(mv::eq<&Row::customer>(0), mv::ge<&Row::amount>(0)).explain(),
      a.where(mv::eq<&Row::day>(0)).explain(),
  };
  for (int t = 0; t < kTypes - 2; ++t) {
    if (t) o += ",";
    o += "{\"name\":\""; o += kNames[t]; o += "\",\"plan\":\""; o += esc(plans[t]); o += "\"}";
  }
  o += "]}";
}

std::string g_exec_json;
int g_mask = (1 << kVariants) - 1; // copies that pg_exec runs; pg_reset leaves it alone

// Index changes on copy 0 during one pg_exec. The caller compares four
// integers of stats() after each op and calls emit_events only when one moved.
struct Watch {
  std::vector<mv::index_info> snap;
  mv::counters prev;
  std::string events;
  std::size_t count = 0;
};

void emit_event(Watch& w, int op, const char* type, const char* reason, const mv::index_info& i, double build_ms,
                std::size_t bytes, double probe_ns, std::uint64_t uses, std::string_view other, double t_ms) {
  if (w.count++) w.events += ",";
  std::string& o = w.events;
  o += "{\"op\":" + std::to_string(op) + ",\"type\":\"" + type + "\",\"reason\":\"" + reason + "\",\"field\":\"" +
       i.field_name + "\",\"kind\":\"" + std::string(i.kind) + "\",";
  append_kv(o, "build_ms", build_ms); o += ",";
  append_kv(o, "bytes", double(bytes)); o += ",";
  append_kv(o, "probe_ns", probe_ns); o += ",";
  append_kv(o, "uses", double(uses)); o += ",\"other\":\"" + std::string(other) + "\",";
  append_kv(o, "t_ms", t_ms);
  o += "}";
}

void emit_events(Watch& w, MV& c, int op, bool is_write, double t_start) {
  const mv::counters now = c.stats();
  const std::vector<mv::index_info> cur = c.indexes();
  const double t_ms = emscripten_get_now() - t_start;
  const bool rent = now.rent_drops > w.prev.rent_drops, trial = now.trials > w.prev.trials;
  auto other_live = [&](const mv::index_info& i) -> std::string_view {
    for (const auto& j : cur)
      if (j.field == i.field && j.kind != i.kind && j.live) return j.kind;
    return {};
  };
  for (std::size_t q = 0; q < cur.size() && q < w.snap.size(); ++q) {
    const auto &b = w.snap[q], &a = cur[q];
    if (a.live && (!b.live || a.build_ms != b.build_ms)) {
      const std::string_view other = other_live(a);
      emit_event(w, op, trial && !b.live && !other.empty() ? "trial" : "build", "", a, a.build_ms, a.bytes, 0, 0, other, t_ms);
    } else if (b.live && !a.live) {
      const std::string_view other = other_live(b);
      const char* why = rent ? (other.empty() ? "rent" : "twin") : is_write ? "writes" : "slower";
      emit_event(w, op, "drop", why, b, b.build_ms, b.bytes, b.probe_ns, b.uses, other, t_ms);
    } else if (!b.live && !a.live && a.build_ms != b.build_ms) {
      emit_event(w, op, "drop", "unfit", a, a.build_ms, 0, 0, 0, {}, t_ms); // built and dropped in the same op
    }
  }
  w.snap = cur;
  w.prev = now;
}
// The answer of every op of the last pg_exec, per copy, in the order the ops were given.
std::array<std::vector<double>, kVariants> g_results;

} // namespace

extern "C" {

// Build all copies with n rows. custom0..2 are bit masks of kinds per field for
// the "yours" copy (bit 0 grouped, 1 swiss, 2 dense, 3 ordered, 4 sorted-array, 5 hash).
EMSCRIPTEN_KEEPALIVE void pg_reset(int n, int seed, double eagerness, int max_index_kb, double rent, int custom0, int custom1, int custom2) {
  S.n = std::max(n, 1);
  S.rng.seed(static_cast<std::uint64_t>(seed));
  S.customers = std::max<std::uint64_t>(10, S.n / 20);
  S.pol = mv::policy{};
  S.pol.eagerness = eagerness;
  S.pol.rent_ns_per_byte_op = rent;
  S.pol.max_index_bytes = static_cast<std::size_t>(std::max(max_index_kb, 0)) * 1024;
  S.custom_mask = {custom0, custom1, custom2};

  const char* names[kVariants] = {"adaptive", "scan only", "grouped only", "sorted only", "grouped and sorted", "yours"};
  for (int k = 0; k < kVariants; ++k) {
    S.v[k].name = names[k];
    S.v[k].c = std::make_unique<MV>(make_policy(k == kAdaptive));
    S.v[k].c->reserve(S.n);
    S.v[k].ids.clear();
    S.v[k].ids.reserve(S.n);
    S.v[k].ms = {};
    S.v[k].total_ms = 0;
  }
  std::uniform_int_distribution<std::uint64_t> amount(0, 99'999), day(0, 364);
  for (std::size_t i = 0; i < S.n; ++i) {
    Row r{pick_key(0, S.customers), amount(S.rng), day(S.rng)};
    for (auto& v : S.v) v.ids.push_back(v.c->insert(r));
  }
  freeze(*S.v[2].c, {1, 1, 1});    // grouped on every field
  freeze(*S.v[3].c, {8, 8, 8});    // ordered on every field
  freeze(*S.v[4].c, {9, 9, 9});    // grouped and ordered
  freeze(*S.v[kCustom].c, S.custom_mask);
  S.ops = {};
  S.batch_ops = 0;
  S.batches = 0;
  write_json();
}

// Run `ops` operations split by the weights w[0..6], same stream on every copy.
EMSCRIPTEN_KEEPALIVE void pg_run(int ops, const double* w, double skew) {
  if (!S.v[0].c) return;
  double sum = 0;
  for (int t = 0; t < kTypes; ++t) sum += std::max(w[t], 0.0);
  if (sum <= 0) return;

  std::array<std::size_t, kTypes> count{};
  for (int t = 0; t < kTypes; ++t) count[t] = static_cast<std::size_t>(std::llround(ops * std::max(w[t], 0.0) / sum));
  std::array<int, kTypes> order;
  for (int t = 0; t < kTypes; ++t) order[t] = t;
  std::shuffle(order.begin(), order.end(), S.rng);

  S.ops = {};
  S.batch_ops = 0;
  for (auto& v : S.v) { v.ms = {}; v.total_ms = 0; }
  volatile std::size_t sink = 0;
  std::uniform_int_distribution<std::uint64_t> amount(0, 99'999), day(0, 364);

  for (int t : order) {
    const std::size_t k = count[t];
    if (!k) continue;
    std::vector<Params> ps(k);
    for (auto& p : ps) {
      p.row = S.rng() % S.n;
      switch (t) {
        case 0: p.a = pick_key(skew, S.customers); break;
        case 1: p.a = amount(S.rng); p.b = p.a + 200; break;
        case 3: p.a = pick_key(skew, S.customers); p.b = amount(S.rng); break;
        case 4: p.a = day(S.rng); break;
        case 5: p.b = amount(S.rng); break;
        case 6: p.fresh = Row{pick_key(0, S.customers), amount(S.rng), day(S.rng)}; break;
        default: break;
      }
    }
    for (auto& v : S.v) {
      const double t0 = emscripten_get_now();
      for (const auto& p : ps) sink = sink + run_op(*v.c, t, p, v.ids);
      const double dt = emscripten_get_now() - t0;
      v.ms[t] = dt;
      v.total_ms += dt;
    }
    S.ops[t] = k;
    S.batch_ops += k;
  }
  ++S.batches;
  write_json();
}

// Run a compiled script: `n` ops of 16 doubles at `ops`. Ops are timed in
// groups by label (order within a label is kept), once per copy. Result:
// per-copy time per op and per label, and whether every copy gave the same
// answers.
EMSCRIPTEN_KEEPALIVE void pg_exec(const double* ops, int n, int n_labels) {
  if (!S.v[0].c) return;
  // Stable order by label.
  std::vector<int> idx(static_cast<std::size_t>(n));
  for (int i = 0; i < n; ++i) idx[std::size_t(i)] = i;
  std::stable_sort(idx.begin(), idx.end(), [&](int a, int b) { return ops[a * kOpSize + 1] < ops[b * kOpSize + 1]; });

  std::array<std::vector<std::uint64_t>, kVariants> results;
  std::array<std::vector<double>, kVariants> label_ms;
  std::array<std::vector<std::size_t>, kVariants> label_ops;
  std::array<double, kVariants> total_ms{};
  for (int k = 0; k < kVariants; ++k) {
    results[k].assign(std::size_t(n), 0);
    label_ms[k].assign(std::size_t(n_labels), 0);
    label_ops[k].assign(std::size_t(n_labels), 0);
  }
  Watch watch;
  std::vector<int> ran;
  for (int k = 0; k < kVariants; ++k) {
    if (!(g_mask >> k & 1)) continue;
    ran.push_back(k);
    Variant& v = S.v[k];
    const bool watching = k == kAdaptive;
    const double t_start = emscripten_get_now();
    if (watching) {
      watch.snap = v.c->indexes();
      watch.prev = v.c->stats();
    }
    std::size_t i = 0;
    while (i < idx.size()) {
      const int label = int(ops[idx[i] * kOpSize + 1]);
      std::size_t j = i;
      while (j < idx.size() && int(ops[idx[j] * kOpSize + 1]) == label) ++j;
      const double t0 = emscripten_get_now();
      for (std::size_t q = i; q < j; ++q) {
        const double* r = ops + idx[q] * kOpSize;
        std::uint64_t res = 0;
        switch (int(r[0])) {
          case 0: res = dispatch(*v.c, decode(r), nullptr); break;
          case 1: {
            const std::size_t row = static_cast<std::size_t>(r[2]) % v.ids.size();
            v.c->modify(v.ids[row], [&](Row& x) { x.amount = static_cast<std::uint64_t>(std::max(r[3], 0.0)); });
            res = 1;
            break;
          }
          default: {
            const std::size_t row = static_cast<std::size_t>(r[2]) % v.ids.size();
            v.c->erase(v.ids[row]);
            v.ids[row] = v.c->insert(Row{static_cast<std::uint64_t>(r[3]), static_cast<std::uint64_t>(r[4]), static_cast<std::uint64_t>(r[5])});
            res = 1;
          }
        }
        results[k][std::size_t(idx[q])] = res;
        if (watching) {
          const mv::counters& st = v.c->stats();
          if (st.builds != watch.prev.builds || st.drops != watch.prev.drops || st.rent_drops != watch.prev.rent_drops ||
              st.trials != watch.prev.trials)
            emit_events(watch, *v.c, idx[q], r[0] != 0, t_start);
        }
      }
      const double dt = emscripten_get_now() - t0;
      if (label >= 0 && label < n_labels) { label_ms[k][std::size_t(label)] += dt; label_ops[k][std::size_t(label)] += j - i; }
      total_ms[k] += dt;
      i = j;
    }
  }
  for (int k = 0; k < kVariants; ++k) {
    g_results[k].assign(results[k].begin(), results[k].end());
  }
  // Same answers everywhere?
  int bad = -1;
  for (int q = 0; q < n && bad < 0; ++q)
    for (std::size_t m = 1; m < ran.size(); ++m)
      if (results[std::size_t(ran[m])][std::size_t(q)] != results[std::size_t(ran[0])][std::size_t(q)]) { bad = q; break; }

  std::string& o = g_exec_json;
  o = "{";
  append_kv(o, "ops", n); o += ",";
  append_kv(o, "first_disagreement", bad); o += ",\"variants\":[";
  bool first_v = true;
  for (int k : ran) {
    if (!first_v) o += ",";
    first_v = false;
    o += "{"; append_kv(o, "id", k); o += ",\"name\":\""; o += S.v[k].name; o += "\",";
    append_kv(o, "ns", n ? total_ms[k] * 1e6 / n : 0); o += ",";
    append_kv(o, "bytes", double(S.v[k].c->index_bytes())); o += ",\"labels\":[";
    for (int l = 0; l < n_labels; ++l) {
      if (l) o += ",";
      char buf[48];
      std::snprintf(buf, sizeof buf, "%.6g", label_ops[k][std::size_t(l)] ? label_ms[k][std::size_t(l)] * 1e6 / double(label_ops[k][std::size_t(l)]) : 0.0);
      o += buf;
    }
    o += "]}";
  }
  o += "],\"events\":[" + watch.events + "]}";
  S.batches += 1;
  write_json();
}

// Which copies pg_exec runs: bit k for copy k, all six by default. Skipped copies
// give zero answers and no timings, and are left out of the agreement check.
EMSCRIPTEN_KEEPALIVE void pg_set_copies(int mask) { g_mask = mask & ((1 << kVariants) - 1); }

// Customer, amount and day of row `id` in the adaptive copy; zeros if the table no longer has it.
EMSCRIPTEN_KEEPALIVE const double* pg_row(int id) {
  static double r[3];
  r[0] = r[1] = r[2] = 0;
  if (S.v[kAdaptive].c && id >= 0 && S.v[kAdaptive].c->contains(mv::id(id))) {
    const Row& x = (*S.v[kAdaptive].c)[mv::id(id)];
    r[0] = double(x.customer); r[1] = double(x.amount); r[2] = double(x.day);
  }
  return r;
}

// The adaptive copy's plan for one compiled query op.
EMSCRIPTEN_KEEPALIVE const char* pg_explain(const double* op_record) {
  static std::string text;
  text.clear();
  dispatch(*S.v[kAdaptive].c, decode(op_record), &text);
  return text.c_str();
}

EMSCRIPTEN_KEEPALIVE const char* pg_json() { return g_json.c_str(); }
EMSCRIPTEN_KEEPALIVE const char* pg_exec_json() { return g_exec_json.c_str(); }

// The answer of every op of the last pg_exec for one copy: a query gives its
// count, 1 or 0 for exists, or the first id plus one; a write gives 1.
// Read `n` doubles from the returned address (HEAPF64).
EMSCRIPTEN_KEEPALIVE const double* pg_results(int variant) {
  return variant >= 0 && variant < kVariants ? g_results[variant].data() : nullptr;
}

}
