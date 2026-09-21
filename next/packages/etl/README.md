# `@shop/etl`

One-shot MySQL → PostgreSQL migration.

**Only the mappers exist so far.** A mapper is a _pure function_: legacy rows
in, new rows plus a report out. No database handles, no SQL, no clock — which
is why it can be unit-tested against literal rows copied out of
`crmeb/public/install/crmeb.sql` and needs neither Docker nor a MySQL dump.

Stream J owns the runner (connect, batch, insert, resume, reconcile). When it
lands it imports these mappers and nothing here has to change; a domain stream
that adds `src/mappers/<domain>.ts` plus its unit test is done.

Conventions for a mapper:

- exported types for the legacy row shapes, named after the legacy table;
- one `map<Domain>(rows): { …output arrays…, report }` entry point;
- **dropped rows are counted and named in the report**, never silently skipped
  — a migration that quietly loses data is worse than one that fails;
- ids are carried over unchanged, so a legacy id is still a valid id after the
  migration and support tickets that quote one still work;
- money stays a decimal string, instants become `Date`.
