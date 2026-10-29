// Watch the container adapt, and steer it with the policy.
#include "multiview.hpp"

#include <cstdio>
#include <random>

struct Order { std::uint64_t customer, amount, day; };

static void show(const char* title, mv::indexed<Order, &Order::customer, &Order::amount, &Order::day>& t) {
  std::printf("--- %s\n%s\n", title, t.report().c_str());
}

int main() {
  std::mt19937_64 rng(7);

  // The policy is an aggregate: set what you need by name.
  mv::policy p;
  p.max_index_bytes = 8 << 20;          // never hold more than 8 MB of indexes
  p.eagerness = 0.5;                    // build sooner than break-even
  p.rent_ns_per_byte_op = 2e-5;         // keep memory tighter (default 1e-5)
  mv::indexed<Order, &Order::customer, &Order::amount, &Order::day> orders(p);

  for (int i = 0; i < 100000; ++i) orders.insert({rng() % 5000, rng() % 100000, rng() % 365});
  show("loaded, no queries yet: nothing is built", orders);

  constexpr auto customer = mv::col<&Order::customer>;
  constexpr auto amount = mv::col<&Order::amount>;

  // Phase 1: customer lookups. An index appears after the scans have paid for it.
  for (int i = 0; i < 2000; ++i) orders.where(customer == rng() % 5000).count();
  show("after 2000 customer lookups", orders);

  // Phase 2: only range queries on amount. The customer index is no longer
  // used, pays rent, and goes; the amount index appears.
  for (int i = 0; i < 400000; ++i) orders.where(amount.between(1000, 1000 + i % 500)).count();
  show("after 400000 range queries on amount", orders);

  const auto& c = orders.stats();
  std::printf("builds %llu, drops %llu (of which for rent %llu), trials %llu\n",
              (unsigned long long)c.builds, (unsigned long long)c.drops,
              (unsigned long long)c.rent_drops, (unsigned long long)c.trials);

  // Know your workload? Freeze the set: no sampling, no building, no dropping.
  orders.options().adaptive = false;
  orders.build_index<&Order::customer, mv::grouped>();
}
