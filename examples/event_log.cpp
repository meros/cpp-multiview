// A sliding window of events: newest per user, a time window, slow requests,
// and expiry. Every query is a different shape; none is declared up front.
#include "multiview.hpp"

#include <cstdio>
#include <random>

struct Event { std::uint64_t ts, user, latency_ms; };

int main() {
  mv::indexed<Event, &Event::ts, &Event::user, &Event::latency_ms> log;
  constexpr auto ts = mv::col<&Event::ts>;
  constexpr auto user = mv::col<&Event::user>;
  constexpr auto latency = mv::col<&Event::latency_ms>;

  std::mt19937_64 rng(3);
  std::uint64_t now = 0;
  std::size_t expired = 0;
  for (int step = 0; step < 300000; ++step) {
    log.insert({++now, rng() % 20000, 10 + rng() % 90 + (rng() % 50 == 0 ? 2000 : 0)});
    if (step % 50 == 0) {
      // The newest 5 events of one user.
      auto last = log.where(user == rng() % 20000).order_by(ts, true).limit(5).ids();
      // How many requests in the last 1000 ticks were slow.
      auto slow = log.where(ts >= now - 1000 && latency > 1000).count();
      (void)last; (void)slow;
    }
    // Expire anything older than 50 000 ticks.
    if (step % 5000 == 4999 && now > 50000) expired += log.where(ts < now - 50000).erase();
  }
  std::printf("kept %zu events, expired %zu\n", log.size(), expired);
  std::printf("newest events of user 7: ");
  for (const Event& e : log.where(user == 7).order_by(ts, true).limit(3).rows()) std::printf("ts=%llu ", (unsigned long long)e.ts);
  std::printf("\nplan: %s\n\n%s", log.where(user == 7).order_by(ts, true).limit(3).explain().c_str(), log.report().c_str());
}
