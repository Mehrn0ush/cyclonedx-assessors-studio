---
title: Backup and Recovery
description: What to back up, how often, and how to recover from data loss across both database and object storage deployments.
---

Attestations are long lived artifacts. The assessment that produced an attestation in 2026 may need to be reproducible in 2036 or later, either because a regulator wants to audit the evidence chain or because a supply chain consumer challenges a claim. The backup and recovery strategy for Assessors Studio is shaped by that horizon.

This page covers what to back up, how often, how to test a restore, and what to expect from recovery in realistic failure scenarios.

## What state exists

Assessors Studio stores its state in four places.

PostgreSQL database. The authoritative store for every record in the system: users, roles, standards, entities, assessments, claims, evidence metadata, attestations, notification rules, integrations, encryption key ledger, audit log. If you only back up one thing, back this up.

Evidence bytes. The actual content of evidence files. On installations using database storage (`STORAGE_PROVIDER=database`), evidence bytes live in the database and are covered by the database backup. On installations using object storage (`STORAGE_PROVIDER=s3`), evidence bytes live in a bucket outside the database and must be backed up separately.

Master encryption key. `MASTER_ENCRYPTION_KEY` is held in the process environment, typically injected from a secrets manager. It is not part of the database backup. A database backup is useless without the master key: encrypted fields cannot be read.

Configuration. Environment variables, compose files, reverse proxy configuration, and any other deployment artifact that shapes how the service runs. These are usually in a git repository or an infrastructure as code system and are not handled here.

## Backup topology by storage provider

Database storage. A single PostgreSQL backup covers the database and all evidence. Use `pg_dump` for logical backups (cross version compatible, slower to produce and restore), physical replication or `pg_basebackup` for physical backups (much faster to restore, bound to the PostgreSQL major version).

Object storage. Two independent backups are needed. The database carries metadata; the bucket carries evidence bytes. They must be backed up together to the same consistent moment in time for a restore to be usable. The simplest way to achieve that is to rely on immutable bucket versions (S3 versioning) and to pin a database backup to a bucket snapshot timestamp.

## Recommended cadence

Most organizations find a three tier cadence works well.

Daily snapshot. Every 24 hours, take a full database backup and (for object storage installs) a bucket versioning snapshot or replication to a backup bucket. Retain for 30 days. Daily snapshots cover the vast majority of operational restore scenarios.

Weekly archive. Every 7 days, promote one daily snapshot to a longer retention tier. Retain for 52 weeks. Weekly archives cover the scenario of a slow corruption that is not detected for weeks.

Monthly archive. Every 30 days, promote one weekly archive to an even longer retention tier. Retain for 7 years (or longer depending on the compliance horizon). Monthly archives cover the scenario of a regulator asking for a point in time restore years after the fact.

Running point in time recovery (PITR) against PostgreSQL, using write ahead log archiving, lets you skip the daily snapshot and restore to any second within the retention window. PITR is the gold standard; adopt it if you have the operational capacity.

## Backing up the master key

The master key is not part of the database backup. It must be backed up separately and with the same longevity as the database. Practically this means:

- Store the master key in a secrets manager that supports versioning and access auditing.
- Export the key to a second secrets manager or to an offline hardware secure location.
- Test the recovery of the key independently; a backup you cannot restore is not a backup.

If the master key is generated fresh on every install, any restore into a fresh install will fail to read encrypted fields. Always restore the master key from its backup alongside the database.

## Testing a restore

Backups that have not been restored are not backups. Assessors Studio is a system where you can learn whether the backup chain actually works by running one specific exercise.

At least once a year, stand up a clean installation, restore a database backup and (if using object storage) a bucket backup, supply the master key, start the service, and confirm you can:

- Sign in.
- Open a historical assessment.
- View an attached evidence file.
- Produce a signed attestation from that assessment.

The last step is the most important one. Producing a signed attestation exercises the database, the evidence store, the encryption key chain, the signing code, and the schema. If it succeeds end to end, the backup is usable.

Run the restore on a staging environment that is identical to production. A restore that works on a laptop but not on the production stack is a hidden failure mode; the exercise is only valuable if the environment matches.

## Recovery scenarios

Accidental deletion of a record. Restore the affected table (or the relevant rows) from a recent backup. PITR lets you pinpoint the exact moment before the deletion; a daily snapshot lets you restore to the previous day.

Total database loss. Restore the database from the most recent good backup. Reconnect the service; read traffic resumes immediately. Any data written between the backup and the failure is lost unless PITR was in use.

Total bucket loss (object storage). Restore the bucket from its replication or versioning. The database still has metadata pointing to evidence keys; after the bucket is restored, every metadata row has its corresponding object again.

Partial bucket loss. Evidence files that are missing from the bucket will fail to load. The application surfaces missing evidence with a clear error. Restore only the missing objects from backup; the database does not need to be touched.

Compromised master key. Rotate the master key using the procedure in [Encryption at Rest](/administration/encryption-at-rest/). The leaked key becomes useless for any value re wrapped under the new key. No restore is needed as long as the database and bucket are intact.

Stale backup discovered after failure. If the most recent backup is older than you thought, the gap between the backup and the failure is lost. Work with the affected users to reconstruct as much as can be reconstructed from their own records (email threads, shared documents, screenshots). The CDXA format is friendly to re import, so missing evidence can often be re attached from the users' own copies.

## Migrating between environments

The same mechanics that power restore also support migrating an installation between environments. To move an installation:

1. Take a full backup in the source environment.
2. Bring up a clean installation in the target environment using the same image version.
3. Restore the backup.
4. Restore the master key.
5. Start the service.

A migration takes the same shape as a restore and should be rehearsed the same way.

## What not to store in backups

Master encryption keys in backups that are themselves unencrypted. The master key is sensitive enough to warrant its own store.

Credentials for the backup destination inside the container itself. A compromise of the application should not hand an attacker the keys to your backups.

Plaintext copies of encrypted fields. Running `pg_dump` on an encryption enabled installation produces ciphertext for every encrypted field, which is the correct outcome. Do not add tooling that decrypts on the way out; the master key should never be exported with the backup.

## Final word

Design the backup chain with a specific test in mind: can you produce a signed attestation from a ten year old assessment using only the artifacts in your backup system? If yes, you are covered. If no, fix whatever is missing before you need it.
