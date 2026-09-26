# Changelog

All notable changes to this project are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

A release is a git tag of the form `vMAJOR.MINOR.PATCH`. Each one needs a
matching section below before it can be published -- the release workflow reads
its notes from here and fails if the section is missing, so this file cannot
quietly fall behind the tags.

The version that matters is the tag. The `version` fields in the individual
`package.json` files are not maintained per release and should not be read as
one; see `docs/RELEASING.md`.

## [Unreleased]

### Added

- Unauthenticated `/healthz` liveness endpoint and graceful SIGTERM draining in
  every service, so a container runtime can probe and stop them cleanly (#10)
- Baselined `prisma/migrations/` for astral, forge, library and singularity, so
  an existing database can be upgraded rather than recreated (#12, #13, #14,
  #15)
- A Dockerfile and `.dockerignore` for each of the seven services (#16)
- A production build and static serving for the frontend (#19)
- `docker-compose.prod.yml`, running the whole system health-gated in dependency
  order, behind an nginx edge that serves the application and the API from one
  origin (#20)
- Continuous integration, and a test harness using the built-in `node:test`
  runner (#9)

### Fixed

- astral failed to start on a stock install: its JWT keys were read from a
  working-directory-relative path built from an environment variable that
  `.env.example` never defined (#18)
- `prisma/migrations/` was listed in `.gitignore`, so `prisma migrate deploy` --
  which `infra/standup.sh` runs -- found no migrations and created no tables,
  silently, leaving a fresh install with four empty databases (#11)
- Prisma's query engine ran against a fallback OpenSSL build in the service
  images, warning on every invocation (#16)

### Removed

- Five unused copies of `tokenUtils.js`, which imported `jsonwebtoken` without
  declaring it and instantiated a Prisma client in services that have no schema
  (#17)

### Security

- Report generation routes on horizon and satellite required no authentication
  (#8)
- Removed the typo-squatted `pupeteer` dependency (#7)
