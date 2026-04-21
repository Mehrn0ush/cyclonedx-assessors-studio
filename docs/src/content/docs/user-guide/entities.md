---
title: Entities
description: Model the subjects of your assessments, track relationships between them, and navigate the entity graph.
---

Entities are the subjects of assessments. Everything the organization might want to assess is modeled as an entity: products, services, vendors, business units, suppliers, physical sites, internal systems, and so on. This page explains how entities are created, how they relate to each other, and how you navigate the graph they form.

## Creating an entity

Navigate to Catalog → Entities and click New Entity. The form captures the entity's name, type, owner, and description. Types are customizable per installation; common defaults are product, service, vendor, business-unit, system, and site. The owner is the user who is accountable for the entity; they are automatically added to every assessment that targets the entity unless explicitly removed.

Beyond the required fields, entities carry a freeform set of attributes. Attributes are key/value pairs that capture anything useful for the program: an asset tag, a cost center, a URL, a data classification, a geographic region. Attributes are searchable and are included in reports, which makes them a good place to record the organization-specific metadata that would otherwise live in a separate spreadsheet.

## Relationships

Entities are rarely independent. A product depends on services, which depend on vendors, which depend on upstream software. The entity graph captures those relationships explicitly. Every entity has a single Relationships section on its detail page that lists the entities it relates to, in either direction, along with the kind of relationship (depends-on, contains, operated-by, assessed-with, and custom types defined per installation).

Relationships can be viewed as a table or as a visual graph. The graph view is an interactive canvas with the current entity in the middle and its neighbors arrayed around it. Clicking a neighbor re-centers the graph on that entity, which lets you explore the neighborhood without losing context.

Relationships are bidirectional. If entity A depends-on entity B, the Relationships section of B shows that A depends on it, even if the relationship was created from A's side. There is no risk of asymmetric data because the system treats relationships as edges in a shared graph.

## Assessment history

Every entity shows every assessment that has ever been conducted against it. The list groups assessments by standard and sorts them by date, which makes it easy to see whether the entity has been consistently assessed against the standards that matter. For each assessment the list shows the date, the scope, the outcome, and a link to the signed attestation when one exists.

An entity also shows aggregate progress across its active assessments: how many claims are open, how many are overdue, and how many pieces of evidence are awaiting review. The aggregate is a quick way to see whether an entity has a program running smoothly or is drifting.

## Parent and child entities

Entities can be nested. A parent entity (a product line, a platform, a subsidiary) can contain child entities (individual products, services, teams). Nesting is modeled as a contains relationship, which means all the capabilities that work on relationships work on nesting too: you can view the hierarchy, navigate it in the graph, and roll up metrics.

Nesting does not imply inheritance. A claim made against a parent entity does not automatically apply to its children. The platform keeps those decisions explicit, because in practice the child often deviates from its parent in ways that matter.

### Children tab

The entity detail page includes a Children tab that lists the entities that directly descend from the current entity in the contains relationship. Each row shows the child's name, type, lifecycle state, and the specific relationship that links it to the parent. The rows are clickable and navigate to the child's detail page, which makes top down traversal a single click per hop.

The Children tab is a convenience view over the same graph the Relationships section uses. Any child added through the Relationships section appears here automatically, and any change made here is reflected in the graph view. Use the Children tab when you want a fast flat listing; use the Relationships graph when you want to see siblings, cousins, and upstream dependencies at the same time.

## Activity tab

The Activity tab on the entity detail page shows a chronological audit trail of everything that has happened to the entity. Creation, metadata edits, relationship changes, attribute updates, assessment links, policy attachments, and ownership changes all land on the same timeline with the actor's identity, the timestamp, and a short description of what changed.

The activity stream reads from the same immutable audit log the administrative views use, so nothing that mutates an entity can avoid being recorded. The tab is the first place to look when a stakeholder asks when a change was made, who made it, or why an entity now points somewhere unexpected.

## Searching and filtering

The entity directory supports full-text search on name, description, and attributes, plus facet filters on type, owner, and tag. Searches can be saved and pinned to the sidebar. A saved search like "vendors with no assessment in the last year" is a common building block for a program that cares about coverage.

## Retiring an entity

When an entity ceases to be in scope, mark it as Retired rather than deleting it. Retirement preserves the historical record (so past attestations still resolve cleanly) while removing the entity from new assessment planning and from default dashboards. If you really must delete an entity, an administrator can do so from the entity detail page; the system warns that deletion is permanent and prompts to confirm.
