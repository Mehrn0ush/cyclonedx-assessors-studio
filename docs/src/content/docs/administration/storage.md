---
title: Evidence Storage
description: Where evidence files are stored, how to choose between database and object storage, and how to migrate between the two.
---

Evidence is the body of an assessment. Every attached file, screenshot, policy document, configuration export, and certificate eventually becomes evidence of a claim. Assessors Studio gives operators a choice of where that evidence lives: inside the application database, or in an S3 compatible object store. This page covers both options, when to pick each, and how to move between them.

## The two options

Database storage is the default. Evidence files are stored as binary large objects in the PostgreSQL or PGlite database, alongside the metadata that describes them. This keeps the install simple (one backup covers everything), works without any additional infrastructure, and is appropriate for small installations and evaluations.

Object storage is the recommended production configuration. Evidence files are stored in an S3 compatible bucket; only the metadata, the content hash, and the storage key live in the database. This pattern decouples evidence size from database size, allows the bucket to use its own lifecycle rules and storage tiers, and scales to much larger evidence corpora.

Both options produce the same application behavior. The user interface, the claim workbench, the evidence picker, and the attestation export are identical regardless of where the bytes live. The choice is operational: it affects backup, replication, capacity planning, and cost.

## When to pick database storage

Database storage is the right choice when:

- You are evaluating the platform or running a pilot.
- Your installation is small and has limited evidence volume (a few dozen gigabytes, give or take).
- You prefer a single backup artifact for all application state.
- You do not want to run any storage infrastructure beyond PostgreSQL.

Database storage is simplest to reason about. Everything the application knows is in one place, and a PostgreSQL backup is a backup of the entire installation.

## When to pick object storage

Object storage is the right choice when:

- You expect evidence volume to grow into hundreds of gigabytes or more.
- You want evidence to live in a storage tier that supports lifecycle rules (move cold files to infrequent access, expire auto captured screenshots after a year).
- You want evidence replicated or geographically distributed at the storage tier rather than at the database tier.
- You are already operating an S3 compatible store and want to reuse it.
- You are running Assessors Studio in a platform that charges for database storage at a significantly higher rate than object storage.

## Configuring object storage

Object storage is enabled by setting `STORAGE_PROVIDER=s3` and supplying the `S3_*` environment variables. Any provider that speaks the S3 API is supported: AWS S3, MinIO, DigitalOcean Spaces, Backblaze B2, Cloudflare R2, Wasabi, Ceph RGW. The full variable list is in [Environment Variables](/configuration/environment-variables/).

Path style addressing. Some providers (notably MinIO when not behind a virtual host style proxy) require path style addressing. Set `S3_FORCE_PATH_STYLE=true` in those cases. AWS S3 uses virtual host style by default and does not need this setting.

Credentials. The application reads `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` directly. If you prefer to use instance profile credentials on AWS (IRSA on EKS, instance role on EC2), leave the access key variables unset; the AWS SDK picks up credentials from the ambient environment.

Bucket policy. The application needs permission to `PutObject`, `GetObject`, `DeleteObject`, and `HeadObject` on the bucket. A dedicated IAM policy scoped to the bucket is the recommended configuration.

Encryption in transit. HTTPS is assumed. Do not point `S3_ENDPOINT` at an unencrypted endpoint in production.

Encryption at rest in the bucket. This is independent of Assessors Studio's own encryption at rest feature, which protects sensitive fields in the database. Bucket level encryption (SSE-S3, SSE-KMS, or provider equivalents) is orthogonal and recommended. See [Encryption at Rest](/administration/encryption-at-rest/) for the application's encryption model.

## Upload limits

The maximum upload size is controlled by `UPLOAD_MAX_FILE_SIZE` (in bytes, default 50 MB). This applies to any upload path and is enforced by the backend; setting the value lower does not protect the backend from an attacker who bypasses the frontend, so the backend reads the same value.

If you set this higher than 50 MB, check the request size limits on any reverse proxy or load balancer in front of the backend. A common failure mode is `413 Payload Too Large` coming from the proxy rather than from the application.

## Content hashing

Every evidence file is content hashed at upload. The hash is stored in the database alongside the metadata and is included in the CDXA attestation. Downstream consumers can verify that the bytes they receive match the hash signed at attestation time, which is what makes attestations tamper evident.

Content hashing is always on. It is independent of the storage backend.

## Migrating from database to object storage

An operator can migrate existing evidence from database storage to object storage in one pass. The migration script reads each evidence row, uploads the bytes to the bucket under a new storage key, updates the row with the storage key, and then deletes the bytes from the database. The process is incremental and safe to interrupt; re running picks up where it left off.

The migration ships as an npm script in the backend. Invoke it with the S3 variables configured in the environment:

```bash
npm run migrate-evidence-to-s3
```

The script logs its progress and reports the bytes moved and the bytes remaining. On completion it prints a verification summary that confirms every evidence row has a matching object in the bucket.

After migration, set `STORAGE_PROVIDER=s3` in the running service's environment and restart. From that point on, new evidence lands in the bucket; reads transparently pull from wherever the bytes live.

## Migrating from object storage to database

The reverse migration is supported but is rarely the right choice. The script copies bytes from the bucket back into the database:

```bash
npm run migrate-evidence-to-database
```

The usual reason to run this is to decommission a storage backend, for example when a bucket provider is being retired. The migration is again incremental and safe to interrupt.

## Backup implications

Database storage. A PostgreSQL backup (via `pg_dump` or a physical replication slot) contains every evidence file. No separate evidence backup is needed.

Object storage. A PostgreSQL backup contains only metadata. The bucket must be backed up independently: S3 versioning plus cross region replication is the usual pattern, but any durable backup of the bucket works. See [Backup and Recovery](/administration/backup-and-recovery/) for the recommended backup topology in both cases.

## Operational guidance

Watch the growth rate. Evidence tends to accumulate faster than operators expect; a quarterly review of evidence volume helps you stay ahead of a capacity event.

Plan lifecycle rules early. If you use object storage, decide up front how long each class of evidence should live in hot storage versus cold storage versus being deleted. Bucket lifecycle rules are much easier to apply consistently from day one than to retrofit onto years of existing objects.

Test the restore. Backups you have not restored are not backups. At least once a year, restore a backup to a staging environment and confirm you can produce a signed attestation from a historical assessment. The exercise also validates that the bucket you rely on is restorable in the state you assume.
