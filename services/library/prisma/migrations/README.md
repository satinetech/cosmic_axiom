# Migrations

`0_init` is a **baseline**: it is the schema as it already stood when migrations
were introduced, not a change to it. It was generated from `schema.prisma` with

    prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script

so applying it to an empty database produces exactly the schema the datamodel
describes, with no drift.

## A new install

Nothing to do. `prisma migrate deploy` — which `infra/standup.sh` already runs —
now creates the tables, where before it found no migrations and silently created
none.

## An install that already has these tables

An existing database was built with `prisma db push` or by hand, so the tables
are there but `_prisma_migrations` has no record of them. Applying `0_init`
would fail on `CREATE TABLE`. Tell Prisma it is already applied instead:

    prisma migrate resolve --applied 0_init

This only writes a row to `_prisma_migrations`; it does not touch your data.
Run it once per database, after which `prisma migrate status` reports the
schema up to date and later migrations apply normally.
