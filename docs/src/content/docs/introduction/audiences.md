---
title: Who It Is For
description: The three organizational audiences Assessors Studio was built for, and the roles inside each that use the platform day to day.
---

Assessors Studio was built with three organizational audiences in mind. Every feature in the platform serves at least one of them, and the docs are organized so each audience can quickly find what they need.

## Self-assessors

The first audience is organizations that want to assess themselves, and measure their own security and compliance maturity over time. Internal security teams, compliance programs, and privacy offices all fall into this category. They want a consistent way to track how their controls score against the standards that matter to them, whether those standards are industry frameworks, regulatory obligations, or their own internal baselines, and they want the ability to see progress across quarters and years rather than a snapshot that is out of date the moment it is produced.

For self-assessors, Assessors Studio replaces the spreadsheet-and-shared-drive workflow that most programs start with. Each internal assessment is a first-class record with history, evidence, and a signed attestation that can be reproduced on demand. A program that reassesses a product every quarter accumulates four attestations a year that can be diffed against each other, reviewed together, and compared across peer products without manual re-entry.

## Third-party assessors

The second audience is the organizations and individuals who perform assessments on behalf of others. External auditors, qualified security assessors, vendor risk teams, penetration testers who assess against a framework, and the consultancies that specialize in specific regulations all fall here. Their output is an attestation delivered to a client, and the efficiency of their practice depends on being able to run many assessments in parallel without losing consistency.

For third-party assessors, Assessors Studio is a workbench that accommodates multiple concurrent engagements, each with its own scope, team, schedule, and deliverables. Evidence is reusable across engagements for the same client, which reduces the amount of material the client has to produce. Attestations produced by the platform are delivered in the CDXA format, which means the client can hand them to their own downstream consumers without having to ask the assessor to re-export.

## Supply chain consumers

The third audience is the consumers in a supply chain who want machine-readable attestations from their vendors rather than static PDFs. A buying organization that evaluates dozens of vendors per year cannot realistically re-read a bespoke PDF from each one, extract the controls, and judge whether the vendor meets their needs. Structured attestations let the buying organization automate the parts of vendor risk assessment that are genuinely repetitive, and focus human attention on the parts that require judgment.

For supply chain consumers, Assessors Studio is the receiving end of the chain. Attestations arrive as CDXA documents, are stored in a searchable catalog, and can be evaluated against the consumer's internal criteria programmatically. When a vendor reassesses, the new attestation is diffed against the prior one automatically, and anything material is flagged for human review. The consumer's own internal program (a vendor risk baseline, a regulatory reporting requirement) can then consume the vendor data as a dependency, rather than re-collecting it from scratch.

## How these audiences fit together

The three audiences are not exclusive. A single organization is often all three at once. A bank assesses itself against PCI-DSS (self-assessor), engages a qualified assessor to sign off on that assessment (third-party assessor), and ingests attestations from its software vendors to meet its own supply-chain obligations (supply chain consumer). Assessors Studio supports each of those roles in the same installation; the structure of the platform does not force a choice.

This is the broader vision. CDXA gives the industry a common format. Assessors Studio gives each of these audiences a shared workplace that speaks that format natively, so the attestations that flow between them are portable, verifiable, and reusable rather than static documents that end their life the moment they are delivered.

## Roles inside each audience

Within any of the three audiences, the same four roles show up. Understanding who in your organization plays each role helps you orient the rest of the docs to the people who will actually use the platform.

Producers (called *assessees* in the UI) are the people who produce the evidence: engineers, product managers, vendor managers, operators. They respond to requests and attach material. The User Guide is their primary reference.

Assessors are the people who plan and carry out the assessment. In a self-assessor they are the internal security or compliance team; in a third-party assessor they are the auditor or consultant; in a supply chain consumer they are the reviewer who evaluates incoming attestations against internal criteria. The User Guide is also their primary reference.

Standards owners curate the requirements catalog. They import or author the standards the organization assesses against and shepherd them through the draft-to-published lifecycle. The Standards sections in the User Guide and in Administration were written for them.

Administrators run the platform: installation, upgrades, user and permission management, integrations, backups, and key rotation. The Administration and Configuration sections were written for them.

A single user can play multiple roles. A small organization often has one person covering all four; a large organization typically separates them across a team.
