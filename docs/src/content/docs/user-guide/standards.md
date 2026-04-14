---
title: Standards
description: Browse the standards catalog, navigate requirements, and understand how standards are versioned and assessed against.
---

A standard is a named, versioned collection of requirements. Every assessment is scoped against exactly one standard, so the catalog of standards is the starting point for everything a program produces. This page is the user-facing guide to standards; the administrative workflow for authoring and approving them is covered on the [Standards Lifecycle](/administration/standards-lifecycle/) page.

## Browsing the catalog

Navigate to Catalog → Standards to open the standards directory. The directory shows every published standard and is filterable by owner, tag, and status. Each row shows the standard's name, its current version, the date it was published, and the number of active assessments that reference it.

Clicking a standard opens its detail page. The detail page has four areas: the header with metadata (name, version, owner, status, effective date), the requirements tree, a References panel showing the assessments that reference the standard, and a History panel showing the lineage of previous versions.

## Navigating the requirements tree

The requirements tree is the heart of a standard. It is a nested outline of requirements, each with a stable identifier, a short title, a full description, and optional categorization. You can expand and collapse the tree by level. Every requirement has a direct URL, so a deep link to a specific control in a specific version of a specific standard always resolves to the same place.

Each requirement shows the claims and evidence that have referenced it across every assessment you have permission to see. This is where the machine-readable nature of the platform pays off: the same control surfaces every instance of its use, in every assessment, so you can spot patterns and drift without hunting through individual assessments.

## Versioning

A standard can have many versions. When an author starts a new version, the previous version is frozen: already-running assessments against the frozen version continue to reference it unchanged, and newly planned assessments can pick the version that is right for them. The platform does not automatically migrate an assessment from one version to another, because in practice the version change usually means some control changed, and a human needs to decide what that means for the claims that already exist.

Each version carries a changelog that the standards owner populates as the version is drafted. The changelog lists requirements added, modified, and removed, with a short note on the intent of each change. The changelog is rendered on the standard's detail page and is included in the signed attestation when a later assessment cites the version.

## Using a standard in an assessment

When you plan an assessment you select a standard and a specific version. The assessment then has a frozen reference to that exact version, and the requirements tree inside the assessment is a copy of the tree at that version. The copy is specifically so that the assessment's claim state is bound to the requirements that existed at the moment of planning; later edits to the standard do not retroactively change old assessments.

If a new version of the standard is published while an assessment is in flight, the assessment is not affected. You can mark the old assessment complete and plan a new assessment against the new version, which is the typical pattern for programs that reassess on a cadence.

## Importing and exporting

A standard can be imported from a CDXA JSON document. The import picker on the New Standard form accepts any CDXA-compliant file; the system reads the name, version, owner, and full requirements hierarchy directly from the file. Because the format is the standard, any tool that exports a CDXA standard can be used as an upstream source.

A standard can also be exported from its detail page. Export produces the same CDXA format, which means a standard authored in Assessors Studio is portable to every other CDXA-aware tool. The export is not signed; it is the logical content. Attestations, by contrast, are signed, because they are the artifacts that leave the program.

## Roles that touch standards

Most users only read standards. Assessors read them to understand the control they are evaluating; assessees read them to understand what they are being asked to provide. Only users with the Standards Manager or Standards Approver role can author, review, or publish standards. See [Standards Lifecycle](/administration/standards-lifecycle/) for the full authoring workflow.
