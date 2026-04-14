---
title: Encryption at Rest
description: The encryption model that protects sensitive fields in the database, how to configure it, how to rotate keys, and how to recover when a key is compromised.
---

Assessors Studio encrypts sensitive fields in the database with an envelope encryption scheme. A master key held outside the database unwraps a Key Encryption Key, which in turn unwraps per record Data Encryption Keys. Each layer has an independent rotation cadence. This page is the administrator reference for configuring, rotating, and recovering the encryption keys.

## What is encrypted

Encryption protects fields that would be sensitive if the database were copied without the master key. The current field list includes webhook signing secrets, SMTP credentials, chat integration tokens (Slack, Teams, Mattermost webhook URLs), API key hashes, and any other secret stored at runtime. When OpenID Connect ships from the roadmap, its client secret will join the encrypted field list.

Evidence files themselves are not covered by application level encryption. Evidence is protected by the storage backend's own encryption (bucket level encryption for object storage, disk level encryption for database storage) and by the content hash that is verified on every read. If the storage backend does not encrypt at rest, the operator is responsible for adding that layer underneath.

Passwords are hashed with argon2id, not encrypted. Hashed passwords are not reversible, so they do not participate in the encryption system.

## The key hierarchy

There are three keys in the hierarchy, each with a specific role.

Master Encryption Key (MEK). Held outside the database in the process environment as `MASTER_ENCRYPTION_KEY`. The MEK is a 256 bit key encoded as 64 hex characters. It is only used to unwrap the Key Encryption Key; it never touches record data directly.

Key Encryption Key (KEK). Stored in the database, wrapped by the MEK. The KEK unwraps Data Encryption Keys. The KEK has a version number; every time the KEK rotates, a new version is appended to the key ledger, the previous version is preserved, and all wrapped DEKs are re wrapped under the new version.

Data Encryption Key (DEK). Stored in the database alongside each encrypted value, wrapped by the KEK. The DEK encrypts and decrypts the actual record bytes. DEKs are per record, so compromising a single DEK only exposes the single record it protects.

The three layer scheme means an operator can rotate the master key or the KEK without re encrypting every encrypted field. Only rewrapping the KEK or DEK is needed.

## Configuring encryption

Production installations should always run with encryption enabled:

```bash
MASTER_ENCRYPTION_KEY=<64 hex chars>
REQUIRE_ENCRYPTION=true
```

Generate a master key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`REQUIRE_ENCRYPTION=true` is a safety net: it causes the application to refuse to start if the master key is missing or malformed, so a misconfigured deployment never silently falls back to storing secrets in plaintext.

Evaluation and development installations may run without a master key, in which case the encryption service operates in passthrough mode. Values are still read and written through the same code path, so switching to encryption later is a single migration (see below) rather than an application change.

## Migrating plaintext secrets

If an installation was running without a master key and you have just enabled one, the existing secrets in the database are stored in plaintext. Run the migration script to wrap them in encrypted envelopes:

```bash
npm run encrypt-secrets
```

The migration runs safely while the application is serving traffic. It reads each secret row, encrypts it under the current KEK, and writes the envelope back. A verification pass at the end confirms every secret is now encrypted.

The migration is idempotent; rerunning is a noop once every secret is already encrypted.

## Rotating the Key Encryption Key

The KEK rotates on a regular cadence (typically quarterly or annually, depending on your policy). Rotation creates a new KEK version with a fresh HKDF derivation salt and rewraps every DEK under the new version. The master key itself does not change.

Rotate with the CLI:

```bash
npm run rotate-encryption-key
```

Or through the admin API:

```bash
curl -X POST -H "X-Api-Key: <admin key>" \
  https://studio.example.com/api/v1/admin/encryption/rotate
```

KEK rotation is routine and should be scripted into the operator's calendar. The audit log records each rotation with the timestamp, the new version number, and the identity that triggered it.

## Rotating the Master Encryption Key

The master key itself only rotates when it has been compromised or when you are replacing the key material as part of a broader credential rotation. Rotation decrypts every encrypted value with the old key and re encrypts with the new key.

Rotation requires both the old and new master keys in the environment:

```bash
MASTER_ENCRYPTION_KEY=<new 64 hex chars> \
OLD_MASTER_ENCRYPTION_KEY=<old 64 hex chars> \
npm run rekey-master
```

The rekey process locks the affected tables while it runs. On a large installation the lock can be measurable; run the rekey during a maintenance window if the secret volume is high.

Once the rekey completes, remove `OLD_MASTER_ENCRYPTION_KEY` from the environment. Leaving the old key in the environment after the rekey is a security risk and a configuration smell.

## Recovering from key loss

Losing the master key is catastrophic. Without the master key, the KEK cannot be unwrapped, and therefore no encrypted value can be read. The database will still start, but every encrypted field will return as unreadable and the application will refuse to operate on those records.

There is no recovery from master key loss short of restoring from a backup that was taken before the loss. Treat the master key with the same care as any other production credential: store it in a secrets manager (AWS Secrets Manager, HashiCorp Vault, Azure Key Vault), log and alert on access, and rotate it on a schedule.

If the master key is leaked but not lost, rotate it immediately using the `rekey-master` procedure above. The old key's exposure does not compromise the new key or any value re encrypted under the new key.

## Admin visibility

The admin encryption status endpoint returns the current KEK version, the full key version history, and the counts of encrypted versus plaintext fields across the database. Administrators can use it to confirm that migrations have completed and that no drift exists.

```bash
curl -H "X-Api-Key: <admin key>" \
  https://studio.example.com/api/v1/admin/encryption/status
```

The same information is surfaced in the admin UI under Administration. An operator checking on the health of the encryption system does not need to drop to the CLI.

## What to audit

Every encryption related action writes to the audit log:

- Migration runs (`encrypt-secrets`).
- KEK rotations.
- Master key rotations.
- Read attempts that fail due to an unknown KEK version.

The audit log is the authoritative record of key management activity and should be retained for at least as long as the longest lived attestation in the system.
