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

Highlights since the April 18 snapshot:

- **Audit log UI.** New admin `/admin/audit` view with typeahead filters for action and entity type, userId and entityId lookups, date range, color coded action badges, a name and ID toggle, pagination, and CSV export. An "Activity" tab now appears on detail views for users with the `admin.audit` permission, surfacing the per record `/audit/entity/:entityType/:entityId` endpoint. The `/api/v1/audit/options` endpoint was added to source the typeahead values and the closed action vocabulary.
- **Admin invites UI.** New `/admin/invites` view lists pending, consumed, revoked, and expired invites. Creating an invite returns the plaintext token once in a copy dialog. Per row revoke is 409 aware for already consumed invites.
- **Encryption admin UI.** New `/admin/encryption` view shows key version, encrypted field counts, and last rotation timestamp. Rotate Key is gated by the `admin.encryption` permission with a confirmation dialog explaining that webhook secrets and other envelope encrypted material will be rewrapped. Rotation no longer requires shell access to the host.
- **API key UI.** Per user API Keys section in `Settings` and an admin variant on `Admin → Users` for minting on behalf. The one time secret is shown in a copy once dialog. Revoke is available per row.
- **Assessors admin UI.** New `/admin/assessors` view manages assessor records as first class CDXA entities distinct from `app_user`. Create, edit, soft delete, and view attestations signed.
- **Tag administration UI.** New `/admin/tags` view provides governance over the tag namespace with search, usage count, rename and recolor with merge warning, and idempotent delete.
- **Standards authoring: levels and reparenting.** The standard authoring workbench gained a Levels panel for defining named groupings such as Core or Maturity Level 2 with inline editing of identifier, name, description, and ordinal. A level requirements picker binds any subset of requirements to a level as a flat indented list with a search filter, and bindings are carried forward when a new version of the standard is published. Requirements can be dragged between parent groups or moved through a context menu without losing their stable identifiers; cycle creation is rejected with a descriptive error so downstream attestations continue to resolve.
- **Entity Children tab and Activity tab.** Entity detail pages gained a Children tab listing direct descendants in the contains relationship with name, type, lifecycle state, and relationship columns, plus row click navigation for fast top down traversal. An Activity tab reads from the immutable audit log and shows a chronological timeline of every creation, edit, relationship change, attribute update, assessment link, policy attachment, and ownership change on the entity.
- **User reactivation.** Deactivated accounts can be restored through a Reactivate action on the user row in `Admin → Users`. Reactivation clears the inactive flag, re-enables password authentication, preserves role assignments, and writes an audit entry. Group memberships are not restored automatically by design; operators add the user back to scoped groups after reactivation.
- **Attestation lifecycle hardening.** Signed attestations expose Verify and Rescind actions gated by the `attestations.verify` and `attestations.rescind` permissions. Verify recomputes the canonical JCS hash, validates digital signatures against the embedded public key, checks for rescission, and returns a structured result. Rescind requires a reason, keeps the signed document resolvable at its stable URL, embeds a `rescindedAt` marker in every export, and is captured in the audit log.
- **JSF signing migration.** The platform now signs attestations with the in-house `@cyclonedx/jsf` package, verified against the node-webpki.org reference fixtures. The wire format is a detached JSF signature over a canonical RFC 8785 JCS serialization, which means the signature verifies regardless of whether the document is reserialized by an intermediate system. Supported digital algorithms are RS256/384/512, PS256/384/512, ES256/384/512, Ed25519, and Ed448. Electronic signatures remain supported as `externalReference` entries for DocuSign style flows.
- **My Signatures.** Users manage their own signature material on the Profile page. Digital records accept a JWK or PEM private key, or ask the platform to generate one; private keys are encrypted with the existing Data Encryption Key envelope and never leave the platform. Electronic records capture a signatory name, role, organization, and a URI that resolves to an external signing record. A signature picker on the Sign Attestation dialog lets users choose which record to apply per signature.
- **CycloneDX 1.7 export with 1.6 fallback.** Attestation export now emits CycloneDX 1.7 by default. The export dialog and the `?spec=1.6` query parameter fall back to CycloneDX 1.6 for consuming systems that have a documented version pin. The fallback changes the `specVersion` field and the schema URL in the document header; the attestation payload itself is representable in both versions so the content does not change. Content type is `application/vnd.cyclonedx+json` and the filename includes the attestation ID and the spec version.
- **Bug fixes and test hygiene.** Fixed a drag and drop regression that rejected drops on scrolled rows of the requirement group editor. Fixed an invalid input error on the Create Attestation dialog when the legacy Signatory field was absent. Extracted a shared `createVueRouterMock` test helper and rolled it across the 24 view level test files, removing duplicated inline router mocks and resolving a `createRouter` landmine that surfaced during module load in certain test orderings.

No breaking changes. No new environment variables: the signature material flow reuses the existing `MASTER_ENCRYPTION_KEY` envelope, so Docker Compose and `CONFIGURATION.md` need no changes for this snapshot. Database migrations add the `user_signature` table and seed the `attestations.verify` and `attestations.rescind` permissions. Migrations are online and reversible.

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
