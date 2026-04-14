---
title: Assessments
description: Plan, run, and finalize an assessment against a published standard.
---

An assessment is a scoped engagement that evaluates one entity against one standard. This page walks through the lifecycle of an assessment from planning to sign-off, and covers the workflows an assessor uses day to day.

## The assessment lifecycle

Every assessment moves through four states: Planned, In Progress, Review, and Completed. The state machine is deliberate: a claim state cannot regress from Completed back to In Progress without an explicit reopen action, because the integrity of the audit trail depends on forward-only transitions.

Planned is the initial state. The assessment has a scope, a team, and a reference to a specific version of a standard, but the assessor has not yet started working through claims. The assessor opens the assessment and moves it to In Progress when work begins.

In Progress is the active state. The assessor navigates the requirements tree and works each requirement, drafting claims, requesting evidence, and recording the reasoning. The assessee responds to requests, attaches evidence, and clarifies questions. Both parties collaborate inside the same assessment; there is no back-and-forth over email because everything happens inside the record.

Review is the state between work-is-done and sign-off. The assessor moves the assessment to Review once every claim has a final state (Met, Partially Met, Not Met, Not Applicable, or Inconclusive). The reviewer (often a senior assessor, sometimes the entity owner) reads the claims in aggregate and checks that the narrative is consistent, the evidence is sufficient, and the conclusions are defensible. The reviewer can send the assessment back to In Progress with comments if something is not ready.

Completed is the terminal state. A completed assessment is an immutable historical record. Its claims and evidence can no longer be edited, which is precisely what a downstream consumer of the attestation wants. If the entity is later reassessed against the same standard, a new assessment is created; the old one is preserved.

## Planning an assessment

From Activity → Assessments, click New Assessment. The form captures the subject (entity), the reference (standard and version), the scope, the schedule (start and target completion dates), and the team. The team is a list of users with roles inside the assessment: Assessor, Reviewer, and Assessee. A single user can play multiple roles if the installation's permission model allows it.

When you save the form the system creates a claim placeholder for every requirement in the standard. The assessment opens in Planned state; move it to In Progress to begin.

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

To move an assessment to Review, every claim must have a final state. The Complete action checks the condition and lists any claims that still need attention if it cannot succeed. Once in Review, the designated Reviewer walks through the assessment and signs off.

Signing off moves the assessment to Completed. The Produce Attestation action on a completed assessment generates the CDXA document. See [Producing Attestations](/user-guide/producing-attestations/) for the signing and export workflow.

## Reassessing

Reassessment is not an in-place update. It is a new assessment that references the same entity and the same standard (possibly at a new version). The previous assessment remains in the historical record with its completed attestation intact. The new assessment inherits no claim state from the previous one; every claim starts fresh. This is by design, because CDXA attestations are snapshots in time, and a new assessment represents a new snapshot.

Many programs run reassessments on a cadence (annual, quarterly, continuous). The platform supports that pattern with recurring assessment templates that seed a new assessment automatically on schedule.
