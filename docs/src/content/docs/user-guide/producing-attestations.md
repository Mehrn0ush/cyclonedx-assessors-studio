---
title: Producing Attestations
description: Generate, sign, and distribute a CDXA attestation at the end of an assessment.
---

An attestation is the finished artifact an assessment produces. It is a CDXA JSON document that contains every claim, every piece of evidence, the people who signed it, and enough provenance metadata for a downstream consumer to verify the document independently. This page covers the generation workflow.

## When to produce the attestation

Attestations are produced from Completed assessments. If the assessment is still in Review or In Progress, the Produce Attestation action is disabled. Completing the assessment is a deliberate forward-only transition, because the attestation's value depends on the underlying claims being final.

## Generating the document

From a Completed assessment, click Produce Attestation. The system gathers:

- The reference to the standard and the specific version the assessment evaluated against.
- Every claim, with its final state, rationale, findings, and the evidence attached to each.
- The identity of the assessor and the assessee teams.
- The timestamps for planning, completion, and attestation.
- A list of signatories who will sign the document.

A preview is shown before anything is written. The preview renders the attestation as a readable document, with claims grouped by section. Review it like you would any important artifact: the content is what the downstream consumer sees.

## Signing

The sign step applies a cryptographic signature in the JSON Signature Format (JSF) specified by CycloneDX. JSF operates over a canonical byte serialization, which means the signature verifies regardless of whether the document is re-serialized or re-encoded by an intermediate system.

Each signatory on the assessment team signs in turn. The system tracks who has signed and prompts the next signatory until every required signature is applied. A signature block in the document records the signatory's name, role, timestamp, and public key.

The signing keys themselves are managed by the platform. The [Key Management](/operations/key-rotation/) page covers how keys are created, rotated, and retired. If your installation uses an external signing service (HSM, cloud KMS), the signing step delegates to it through the configured integration.

## Downloading and distributing

Once signed, the attestation is available in three forms:

- As a downloadable JSON file (the CDXA document itself).
- As a stable URL on the platform that returns the same JSON document.
- As an inline summary page that renders the attestation for human readers.

Distribution is up to the program. Typical targets are:

- A customer's assurance portal, which consumes the JSON directly.
- A regulator's submission system, which accepts the JSON as an attachment.
- An internal repository (wiki, SharePoint, object storage) as a historical record.
- A downstream automation system (vendor risk platform, attestation registry) that ingests the JSON on a schedule.

The stable URL makes it easy to give consumers a reference that always resolves, even if the underlying file is relocated. Access to the URL is governed by the platform's normal authentication and authorization; you can also issue a scoped, read-only token that lets a specific consumer fetch the attestation without an interactive sign-in.

## Verifying an attestation

Any consumer can verify an attestation without depending on Assessors Studio. The steps are:

1. Fetch the CDXA document.
2. Extract the signatures and the signed content.
3. Verify each signature against the signatory's public key.
4. For each piece of evidence cited by hash, fetch the file and compare the hash.

Because the document uses standard formats (JSON, JSF, SHA-256), every step is accomplished with off-the-shelf tooling. This is the point of the attestation: it is useful far beyond the producing organization.

## Re-issuing an attestation

An attestation is immutable. If an error is discovered after an attestation has been issued, the correct response is to issue a new attestation that supersedes the old one. The new attestation references the one it supersedes in its provenance metadata, which lets downstream consumers distinguish a correction from an unrelated reassessment.

Do not edit the underlying assessment and re-sign. The platform does not allow that: a Completed assessment's claims are frozen. The reason is that a downstream consumer who already has the old attestation needs the old document to remain verifiable as it was.

## Archiving

Attestations are retained indefinitely by default. Retention is configurable per standard or per entity, but the system never silently deletes an attestation; you must explicitly authorize archival. Archived attestations remain in the system with a special status so historical URLs continue to resolve.
