---
title: What is Assessors Studio
description: An overview of the CycloneDX Assessors Studio platform, the workflows it supports, and the outcomes it produces.
---

CycloneDX Assessors Studio is the open source workplace for producing and consuming CycloneDX Attestations. It is a self-hosted web application that takes an organization from a blank requirements catalog to signed, verifiable attestations, without forcing anyone to learn the file format by hand.

The platform is sponsored by OWASP and maintained as part of the broader CycloneDX ecosystem. It is released as a single container image under the Apache 2.0 license.

## Who it was built for

Assessors Studio was designed around three organizational audiences, and every feature in the platform supports at least one of them.

The first audience is self-assessors: organizations that want to assess themselves and measure their security and compliance maturity over time. Internal security teams, compliance programs, and privacy offices use the platform to replace the spreadsheet-and-shared-drive workflow that most programs start with. Each internal assessment becomes a first-class record with history, evidence, and a signed attestation that can be reproduced on demand.

The second audience is third-party assessors: the organizations and individuals who perform assessments on behalf of others. External auditors, qualified security assessors, vendor risk teams, and consultancies use the platform as a workbench that accommodates many concurrent engagements, each with its own scope, team, schedule, and deliverables.

The third audience is supply chain consumers: buyers who want machine verifiable attestations from their vendors rather than static PDFs. A supply chain consumer uses the platform as the receiving end of the chain, storing incoming attestations in a searchable catalog and evaluating them against the consumer's internal criteria programmatically.

A single organization is often all three at once. A bank assesses itself against PCI-DSS, engages a qualified assessor to sign off on that assessment, and ingests attestations from its software vendors to meet its own supply chain obligations. Assessors Studio supports each of those roles in the same installation. The [Who it is for](/introduction/audiences/) page goes deeper on each audience and the roles inside them.

## What the platform is

At its core Assessors Studio is four things stacked together. It is a catalog of standards, each modeled as a hierarchy of requirements. It is a directory of entities, the real-world subjects of an assessment such as products, services, vendors, or business units. It is an assessment workbench, where an assessor and an assessee collaborate on claims and evidence against one standard for one entity over a scoped period of time. And it is a publisher, which takes a completed assessment and turns it into a signed CDXA attestation suitable for regulators, customers, or downstream tooling.

Everything in the platform is designed to be both human-usable and machine-consumable. Requirements are displayed as a tree you can navigate, but the underlying model is a graph the system can query programmatically. Evidence is uploaded through a friendly picker, but the backend stores a content hash alongside each file so tampering is detectable. Attestations are rendered as a readable summary in the UI, but the authoritative artifact is the CDXA JSON document the system exports.

## What the platform does

Standards owners bring the catalog to life. They import an existing standard in CDXA format, or author one from scratch, and walk it through a draft-to-published lifecycle so other users can consume it. Once published, a standard becomes available to every assessment that needs it.

Administrators enroll entities. An entity can be anything that might be assessed: a product, a service, a vendor, a subsidiary, a single control. Entities can be nested and cross-referenced, which lets an organization model how a parent assessment of a product inherits or diverges from assessments of its underlying services.

Assessors plan assessments. An assessment ties an entity to a standard, with a scope, a schedule, and a team. The assessor works claim by claim through the requirements hierarchy, marking each as met, not met, or not applicable, attaching the evidence that supports the conclusion.

Assessees collaborate on the evidence. They are the people who actually have the screenshots, configurations, policy documents, and third-party certifications that prove (or disprove) conformance. The platform gives them a dedicated view of every open request so nothing is lost.

Finally, when the assessment is complete, a signatory produces the attestation. The system renders a signed CDXA document that contains the full set of claims, the underlying evidence, the people who signed it, and a provenance chain that lets consumers verify what the system did.

## What the platform produces

The primary output is the attestation itself, a CDXA JSON document that is valid against the published CycloneDX schema. The document can be downloaded, attached to an email, committed to a repository, or published through an API to a downstream consumer. Because the format is the standard, it is portable: any CycloneDX-aware tool can ingest it without a custom integration.

The platform also produces human-friendly outputs for internal use. Dashboards roll up progress across assessments. Reports summarize findings and their trajectory. Notifications let the people who care about a specific claim or a specific entity know when something changes. None of those outputs are a replacement for the attestation itself; they are operational views on the same underlying data.

## What the platform is not

Assessors Studio is not a GRC replacement. Organizations that already run a mature GRC platform can use Assessors Studio as a specialized front door for CDXA-compliant assessments without giving up the rest of their program. The system is designed to exchange data with other platforms, not to absorb them.

The platform is not a vulnerability scanner or a configuration assessor. It consumes evidence produced by those tools; it does not replace them. If a control requires a specific scan to be run, the scanner runs, and its output is attached as evidence of the claim.

The platform does not prescribe a specific maturity model, risk methodology, or scoring convention. CDXA is intentionally neutral on those questions, and Assessors Studio inherits that neutrality. What you assess, how you score, and what you do with the results are yours to decide; the platform makes it easy to record them consistently.

## Architecture in one minute

Assessors Studio ships as a single container image that serves both the Vue 3 single-page application and the JSON API on the same origin. The backend is a Node.js service written in TypeScript, using Express for HTTP, Kysely for database access, and argon2id for password hashing. The database is either an embedded PGlite instance (for evaluation and small installations) or external PostgreSQL 17 (for production). Evidence can be stored in the database itself or in any S3-compatible object store.

The container listens on port 3001 by default and exposes a health endpoint, a Prometheus metrics endpoint, and the full API under a versioned prefix. The [Deployment](/administration/deployment/) page covers the full topology, including how to place the container behind a reverse proxy that terminates TLS.
