---
title: Glossary
description: Definitions of the terms used throughout Assessors Studio and the CycloneDX Attestations standard.
---

This glossary is alphabetical. Terms that belong together are cross referenced so you can follow the trail from any starting point.

## Assessment

The workspace where a standard is applied to an entity over a defined scope and period. An assessment ties together an entity, a standard, an assessor team, an assessee team, a schedule, and the claims that result from evaluating each requirement in the standard. Assessments move through a defined [lifecycle](#assessment-lifecycle) (New, Pending, In Progress, On Hold, Cancelled, Complete, Archived) and produce an [attestation](#attestation) when complete.

## Assessment lifecycle

The state machine that governs an [assessment](#assessment). Valid states are New (created but not started), Pending (awaiting prerequisites), In Progress (active claim work), On Hold (temporarily paused), Cancelled (abandoned), Complete (all claims finalized, read only), and Archived (permanently sealed). Key transitions: start moves New to In Progress, complete moves In Progress to Complete, reopen moves Complete back to In Progress, and archive moves Complete to Archived. Archived is irreversible. See [Assessments](/user-guide/assessments/) for the full workflow.

## Assessor

A person or organization that performs an [assessment](#assessment). Assessors work through each requirement of the standard, evaluate evidence, and rate each [claim](#claim). The term also refers to the application role that grants the permissions needed to do that work.

## Assessee

A person or organization whose systems, products, or processes are being assessed. The assessee supplies the [evidence](#evidence) that a claim is met or not met. The application role of the same name grants permissions to respond to evidence requests and view progress on assessments the user is part of.

## Attestation

A signed, tamper evident record that captures the outcome of an assessment. An attestation contains the standard that was evaluated, the entity that was assessed, every claim with its rating and evidence references, the signatories who signed it, and the provenance chain that proves what the application did. Attestations are serialized as CDXA JSON documents and can be verified by any CycloneDX aware tool.

## Audit log

The append only record of every permission sensitive action in the application: user creation, role change, standard publication, attestation signing, encryption key rotation, and more. The audit log is stored in the database and retained per `AUDIT_LOG_RETENTION_DAYS`.

## Catalog

A named grouping of standards. A standard can belong to more than one catalog. Catalogs control which standards appear in the default view when planning an assessment.

## CDXA

Short for CycloneDX Attestations. The open standard maintained by the Ecma TC54 technical committee and the OWASP CycloneDX project that defines the data model for attestations, the evidence they reference, and the signing mechanism that makes them tamper evident. CDXA is the format Assessors Studio reads, writes, and signs. See [CycloneDX Attestations](/introduction/cyclonedx-attestations/) for the introduction.

## Claim

A statement about whether a specific requirement is met by a specific entity. Claims are the atomic unit of an assessment; an assessment is a set of claims. Each claim has a rating (met, not met, not applicable, compensating control, under review), optional commentary, and one or more pieces of evidence that support the rating.

## Content hash

The cryptographic hash of an evidence file, computed at upload and stored alongside the metadata. The hash is included in the attestation so downstream consumers can verify that the bytes they receive match the bytes that were signed.

## DEK

Data Encryption Key. The innermost key in the envelope encryption scheme. DEKs encrypt individual record values and are themselves wrapped by the [KEK](#kek). See [Encryption at Rest](/administration/encryption-at-rest/).

## Entity

A real world subject of assessment: a product, a service, a vendor, a subsidiary, a business unit, or any other unit the organization wants to evaluate. Entities form a hierarchy; an assessment of a parent entity can inherit claims from assessments of its children.

## Evidence

The artifact that supports or refutes a claim. Evidence can be a screenshot, a configuration export, a policy document, a scan result, a third party certification, or any other file. Every evidence file is content hashed at upload.

## Group

A named collection of users. Role assignments and scope restrictions can be applied to a group, making it easier to manage permissions for teams.

## JSF

JSON Signature Format. The signature scheme used by CDXA attestations. JSF defines how a JSON document is canonicalized and signed so that any implementation can verify the signature without additional configuration.

## KEK

Key Encryption Key. The middle layer in the envelope encryption scheme. The KEK unwraps [DEKs](#dek) and is itself wrapped by the [MEK](#mek). The KEK rotates on a regular cadence.

## MEK

Master Encryption Key. The outermost key in the envelope encryption scheme, held in the process environment as `MASTER_ENCRYPTION_KEY`. The MEK unwraps the KEK and is never used directly on record values.

## OWASP

The Open Worldwide Application Security Project. The nonprofit that sponsors CycloneDX and, by extension, Assessors Studio.

## Permission

A named capability in the application. Every action is gated by a permission key (for example `assessments.create`, `claims.rate`, `admin.encryption.rotate`). Permissions are granted through [roles](#role); they cannot be granted directly to users.

## Project

An organizational container that groups related [assessments](#assessment) under a shared set of [standards](#standard), a timeline, and an aggregate dashboard. Projects are useful for coordinated compliance initiatives, annual reviews, vendor onboarding cycles, or any engagement that spans multiple assessments. Projects have their own lifecycle states (New, In Progress, On Hold, Complete, Operational, Retired) and can be exported as a consolidated CycloneDX attestation or a summary report. See [Projects](/user-guide/projects/) for the full guide.

## Project state

The lifecycle position of a [project](#project). Valid states are New (just created), In Progress (active work), On Hold (paused), Complete (objectives met), Operational (long running continuous program), and Retired (archived, read only).

## Requirement

A single normative statement in a [standard](#standard). Requirements form a hierarchy: a top level requirement can have children that decompose it into smaller obligations. Each requirement has a stable ID, a textual statement, optional metadata, and references to authoritative documents.

## Role

A named bundle of [permissions](#permission). Users are assigned one or more roles, and their effective permissions are the union of the permissions granted to those roles. The platform ships with a set of default roles (Administrator, Assessor, Assessee, Standards Manager, Standards Approver, Auditor) and supports custom roles.

## Scope

The boundaries of an assessment. Scope includes the entity being assessed, the time period the evaluation covers, which requirements of the standard are in play, and which groups of users have access.

## Signatory

A person or service identity authorized to sign an attestation. Signatories have cryptographic signing keys stored encrypted in the database. A signatory's signature is included in the attestation's JSF signature block.

## Standard

A catalog entry composed of a hierarchy of requirements. Standards are authored through a draft, review, and publication lifecycle. A published standard is immutable; updates produce a new version that supersedes the previous one.

## Standards Manager

The application role that can create and edit standards through the draft lifecycle. Standards managers cannot publish standards; publication requires a [Standards Approver](#standards-approver).

## Standards Approver

The application role that reviews and publishes standards. Approvers sign off on a standard after a standards manager has completed it.

## Superseded

The state of a previously published standard that has been replaced by a newer version. Superseded standards remain available for historical assessments but are hidden from the default catalog view for new assessments.

## Tamper evident

A property of a record whose contents cannot be changed without detection. CDXA attestations are tamper evident because every field, including evidence hashes, is covered by the JSF signature. Modifying any field breaks the signature.

## VDR / VEX

Vulnerability Disclosure Report and Vulnerability Exploitability eXchange. Two related CycloneDX formats that describe vulnerabilities in a product. Not directly produced by Assessors Studio, but can be attached as evidence to a claim whose requirement asks about vulnerability management.
