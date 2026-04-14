---
title: Projects
description: Organize related assessments into projects for coordinated tracking, reporting, and export.
---

A project groups related assessments under a single umbrella so you can track progress, manage deadlines, and export consolidated results from one place. This page explains when projects are useful, how to create and manage them, and what the project dashboard shows you.

## When to use a project

Projects are optional. A standalone assessment that evaluates one entity against one standard works fine on its own. Projects become valuable in situations like these:

An annual compliance review requires assessing an entity against three standards on a coordinated timeline. A project ties those assessments together, gives you a single due date, and surfaces warnings when any individual assessment falls behind.

A vendor onboarding cycle involves multiple assessments across different entities and standards, all driven by the same business initiative. A project lets you see aggregate conformance and evidence coverage without clicking into each assessment individually.

An internal maturity program tracks progress against a baseline over several quarters. Each quarter produces a new set of assessments, and the project dashboard shows the trend.

If the work involves a single assessment with a single standard, a project adds overhead without much benefit. Skip it and create the assessment directly.

## Project lifecycle

Every project has a state that reflects where it is in its lifecycle.

| State | Description |
|-------|-------------|
| New | Starting state. The project has a name, a description, at least one associated standard, and optionally a start date and due date. |
| In Progress | The project is actively being worked. Assessments are being planned, started, or completed inside it. |
| On Hold | Work is temporarily blocked or deferred. The project and its assessments remain accessible but the state signals that active work has stopped. |
| Complete | All assessments in the project have finished and the project's objectives have been met. |
| Operational | Long running projects that remain active indefinitely, such as a continuous compliance program that produces assessments on an ongoing basis. |
| Retired | Terminal state. Read only and hidden from the default project list. Retiring a project does not delete its assessments or attestations; they remain available for historical reference. |

## Creating a project

From the Projects page, click New Project. The form asks for a name, an optional description, and at least one standard. You can also add tags for organization. Start and due dates can be set later when you edit the project.

The standards you associate with a project determine which requirements are loaded when you create assessments inside the project. You can add or remove standards from a project at any time by editing it.

## The project detail page

The project detail page has three main areas: a dashboard card at the top, project information on the side, and a tabbed content area.

### Dashboard

The dashboard card shows four metrics at a glance. Assessment completion displays the percentage of assessments that have reached the Complete state, rendered as a ring chart. Timeline status indicates whether the project is on track, at risk, or overdue based on the due dates of its assessments relative to the project due date. Evidence coverage shows the percentage of requirements across all assessments that have at least one piece of evidence attached. Average conformance score aggregates the conformance scores of completed assessments.

Below these metrics, a warnings section highlights issues that need attention: overdue assessments, assessments with no linked requirements, assessment due dates that extend past the project deadline, low evidence coverage, and low conformance scores.

### Project information

The information card shows the project's name, description, state, dates, associated standards, and tags. From here you can edit the project, export a CycloneDX attestation document, export a project summary report, or archive the project.

### Assessments tab

The assessments tab lists every assessment that belongs to the project. Columns include the assessment title, state, due date, and start date. Clicking a row navigates to the assessment detail view. The New Assessment button creates an assessment that is automatically linked to the project, with the project's standards available for selection.

### Standards tab

The standards tab lists the standards associated with the project. Columns include the standard name, version, and owner. Clicking a row navigates to the standard detail view.

## Importing a CycloneDX attestation as a project

From the Projects page, users with the import permission can click Import Attestation to upload a CycloneDX JSON file. The system reads the file, previews its contents (spec version, serial number, and counts of standards, claims, evidence, attestations, and signatories), and creates a new project from the imported data. Standards in the file are deduplicated against existing standards in the catalog.

## Exporting

The project detail page offers two export options. Export CycloneDX produces a CDXA JSON attestation document that captures the project's assessments, claims, and evidence in the standard CycloneDX format. Export Project Report produces a summary suitable for stakeholder reporting, including the project metadata, standards, assessment counts by state, evidence totals, claim totals, attestation totals, and an overall conformance rate.

## Archiving a project

Archiving moves a project to the Retired state and records the archive timestamp. Archiving is a soft operation: the project and its assessments remain in the database for historical queries, but the project no longer appears in the default project list. Archiving is available from the project detail page under the action menu.
