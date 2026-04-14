---
title: Release Notes
description: Summary of changes in each snapshot of Assessors Studio, with upgrade considerations called out when relevant.
---

Assessors Studio is pre 1.0 and ships as rolling alpha snapshots. There is no tagged release yet; every build comes off the `main` branch and is published under a dated snapshot tag. This page summarizes the changes most relevant to operators following the snapshot stream. For the authoritative list of changes, see the [GitHub commit history](https://github.com/CycloneDX/cyclonedx-assessors-studio/commits/main) and `CHANGELOG.md` in the repository.

## Alpha status

Alpha means the platform is usable and under active development, but a few things you can normally rely on from a 1.0 are not yet guaranteed:

- The data model may change between snapshots. Migrations are provided when the schema moves; a migration may be one way.
- The JSON API may change without a deprecation window. Clients should pin to a specific snapshot and re verify on upgrade.
- Breaking changes are called out in the snapshot notes, but the project is not yet on a fixed cadence of compatibility.

Production use of an alpha snapshot is possible, but operators should expect to follow the snapshot stream more closely than they would a stable release.

## Versioning

The platform will adopt semantic versioning at 1.0. Until then, snapshots are tagged by date and short commit SHA.

Tags on the container image today:

- `snapshot-YYYYMMDD-<sha>` for a specific snapshot build. Pin to this in production alphas.
- `snapshot` for the most recent snapshot on `main`. Convenient for evaluation; not recommended for production pinning.
- `main` is an alias for the most recent snapshot.

At 1.0 the tagging model will shift to `<major>.<minor>.<patch>`, `<major>.<minor>`, and `<major>` alongside the snapshot tags. The 1.0 release notes will cover the transition.

## Reading the snapshot notes

Every snapshot note follows the same structure:

- Highlights. The headline features or fixes.
- Breaking changes. Anything that requires operator action. If this section is empty, the upgrade is a drop in replacement.
- Configuration changes. New environment variables, changed defaults, deprecated values.
- Database migrations. Whether the snapshot runs a schema migration, whether the migration is online (can run while serving traffic) or requires a maintenance window.
- Security fixes. CVE identifiers and affected snapshots.
- Deprecations. Features marked for removal in a future snapshot.
- Upgrade notes. Anything specific to moving to this snapshot that is not covered by the other sections.

The [Upgrades](/administration/upgrades/) page covers the mechanics of moving from one snapshot to the next; the per snapshot notes cover the content of the upgrade.

## Recent snapshots

Snapshot notes are mirrored here for convenience. The authoritative source remains the GitHub commit history and `CHANGELOG.md`.

### Unreleased

Draft notes for the next snapshot are kept in `CHANGELOG.md` in the repository until the snapshot is tagged.

## Roadmap to 1.0

The 1.0 release will declare the data model, the JSON API, and the container image interface stable. The headline capabilities targeted for 1.0 are:

- Self hosted deployment through a single container image.
- PGlite for evaluation, PostgreSQL 17 for production.
- Evidence storage in the database or in any S3 compatible object store.
- Full CDXA import and export.
- Signed attestations using JSF.
- Notification channels: webhook, email, Slack, Teams, Mattermost.
- Permission based access control with default and custom roles.
- Envelope encryption for sensitive fields with rotatable keys.
- Prometheus metrics.
- Structured JSON logging.
- OpenAPI described JSON API with a stable v1 surface.

OpenID Connect identity provider support is also on the roadmap; it may ship in 1.0 or as a post 1.0 minor release.

## Security advisories

Security fixes are published as patch releases on the current major and the previous major. Advisories are mirrored to the [GitHub security advisories](https://github.com/CycloneDX/cyclonedx-assessors-studio/security/advisories) page with CVE identifiers when applicable.

Subscribe to the repository's security advisory feed to receive a notification when a new advisory is published.

## Deprecation policy

Features are marked deprecated at least one minor release before they are removed, giving operators a full release cycle to migrate. Deprecated features log a warning at use; they remain fully functional until the removal release.

Environment variables are deprecated by marking them in the release notes and supporting both the old and new name for one minor release. The old name is removed in the release following.

## End of life

The project supports the current major release and the previous major release with security fixes. Older majors are end of life and receive no further updates. The current supported lines are published in the repository README.

When a major release reaches end of life, the release notes for the next major include an explicit call out of the end of life and a recommended upgrade path.

## Changelog

The repository's `CHANGELOG.md` is the authoritative, chronological record of changes. It is updated on every release and includes every merge that shipped in each version. Read it when you need the complete picture; read the per release notes when you are planning an upgrade.

## Reporting issues

Bugs, feature requests, and documentation gaps are tracked in [GitHub Issues](https://github.com/CycloneDX/cyclonedx-assessors-studio/issues). Security reports follow the private disclosure process documented in `SECURITY.md`; do not file security issues as public bugs.

## Contributing

The project is open source under Apache 2.0 and welcomes contributions. Read `CONTRIBUTING.md` in the repository for the workflow, the coding standards, and the areas that most need help.
