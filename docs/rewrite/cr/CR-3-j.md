# CR-3-j — two things `mapUsers` leaves to chance: identity ids and `city_id`

- **Stream:** J (ETL runner), against E1 (user domain)
- **Status:** accepted, both parts — J's follow-up carries `eb_wechat_user.id` over in `mapUsers` and adds the `knownCityIds` input filled from the target through `extras`, nulling unknown cities and counting `addressesCityCleared`
- **Affects:** `next/packages/etl/src/mappers/user.ts`,
  `next/packages/etl/src/runner.ts`

Both came out of wiring `mapUsers` into the ETL's `user` group and running the
migration twice against a synthetic dump.

## 1. `wechat_identities` rows carry no id, so a reload renumbers them

`WechatIdentityRow` has no `id`; `eb_wechat_user.id` is read and dropped. The
column is `generatedByDefaultAsIdentity`, so PostgreSQL allocates one — and the
allocation does not go back when the group's tables are emptied and reloaded.
Run the migration twice and the same identity is id 1, then id 2. The data is
identical, the ids are not, which is enough to break "load twice and compare",
the property the whole rehearsal rests on.

The runner now restarts the identity sequence after clearing a table when **no**
row in the batch brings an id, so the reload reproduces the first run's ids. That
fixes the symptom for every table in this position, and it is the right place for
it — but carrying `eb_wechat_user.id` over would be better still, for the same
reason every other table carries its legacy id: an id that survives is an id a
support ticket can quote. E1's call.

## 2. `city_id` is copied through without checking the city exists

`mapUsers` maps `cityId: legacy.city_id > 0 ? legacy.city_id : null`. `cities`
is a seeded dictionary (`packages/db/seed-data/cities.json`, extracted from the
legacy install dump, ids preserved) and `user_addresses.city_id` is a real
foreign key. A dump whose `eb_user_address.city_id` points at a city the
dictionary does not have — an operator-added row, a dictionary edited over the
years, a partially exported table — fails the insert, and because a group is one
transaction, **the whole user group rolls back**: no members, no addresses, no
labels, nothing, on the day of the cutover.

The runner already refuses to start when `cities` is empty (the operator forgot
`db:seed`), which is the common case and now has a clear message. It cannot fix
this one: only the mapper can decide what an address with an unknown city should
become.

Suggested shape, matching how the rest of the mapper already handles a missing
referent: take the known city ids as an input (`knownCityIds: ReadonlySet<number>`,
which the runner fills from the target database through `extras`, exactly as it
does for the soft dependencies), null out a `city_id` that is not in it, and
count the rows in the report — `addressesCityCleared`. The address keeps its
province/city/district text either way, so nothing a customer sees is lost.

If E1 would rather not take the input, say so and J will add it as a
`finalise` hook on `user_addresses` instead; the counting has to happen
somewhere, and silently dropping the foreign key is not an option.
