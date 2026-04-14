---
title: Assessments
description: Plan, run, and finalize an assessment against a published standard.
---

An assessment is a scoped engagement that evaluates one entity against one standard. This page walks through the lifecycle of an assessment from planning to sign-off, and covers the workflows an assessor uses day to day.

## The assessment lifecycle

Every assessment moves through a defined set of states. The state machine is deliberate: transitions are forward only by default, and reversing a completed assessment requires an explicit reopen action, because the integrity of the audit trail depends on controlled state changes.

| State | Description |
|-------|-------------|
| New | Initial state. The scope, team, entity, standard, and schedule are configured but no claim work has started. Requirements have not yet been loaded. |
| Pending | Optional holding state for assessments waiting on prerequisites before work can begin, such as a pending approval or a dependency on another assessment. |
| In Progress | Active working state. When started, the system loads requirements from the associated standard (or from the project's or entity's standards, depending on scope) and creates a claim placeholder for each one. The start date is set automatically. Assessors draft claims, request evidence, and record rationale. Assessees respond with evidence and clarification. |
| On Hold | Pause state for assessments that are temporarily blocked. Returns to In Progress when the blocker is resolved. Claims and evidence remain accessible in read only mode. |
| Cancelled | Terminal state for assessments that will not be finished. Remains in the system for historical reference but cannot be modified. |
| Complete | All requirements have a claim with a final rating (Met, Partially Met, Not Met, Not Applicable, or Inconclusive). The system calculates a conformance score and sets the end date. Read only. Two actions are available: reopen (returns to In Progress, clears end date) and archive (seals permanently). |
| Archived | Final resting state. Irreversible. Cannot be reopened or modified in any way. Exists solely as a historical record. |

### Valid transitions

The following transitions are enforced by the system:

New to In Progress (start), New to Pending, Pending to In Progress, In Progress to On Hold, On Hold to In Progress, In Progress to Complete, In Progress to Cancelled, Complete to In Progress (reopen), and Complete to Archived (archive). No other transitions are permitted.

## Planning an assessment

From Activity → Assessments, click New Assessment. The form captures the subject (entity), the reference (standard and version), the scope, the schedule (start and target completion dates), and the team. The team is a list of users with roles inside the assessment: Assessor, Reviewer, and Assessee. A single user can play multiple roles if the installation's permission model allows it.

When you save the form the assessment opens in the New state. Start the assessment to move it to In Progress, at which point the system loads the requirements from the standard and creates a claim placeholder for each one.

## Working claims

The assessment detail page is split into a navigation pane (the requirements tree) and a working pane (the currently selected claim). Claims are worked in any order; a common pattern is to work top-down by section, but the tree is navigable in any direction.

A claim has four parts: the state, the rationale, the evidence, and the timeline. The state is the assessor's conclusion. The rationale is the written explanation of why the conclusion was reached. The evidence is the supporting material. The timeline is the immutable history of every change made to the claim, attributed to a specific user with a timestamp.

Changing a claim's state is a deliberate action. The system does not automatically infer state from evidence; the assessor must explicitly rate each claim. This is because state is a professional judgment, and the platform protects the assessor's ability to make that judgment against any automation that might otherwise overreach.

## Requesting evidence

A claim can be in a "Evidence Requested" sub-state when the assessor has drafted a request for specific material from the assessee. The request has a description, a target date, and optionally an assignee (if more than one assessee is on the team). Assessees see pending requests in their dashboard and notifications.

When an assessee responds, the attached evidence is linked to the claim, and the request is marked fulfilled. The assessor then reviews the evidence, either accepting it (and moving the claim toward a final state) or asking a follow-up question.

## Collaborating in-place

Assessments support threaded comments on every claim. A comment can be addressed to a specific team member (who is then notified) or left as a note on the record. Comments are threaded, time-stamped, and permanent: a deleted comment is marked as redacted rather than removed, which preserves the audit trail.

## Finalizing the assessment

To complete an assessment, every requirement must have a claim with a final rating. The Complete action checks this condition and lists any claims that still need attention if it cannot succeed. Once complete, the assessment is read only and a conformance score is calculated.

The Produce Attestation action on a completed assessment generates the CDXA document. See [Producing Attestations](/user-guide/producing-attestations/) for the signing and export workflow. If something needs to change after completion, the Reopen action returns the assessment to In Progress. Once finalized for good, the Archive action seals the assessment permanently.

## Reassessing

Reassessment is not an in-place update. It is a new assessment that references the same entity and the same standard (possibly at a new version). The previous assessment remains in the historical record with its completed attestation intact. The new assessment inherits no claim state from the previous one; every claim starts fresh. This is by design, because CDXA attestations are snapshots in time, and a new assessment represents a new snapshot.

Many programs run reassessments on a cadence (annual, quarterly, continuous). The platform supports that pattern with recurring assessment templates that seed a new assessment automatically on schedule.
