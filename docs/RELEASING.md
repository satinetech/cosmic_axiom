# Releasing

A release is a git tag of the form `vMAJOR.MINOR.PATCH`. Pushing one runs
`.github/workflows/release.yml`, which publishes a GitHub release with notes
taken from the matching section of `CHANGELOG.md`.

## Why a tag, and not a branch or a commit

A tag is immutable and a branch is not. Anything downstream that pins this
project -- a deployment, a build script, a report that records which version
produced it -- needs a reference that still means the same thing in six months.
A branch head moves. A commit SHA does not move, but it can become unreachable
and be garbage collected if the branch it was on is rewritten or deleted, which
is exactly what happens to a fork's integration branch.

## Cutting one

1. Move the entries under `## [Unreleased]` in `CHANGELOG.md` into a new
   `## [X.Y.Z] - YYYY-MM-DD` section, leaving `[Unreleased]` empty.
2. Commit that on the default branch.
3. Tag and push:

   ```
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

The workflow refuses the tag if the changelog has no matching section, so step 1
cannot be skipped.

To check a version before committing to it, run the workflow manually from the
Actions tab with the version as input: it validates the tag format and the
changelog section and publishes nothing.

## Choosing the number

Semantic versioning, from the point of view of someone deploying this:

- **Major** -- a deployment that upgrades without reading the notes will break.
  A migration that is not backwards compatible, a required environment variable
  with no default, an endpoint that changes shape.
- **Minor** -- new capability, nothing existing breaks.
- **Patch** -- fixes only.

## What the version is not

The `version` fields in the seven `services/*/package.json` files and in
`frontend/package.json` are not maintained per release. They are all `1.0.0`
(and `0.0.0`) regardless of what has shipped. The tag is the version of this
repository; do not read those fields as one, and do not assume bumping them
releases anything.
