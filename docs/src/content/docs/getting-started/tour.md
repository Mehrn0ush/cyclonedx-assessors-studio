---
title: A Guided Tour
description: A quick orientation to the Assessors Studio interface, page by page, so you know where each capability lives.
---

This page is a short orientation to the Assessors Studio interface. Read it once, and you will know which navigation item to reach for when you need to get something done. Every page mentioned here has a dedicated guide in the User Guide or Administration section.

## Layout

The interface is organized into three regions. The top bar carries the application logo, a global search, your profile menu, and notification badges. The left sidebar is the primary navigation, grouped into Activity (daily work), Catalog (standards, entities), Configuration (admin), and Reports. The main area is whatever page you have selected. Every page supports deep links, so sharing a URL with a colleague always opens the same view.

The sidebar can be collapsed for more horizontal space on narrow displays. The sidebar grouping is role-aware: an assessee does not see the administration section, an assessor does not see the full configuration area, and an administrator sees everything.

## Dashboards

The default landing page after sign-in is a customizable dashboard. Widgets on the dashboard are drag-and-drop tiles that display rolled-up state: how many assessments are active, how many claims are overdue, how many pieces of evidence are pending review, and so on. The dashboard is personal; each user arranges it to suit their role.

Administrators can also create role-specific default dashboards that are used as the starting point for new users. See [Dashboards](/user-guide/dashboards/) for widget catalog and customization details.

## Entities

Entities are everything the organization assesses. The Entities page is a searchable directory. Each entity has a detail page showing its metadata, its relationships to other entities, the assessments that have been conducted against it, and the attestations those assessments produced.

The entity graph can be viewed as a table or as a visual graph that shows parent, child, and lateral relationships at a glance. See [Entities](/user-guide/entities/) for the full capability list.

## Standards

The Standards section is the requirements catalog. Published standards are browsable and assessable; drafts are editable by the standards owners. A standard detail page shows the full requirements hierarchy with navigation controls, each requirement showing its identifier, title, description, and the assessments and claims it is referenced by.

Standards owners can start a new version of a standard without disturbing the version currently in use. See [Standards](/user-guide/standards/) for authoring and [Standards Lifecycle](/administration/standards-lifecycle/) for administration.

## Assessments

Assessments are where most of the daily work happens. The Assessments page is a list of every active, planned, or completed assessment. Each assessment has a detail page showing the requirements tree, the current claim state, the evidence backlog, and the audit trail.

An assessor working through an assessment does most of the work on the detail page, moving from requirement to requirement, drafting claims, requesting and reviewing evidence. See [Assessments](/user-guide/assessments/) for the full workflow.

## Evidence

Evidence is first-class content in the system. The Evidence page is a searchable library of every piece of evidence attached to every assessment you have access to. The library supports filtering by category, source, and date, which makes it easy to locate a specific artifact or to audit what is being reused.

See [Evidence and Claims](/user-guide/evidence-and-claims/) for how evidence flows through an assessment.

## Notifications

A bell icon in the top bar opens the notifications drawer. It lists every notification you have received, with filters for unread and notifications generated today. Clicking a notification takes you directly to the object it concerns.

Notifications are also delivered through external channels you configure (email, Slack, Microsoft Teams, Mattermost, webhooks). See [Notifications](/user-guide/notifications/) for the user-facing view and [Integrations](/administration/integrations/) for administrator configuration.

## Configuration

The Configuration section in the sidebar is visible only to users with administration permissions. It holds Users and Permissions, Standards Lifecycle, Integrations, Storage, Encryption, Metrics, and the settings page where feature flags and application-wide options live. Every subpage is documented in the [Administration](/administration/deployment/) section of these docs.

## Global search

The search box in the top bar is application-wide. It searches across entities, standards, requirements, claims, evidence, and assessments. Results are grouped by type, which makes it easy to jump directly from a search term to the exact object you had in mind without navigating through the sidebar.

## Profile and preferences

The avatar in the top right opens your profile menu. From there you can change your password, adjust your notification preferences, switch between light and dark themes, and sign out. Administrators who are impersonating another account land here to return to their own session.

## What next

Now that you know where each capability lives, head to [Your First Assessment](/getting-started/first-assessment/) for a guided, end-to-end walkthrough that exercises every major surface of the platform.
