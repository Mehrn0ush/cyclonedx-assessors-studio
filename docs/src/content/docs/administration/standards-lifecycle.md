---
title: Standards Lifecycle
description: How standards move from a blank draft to a published catalog entry, who is involved at each step, and how published standards can be superseded or retired.
---

A standard in Assessors Studio is a catalog of requirements that an assessment can be run against. Standards are first class records with a lifecycle of their own: they are authored, reviewed, published, and eventually superseded. This page is the administrator and standards owner reference for that lifecycle.

## States

A standard exists in exactly one of the following states at any moment in time.

| State | Visible in catalog | Editable | Description |
| --- | --- | --- | --- |
| Draft | No | Yes, by Standards Manager | The standard is being authored. Invisible to assessors; cannot be selected when planning an assessment. |
| In Review | No | Small edits only | The standard has been submitted for approval. Frozen in intent. Standards Approvers are notified that a review is waiting. |
| Published | Yes | No (immutable) | The standard is available to every assessment. It appears in the catalog, can be selected when planning, and its requirements are displayed in the claim workbench. To change it, a new version is authored from a copy. |
| Superseded | Yes, flagged | No | The standard has been replaced by a newer version. Retained so historical assessments remain reproducible, but new assessments cannot select it unless an administrator overrides the default filter. |
| Retired | Hidden by default | No | The standard is no longer used by the organization. Historical assessments remain, but the standard is hidden from the default catalog view. |

The transitions between states are strictly controlled. A draft can move to review, a review can move back to draft or forward to published, a published standard can be superseded or retired, and nothing can move backwards from superseded or retired without administrator intervention.

## Creating a draft

A draft is created in one of three ways. The first is to import an existing standard as a CDXA document. Assessors Studio accepts any valid CDXA standard; it parses the requirements hierarchy, the metadata, and any external references, and produces a new draft that a standards manager can then review and extend.

The second is to author a standard from scratch. The author opens the Standards page, clicks New Standard, chooses a name, a short code, and a description, and is taken into the authoring workbench. The workbench presents the requirements hierarchy as a tree; items can be added, moved, and edited.

The third is to copy a published standard. This is the normal starting point for authoring a new version of an existing standard: the copy is an editable draft that preserves the requirements hierarchy of the source, which the author can then modify.

## Authoring a standard

The requirements hierarchy is the body of a standard. A requirement can have children (sub requirements), text (the normative statement), references (links to the authoritative document), and metadata (severity, applicability, tags). The authoring workbench supports drag and drop reordering, bulk import of requirements from a spreadsheet, and inline preview of how the requirement will appear in an assessment.

Every requirement is identified by a stable ID. The ID is assigned by the system and is preserved across edits. When a standard is copied to create a new version, requirement IDs are also preserved where the new version's requirements derive from the old version's, so attestations against the new version can be mapped to attestations against the old version.

External references are first class. A requirement can link to a section of a published framework (NIST, ISO, PCI DSS, CIS) or to an internal policy document. References are displayed to the assessor during the claim workbench and are carried forward into the published attestation so downstream consumers can follow the provenance of each claim.

## Submitting for review

When a standards manager considers a draft complete, they submit it for review. Submission is a one click action from the standard detail page; it locks significant edits, marks the standard as In Review, and notifies every Standards Approver.

An approver can approve the standard (move it to Published), reject it (move it back to Draft with a note), or request changes (move it back to Draft with a note and specific requirements flagged for revision). Each of these actions is captured in the audit log with the approver's identity and a timestamp.

## Publishing

Publication is the act of making a standard available to every assessment. A published standard is immutable; it is frozen in time and carries a version number, a publication timestamp, and the identity of the approver. From the moment of publication onward, any assessment that selects this standard will evaluate exactly the requirements that were frozen at publication.

A published standard can be added to the default catalog view or kept in an auxiliary catalog. Most organizations publish a small set of commonly used standards to the default view and keep niche or legacy standards in auxiliary catalogs to reduce clutter.

## Superseding a standard

When a new version of a standard replaces an old version, the old version is superseded rather than deleted. Superseding is a deliberate action: a standards approver marks the old version as superseded and points it at the new version. The system then:

- Displays a deprecation banner on the old version's detail page.
- Filters the old version out of the default new assessment catalog.
- Preserves every historical assessment that used the old version, including its attestations.

Historical assessments are never rewritten when a standard is superseded. They continue to reference the exact requirements they were evaluated against, which is what makes an attestation reproducible.

## Retiring a standard

Retirement is a stronger form of supersession. A retired standard is not only replaced; it is no longer used. Historical assessments that used it are preserved, but the standard is hidden from the default catalog view entirely. Retirement is rare; it is typically reserved for standards that the organization has stopped following.

## Versioning

Standards in Assessors Studio are versioned per entry. A standard has a version number that increments when a new published version is created; the old version is superseded by the new version. Both versions are preserved in the catalog.

Versioning is explicit, not implicit. Editing a published standard is not possible; if a change is needed, a new version is authored from a copy and the old version is superseded on publication.

## Catalogs

Every published standard belongs to one or more catalogs. Catalogs are a way to group standards that belong together: a regulatory catalog for standards imposed by a regulator, an internal catalog for standards authored in-house, a vendor catalog for standards produced by third parties, and so on. A standard can belong to more than one catalog.

Catalogs control visibility. The default view in the Standards page lists the standards in the default catalog; other catalogs are accessed through a filter. An administrator can rearrange catalog membership at any time.

## Administrator controls

Administrators have a set of standards controls that sit above the normal lifecycle. They can:

- Force transitions between states, including reopening a superseded standard.
- Edit the metadata of a published standard (for example, adjusting its catalog membership).
- Bulk retire a set of standards that are no longer used.
- Reassign the standards manager or approver role on individual standards.

These controls are audit logged and should be used sparingly. They exist to handle edge cases that do not fit the normal lifecycle.

## Common workflows

Authoring a brand new standard. A standards manager creates a new draft from scratch, fills in the requirements hierarchy, submits for review. An approver reviews and publishes. The standard appears in the catalog and becomes available for assessment planning.

Adopting an industry standard. A standards manager imports the CDXA document for the industry standard, reviews the parsed output to confirm the requirements hierarchy is correct, submits for review. An approver confirms the import is faithful and publishes.

Releasing a new version of an existing standard. A standards manager copies the existing published standard, modifies the requirements to reflect the new version, submits for review. An approver reviews the diff, publishes the new version, and supersedes the old version.

Retiring a standard. An administrator marks the standard as retired, which hides it from the default catalog view. Historical assessments that used it remain intact.
