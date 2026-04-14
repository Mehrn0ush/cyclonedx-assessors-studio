---
title: Dashboards
description: Arrange widgets into a personal or role-specific dashboard for at-a-glance visibility into assessments, claims, evidence, and attestations.
---

Dashboards are the landing page that greets every user when they sign in. A dashboard is a grid of widgets that summarize the state of the system from the signed-in user's point of view. Each user arranges their own dashboard; administrators can publish role-specific defaults for new users.

## What the dashboard shows

Out of the box a dashboard combines three kinds of information: headline metrics (how many assessments are in flight, how many claims are overdue, how many pieces of evidence were added this week), actionable lists (claims awaiting your review, evidence you have been asked to provide, assessments ending soon), and trend charts (completion rate over the last quarter, median time-to-attest, evidence reuse rate).

The widgets are filtered by the signed-in user's permissions and scope. An assessor sees the assessments they are assigned to; an assessee sees the requests addressed to them; an administrator sees the entire program. No user sees data they do not have permission to access.

## Customizing your dashboard

Click Edit Dashboard in the top right of the dashboard page to enter edit mode. Every widget gains a handle, and an Add Widget button appears. In edit mode you can drag widgets to rearrange them, resize them by their handles, or click Add Widget to open the widget catalog.

The widget catalog is organized by category: Metrics, Lists, Charts, Timelines, and Status. Each entry shows a preview of the widget and a short description. Pick one, configure any options (filter by entity, standard, state), and drop it onto the grid.

When you leave edit mode the layout is persisted to the database against your user account. If you sign in from a different device you see the same layout; if you reset the dashboard, the default for your role is restored.

## Widget catalog at a glance

Metrics are single-number tiles suitable for KPIs. Typical examples are Active Assessments, Overdue Claims, Evidence Awaiting Review, and Signed Attestations This Quarter. Each metric widget supports a comparison (vs last week, vs last quarter) and can be filtered.

Lists are tabular widgets that show a scoped view of records. Typical examples are Claims Assigned To Me, My Evidence Requests, Assessments Ending This Week, and Recent Activity In My Entities. Each list widget supports sorting, filtering, and a link-through to the detail page.

Charts visualize trends. Line and bar charts are supported for time-series data (completion over time, claims by state over time), and donut charts are supported for categorical breakdowns (evidence by category, claims by state in an assessment).

Timelines show upcoming or recent activity against a calendar. They are particularly useful for audit windows and regulatory due dates.

Status widgets show health at a glance: red/amber/green across assessments, entities, or integrations. They are a good fit for the top row of an operational dashboard.

## Role-specific default dashboards

An administrator can define a default dashboard for each role. When a new user is created, their initial dashboard is copied from the default for their primary role. Users retain full control: they can modify the dashboard they inherit, and changes made to the default later do not overwrite existing user dashboards unless an administrator explicitly pushes them.

To edit a role default, go to Configuration → Dashboard Defaults, pick a role, and design the default layout the same way you design your own.

## Sharing a view

A dashboard is personal and is not directly shared, but the same information can be reproduced in a saved Report. Reports are a sibling capability that supports scheduled email delivery and link-sharing. If you find yourself emailing screenshots of your dashboard every Monday, that is a report waiting to be created.
