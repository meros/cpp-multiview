// Declare, insert, query. No index is chosen by hand.
#include "multiview.hpp"

#include <cstdio>
#include <string>

struct User {
  std::uint64_t id;
  std::string city;
  int age;
};

int main() {
  // One line: these members may be queried. Names come from the compiler.
  mv::indexed<User, &User::id, &User::city, &User::age> users;

  const char* cities[] = {"Lund", "Malmö", "Åre", "Umeå"};
  for (std::uint64_t i = 0; i < 100000; ++i) users.insert({i, cities[i % 4], int(18 + i % 60)});

  // Fields as values: a query reads like a condition.
  constexpr auto city = mv::col<&User::city>;
  constexpr auto age = mv::col<&User::age>;
  constexpr auto uid = mv::col<&User::id>;

  std::printf("in Lund and 30 or older: %zu\n", users.where(city == "Lund" && age >= 30).count());
  std::printf("user 4242 exists:        %s\n", users.where(uid == 4242).exists() ? "yes" : "no");

  // Order and limit: the planner walks an ordered index and stops early.
  std::printf("the three oldest in Åre:\n");
  for (const User& u : users.where(city == "Åre").order_by(age, /*descending=*/true).limit(3).rows())
    std::printf("  id %llu, age %d\n", (unsigned long long)u.id, u.age);

  // Change elements through the container so the indexes follow.
  users.where(city == "Umeå" && age < 20).update([](User& u) { u.age = 20; });
  users.where(age > 70).erase();

  // A few thousand more queries, and the container has seen enough to build.
  for (std::uint64_t i = 0; i < 5000; ++i) users.where(uid == i * 7 % 100000).count();
  for (std::uint64_t i = 0; i < 5000; ++i) users.where(city == "Lund" && age >= int(18 + i % 40)).count();

  // Ask what it did, and what it built.
  std::printf("\nplan: %s\n\n", users.where(city == "Lund" && age >= 30).explain().c_str());
  std::printf("%s", users.report().c_str());
}
