---
title: Evidence and Claims
description: How claims and evidence work together in an assessment, and how to manage the evidence library.
---

Claims and evidence are the unit of work in an assessment. A claim is a structured statement about a requirement; evidence is the material that supports or undermines the claim. This page covers how the two interact, how evidence is collected and reused, and how the evidence library helps a program stay consistent across many assessments.

## Claims

A claim is a structured statement that a specific requirement has been met. Every claim has:

- A state (Pending, Met, Partially Met, Not Met, Not Applicable, Inconclusive, or Evidence Requested while awaiting input).
- A rationale, a short written explanation of the assessor's reasoning.
- An optional set of findings, each describing a specific gap or concern.
- A list of evidence attached to the claim.
- A timeline of every state change, comment, and evidence attachment.

The rationale and findings together form the human-readable narrative of the claim. They are what the downstream consumer of the attestation reads to understand why a claim arrived at its state.

## Evidence

Evidence is first-class content. A piece of evidence has a name, a description, a category, a source, a content hash, and a location. The category classifies what kind of artifact it is: Observational (the assessor saw it directly), Interview (the assessor was told it), Artifact (a file or document), Automated (output of a scan or check), or Reference (a link to external material).

Evidence can be attached directly to a claim or exist independently in the library. Evidence in the library can be linked to new claims in future assessments, which is how a single piece of material can substantiate many related controls without being re-uploaded.

## Attaching evidence to a claim

From the claim detail, click Attach Evidence. A picker offers three options: Upload a new file, Link an existing piece of evidence from the library, or Paste a URL to external material. Every option asks for a name, description, and category.

Files are uploaded through the backend and stored in the configured evidence store (database or S3). When a file arrives, the system computes a SHA-256 hash over its contents and stores the hash alongside the metadata. The hash is what lets a downstream consumer verify the file has not been altered since the attestation was produced.

## The evidence library

Activity → Evidence opens the library. The library shows every piece of evidence you have access to, filterable by category, source, claim, and date. Each row shows the name, the category, a thumbnail when appropriate, a count of claims the evidence supports, and the hash prefix.

The library is searchable by content metadata, by the names and descriptions of the claims that use the evidence, and by tags. A well-curated library lets an assessor find existing material before requesting new material, which in turn reduces the burden on assessees.

## Reusing evidence

When a claim is similar to one that already has strong evidence, reuse the existing evidence instead of requesting new material. From the Attach Evidence picker, choose From Library and search the existing records.

Reuse is tracked: each piece of evidence shows every claim that references it, across every assessment. This is especially valuable for evidence that applies broadly (a signed policy document, an annual third-party audit, a signed vendor certification), because the program gets to see how a single artifact supports many controls.

## Evidence in the attestation

When an attestation is produced, every piece of evidence referenced by a claim is included in the CDXA document: the metadata, the hash, and the category. The file contents are either embedded in the document (for small evidence) or linked (for large evidence or evidence stored in an external system). Either way, a consumer can verify the file they receive matches the hash in the attestation.

The evidence representation in the attestation is deterministic. The same evidence record produces the same output, which means reviewers can diff two attestations and see exactly what changed between them. This is one of the practical reasons to favor the structured, hash-anchored evidence model over an unstructured document.

## Sensitive evidence

Some evidence contains sensitive information that should not leave the system with the attestation. Evidence can be marked Confidential. Confidential evidence is referenced in the attestation by metadata and hash, but its contents are not embedded; the consumer receives a pointer and must obtain the file through a separate channel if they need it.

Confidential evidence is still hashed, so the consumer can verify the pointer resolves to the same file that was in the system at the moment of attestation. This pattern is common for material that is under NDA or that contains customer data.
