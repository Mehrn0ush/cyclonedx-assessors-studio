---
title: Upgrades
description: How to move an installation between releases, what changes between versions, and how to roll back if an upgrade goes wrong.
---

Assessors Studio follows semantic versioning. Patch releases fix defects without changing behavior. Minor releases add features without breaking existing API consumers. Major releases may introduce breaking changes, which are always documented in the release notes and are never surprises.

This page is the administrator's reference for moving an installation from one release to the next.

## Release channels

Every release is published as a tagged container image on the canonical repository. The tags in use are:

`<major>.<minor>.<patch>`. The specific release. Pin production deployments to this tag.

`<major>.<minor>`. The latest patch of the minor line. Convenient for staging or development; avoid in production so a patch release does not ship without your explicit action.

`<major>`. The latest release of the major line. Not recommended for any environment that values reproducibility.

`snapshot`. The current `main` branch, rebuilt on every commit. For CI and experimental use only.

The release notes for each version are published on the GitHub release page and are mirrored into the [Release Notes](/reference/release-notes/) section of this site.

## Before an upgrade

Read the release notes. They are short. The release notes call out anything that needs operator attention: new environment variables, changed defaults, database migrations that require a maintenance window, deprecated endpoints.

Take a fresh backup. Regardless of how routine the upgrade looks, the minutes before an upgrade are the right time to capture a backup you can restore from. Confirm the backup completed and is readable before you proceed.

Check capacity. An in place database migration consumes disk space proportional to the size of the affected tables. For a large installation, confirm that free space on the database volume is at least 20% of the current database size before starting.

Schedule the window. Patch releases rarely require downtime. Minor and major releases occasionally do, depending on whether a schema migration needs to rewrite a large table. The release notes say so explicitly when a window is needed.

## Upgrade procedure

The standard upgrade procedure for a single container deployment is:

1. Update the image tag in `docker-compose.yml` (or equivalent deployment manifest) to the new version.
2. Pull the new image: `docker compose pull`.
3. Stop the running service: `docker compose down app` (this keeps the database running if you are using the production compose file).
4. Start the new version: `docker compose up -d app`.
5. Watch the logs for the migration output.

On first start against a new version, the backend runs schema migrations automatically. Migrations are transactional where PostgreSQL supports transactional DDL; otherwise they are chunked and idempotent so an interrupted migration can be safely retried. The logs print a migration summary on completion: each migration by name, whether it ran or was skipped, and the duration.

If a migration fails, the service exits with a non zero status code and does not serve traffic. The failure is logged with the offending migration name and the reason. Diagnose, fix, and retry; do not start the new version against a half migrated database.

## Rolling back

Rollback is supported within a minor line (patch rollback). Rollback across a minor or major boundary is not supported in place; you must restore from the pre upgrade backup.

To roll back a patch:

1. Update the image tag back to the previous patch.
2. Pull the older image: `docker compose pull`.
3. Restart: `docker compose up -d app`.

The service starts against the same database. Because patch releases do not change the schema, the rollback is safe.

To roll back a minor or major upgrade:

1. Stop the service.
2. Restore the database from the backup you took before the upgrade.
3. Start the previous version of the service.

The gap between the backup and the moment of rollback is lost. If the installation accepted writes between the upgrade and the rollback, those writes are not preserved; communicate the rollback to affected users so they can re enter any critical data.

## Upgrades and the master encryption key

The master encryption key is not affected by an upgrade. The migration does not re encrypt or re wrap existing encrypted fields, and the new version's encryption code reads envelopes written by the old version without additional configuration.

If a release note explicitly calls for a KEK rotation as part of the upgrade (rare, but possible for a release that strengthens a KDF parameter), the note includes the exact rotation command to run after the upgrade completes. Always run the command in the specified order; reversing the order can leave some fields wrapped under a version the new code does not understand.

## Upgrading PostgreSQL

Assessors Studio supports PostgreSQL 17 for production installations. When a major PostgreSQL version is released, the project qualifies it and updates the recommended version in the release notes.

Upgrading PostgreSQL is a separate exercise from upgrading Assessors Studio. Use the `pg_upgrade` tool or a logical dump and restore; the application does not need to be modified. Run the upgrade during a maintenance window and take a backup immediately before.

PGlite (for evaluation installations) upgrades with the Assessors Studio container image. No operator action is required.

## Upgrading object storage

Bucket providers rarely require coordinated upgrades. An S3 provider, a MinIO cluster, or a Ceph cluster upgrades on its own cadence; the application reads and writes through the S3 API, which is stable across provider versions.

If you are migrating between providers (say, from MinIO to AWS S3), follow the migration workflow in [Evidence Storage](/administration/storage/). The migration scripts handle the copy; no Assessors Studio upgrade is needed.

## Common upgrade pitfalls

Forgetting the master key in staging. If you test an upgrade in staging with a different master key than production (or with no master key), the test does not exercise the encryption path. Use a staging master key that mirrors production's configuration, generated afresh with a staging specific value.

Using the `<major>` tag in production. A bare major tag reads whatever happens to be latest, which bypasses every gate you have in place (change review, release note reading, backup). Pin to a specific patch.

Running the new code against a database that has already been migrated by a newer version. This happens when an operator rolls back the application image but forgets to restore the database. The older application will fail to start, typically with a column or type mismatch error. Restore the pre upgrade database backup.

Skipping the release notes for a minor release. "It's just a minor release" is the phrase that leads to unread release notes, which is how surprise breaking changes happen to land. Minor releases in Assessors Studio do not break the API surface, but they sometimes add a required environment variable, change a default, or introduce a notable behavior. The release notes are short; read them.

## Long term maintenance

Run a supported release. The project provides security fixes for the current major and the previous major. Running an older major leaves the installation exposed to unpatched issues.

Stay within one minor line behind. Upgrading from a release that is many minors behind is possible but involves running several sequential upgrades to pick up each minor's migration. Staying within one minor of current keeps the upgrade path short.

Review environment variable changes on every upgrade. The release notes list new, deprecated, or removed variables. An installation that has accumulated stale variables over years is not broken, but it is harder to reason about; a periodic pass to clean up is worth the time.
