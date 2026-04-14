---
title: Your First Assessment
description: An end-to-end walkthrough that takes you from a freshly installed system to a signed attestation.
---

This walkthrough takes you from a freshly installed Assessors Studio to a signed CDXA attestation. It takes about twenty minutes on an empty system and exercises every major surface of the platform. Use it as a learning exercise first; use it as a template when you plan your first real engagement.

By the end you will have: imported a standard, enrolled an entity, planned an assessment, collected a piece of evidence, rated a claim, and produced a signed attestation you can download.

## Prerequisites

You have completed the [First Login](/getting-started/first-login/) wizard and are signed in as an administrator. The system is reachable at its configured URL, and you have one small PDF or screenshot ready to use as sample evidence (anything will do; it is only for the walkthrough).

## Step 1: Import a sample standard

You can author a standard from scratch, but for the walkthrough import one to save time. The CycloneDX project publishes small example standards in CDXA format at [cyclonedx.org](https://cyclonedx.org/). Download one of them to your desktop.

In Assessors Studio, navigate to Catalog → Standards, click New, and choose Import. Drop the file onto the form. The system reads the standard's name, version, and requirements tree directly from the file, so you do not need to re-enter them. Review the summary and click Import.

The standard lands in Draft state. Open it, click Submit for Approval, then (because you are an administrator) Approve and Publish. The standard now appears in the catalog and is assessable.

## Step 2: Enroll an entity

Navigate to Catalog → Entities, click New Entity, and create a simple entity. For the walkthrough, use a name like "Walkthrough Product" and a type of "product". You can leave the optional metadata blank; real entities will usually carry a description, an owner, and links to related systems.

Save the entity. It now appears in the entities directory and can be used in assessments.

## Step 3: Plan an assessment

Navigate to Activity → Assessments and click New Assessment. In the form:

1. Select the entity you just created as the subject.
2. Select the standard you imported as the reference.
3. Choose yourself as the assessor. Leave the assessee fields blank for the walkthrough; you are playing both roles.
4. Set a short scope ("Walkthrough assessment for the getting-started guide") and a target completion date a week from today.

Save the assessment. It opens in the New state. Click Start to move it to In Progress. The system loads the requirements from the standard and creates a claim placeholder for each one.

## Step 4: Work a single claim

Open the assessment detail page. The left side shows the requirements tree; the right side is the detail pane for the currently selected requirement. Navigate to any requirement in the tree.

The detail pane shows the requirement text, the current claim state (Pending), space for a rationale, and an Evidence section. Write a one-paragraph rationale explaining why you believe this requirement is met ("Encryption is enforced in the load-balancer configuration; see attached screenshot"). Click Save.

## Step 5: Attach a piece of evidence

In the Evidence section of the claim, click Attach Evidence. Choose Upload and select the PDF or screenshot from your desktop. Enter a name and a category (Artifact works for a screenshot). Save.

The system hashes the file, stores it in the configured evidence store (database or S3, depending on your configuration), and links it to the claim you are working on. The evidence now appears in the library and can be reused on future claims.

## Step 6: Rate the claim

Change the claim state from Pending to Met and click Save. The timeline on the claim records the state change and attributes it to you.

For the walkthrough you can leave the remaining claims unrated, or batch-mark them as Not Applicable to simulate a completed assessment. In a real engagement every claim would go through the same cycle.

## Step 7: Complete the assessment

From the assessment detail page, click Complete. The system checks that every claim has a final state (Met, Not Met, Partially Met, Not Applicable, or Inconclusive). If any are still Pending, the action is blocked with a list of the offenders. For the walkthrough, set any remaining claims to Not Applicable, then try again.

The assessment moves to the Complete state. Its claims and evidence are now read only, and a conformance score is calculated.

## Step 8: Produce the attestation

On a completed assessment, click Produce Attestation. The system generates the CDXA document, displays a preview of the claims and signatories, and invites you to sign. Click Sign. The system applies a JSF signature with your user's signing key and presents the signed document.

Click Download to retrieve the JSON file. Open it in any text editor and you will see a well-formed CycloneDX document containing the standard reference, every claim you made, the evidence you attached, and your signature block.

## What you just did

In twenty minutes you:

- Imported a standard and published it through the lifecycle.
- Enrolled an entity.
- Planned an assessment and created claims from a requirements tree.
- Worked a claim end to end, including attaching reusable evidence.
- Signed and exported an attestation in the CDXA format.

That is the platform in miniature. Everything else in the documentation is about doing the same things at scale, with collaboration, integrations, and the operational practices that make it safe to run in production.

## What to read next

Head into the [User Guide](/user-guide/dashboards/) to learn the capabilities in depth, or into [Administration](/administration/deployment/) to prepare a production deployment.
