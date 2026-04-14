---
title: CycloneDX Attestations
description: An introduction to the CycloneDX Attestations standard (CDXA), the specification that Assessors Studio implements end to end.
---

CycloneDX Attestations, commonly abbreviated CDXA, is an open specification for machine-readable statements of conformance to standards and regulations. It defines a structured way to say *we claim to meet requirement X, here is the evidence that supports the claim, and here is who is standing behind the claim*. Assessors Studio is an implementation of that specification from end to end, which means every concept you encounter in the platform is defined and governed by the spec.

## The problem CDXA solves

Compliance work has historically been document-driven. An auditor hands an operator a spreadsheet of controls. The operator answers each row in prose, attaches PDFs and screenshots into a shared drive, and the auditor writes a report. The result is a narrative that lives in a single document, difficult to query, difficult to compare across assessments, and impossible for downstream systems to verify without manual re-entry.

This approach does not scale. Modern regulations, customer due-diligence questionnaires, and internal risk programs multiply the number of standards an organization must attest against, and each one typically demands a bespoke submission format. Evidence is collected once but produced many times. Findings from one assessment rarely inform the next. And the people consuming the output have no programmatic way to verify that a claim was actually made, by whom, and against which version of a requirement.

CDXA defines a common vocabulary and a common wire format that removes those frictions. Instead of a narrative document, an attestation is a structured object. Instead of PDFs glued to a filesystem, evidence is named, fingerprinted, and linked to the specific claim it supports. Instead of a signed cover page, the attestation itself can carry cryptographic signatures from every party that touched it. Machines can consume the result directly; humans can still read it comfortably, because the format is JSON or XML and the vocabulary is plain.

## What a CDXA document contains

A CDXA document describes a single act of attestation. At a minimum it names the standard it is attesting against, the entity that made the claim, the assessor that evaluated the claim, and the evidence that was considered.

The standard itself is modeled as a requirements hierarchy. A standard has one or more sections, each section has one or more requirements, and each requirement can be decomposed into more granular sub-requirements. The hierarchy is explicit in the document, which means downstream tooling can reason about partial conformance ("we meet Section 3 but not Section 4") without string matching.

A claim is a structured assertion that a specific requirement has been met, partially met, or not met. Each claim references the requirement it concerns and can carry a state, a justification, and a list of supporting evidence.

Evidence is modeled as first-class content. A piece of evidence has a name, a description, a category (observational, interview, artifact, automated), and optionally a content hash so consumers can verify it has not been altered since the attestation was produced. Evidence can be embedded inline or linked to an external store.

Signatories are the parties standing behind the attestation. The specification supports multiple signatories so that, for example, an internal security lead and an external auditor can both sign the same document. Signatures are expressed using the JSON Signature Format (JSF), which preserves a canonical byte stream across re-serialization.

## Where CDXA fits in the CycloneDX family

CycloneDX is a broader specification for machine-readable transparency. CDXA is the branch of the specification concerned with conformance to standards. Other branches handle vulnerability exploitability, cryptographic asset inventories, and machine learning transparency, among others. The pieces share a common metadata model, a common signature format, and a common extensibility story through the property taxonomy, so an organization that invests in one capability can adopt the others without relearning the format.

CycloneDX itself is published by Ecma International as ECMA-424 under a royalty-free patent policy. The reference implementation is a JSON Schema maintained in the open by the OWASP CycloneDX project, with an XML binding that mirrors the JSON model. The full authoritative guide to Attestations is available at [cyclonedx.org/guides](https://cyclonedx.org/guides/).

## Why Assessors Studio exists

CDXA gives the industry a shared format. What it does not give you is a workplace in which to produce and consume that format over time, across dozens of entities, many standards, and a calendar of recurring assessments. Spreadsheets and shared drives collapse the moment the program moves past a single assessment against a single standard.

Assessors Studio is that workplace. Every concept the platform uses is a direct reflection of something CDXA defines: standards, requirements, claims, evidence, attestations, and signatories. When you produce an attestation in the platform, the resulting document is a valid CDXA document that any CycloneDX-aware tool can consume. When you import a standard, it becomes a browsable requirements hierarchy that any number of assessments can be planned against. Nothing is proprietary, nothing is locked in, and everything that leaves the system can be verified independently.
