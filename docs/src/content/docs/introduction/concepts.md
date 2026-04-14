---
title: Core Concepts
description: The vocabulary Assessors Studio uses, introduced in the order they appear in a typical engagement.
---

This page introduces the concepts that appear throughout the platform and the rest of the documentation. The vocabulary matches the CycloneDX Attestations specification, so the terms you learn here carry over to any other CDXA-aware tool.

## Standard

A standard is a named, versioned collection of requirements that an entity can be assessed against. Examples include internal security baselines, regulatory frameworks, customer due-diligence questionnaires, and industry specifications. In Assessors Studio, a standard lives in the catalog once it has been published; before that it sits in draft or review.

A standard is identified by a name, an owner, and a version. Different versions of the same standard coexist, which means an active assessment against version 2.1 is not disrupted when version 2.2 is published.

## Requirement

A requirement is a single testable statement inside a standard. "The service encrypts data in transit using TLS 1.2 or higher" is a requirement. Requirements are organized into a tree: a top-level requirement can have sub-requirements, which in turn can have sub-requirements, and so on. The tree structure lets authors decompose a single control into concrete, verifiable pieces without losing the context that ties them together.

Each requirement carries a stable identifier that survives renaming, which makes it safe to reference a requirement across many assessments and many versions of the standard.

## Entity

An entity is the subject of an assessment. It is whatever the organization decides to assess: a product, a service, a vendor, a business unit, a physical site, a supplier, or a single system. Entities are modeled as first-class records with their own metadata, relationships, and history.

Entities can be related to each other. A product entity might depend on a service entity that depends on a vendor entity. The [Entities](/user-guide/entities/) page explains how the relationship graph is navigated in the UI.

## Assessment

An assessment is a scoped engagement that evaluates one entity against one standard over a defined period. It has a start date, an end date, a team of participants (assessors and assessees), and a state machine that tracks whether it is being planned, executed, reviewed, or completed.

An assessment produces one or more claims, and ultimately, when the participants sign off, it produces an attestation. Multiple assessments can exist for the same entity against the same standard at different points in time; the platform treats them as distinct historical records.

## Claim

A claim is the assessor's structured assertion about a single requirement inside an assessment. A claim has a state (met, partially met, not met, not applicable, inconclusive), a rationale written by the assessor, and a list of supporting evidence.

Claims are the unit of collaboration in the platform. An assessor drafts a claim, an assessee responds with evidence or clarification, the assessor revises the claim, and so on until the claim reaches a final state. Every change is recorded so the journey from first draft to final state is auditable.

## Evidence

Evidence is the supporting material a claim rests on. It can be a document uploaded to the system, a link to a document in an external system, an interview note, a configuration snippet, a scan output, or any other artifact that substantiates (or undermines) the claim.

Each piece of evidence has a category, a description, and optionally a content hash so a downstream consumer can verify it has not changed since the attestation was produced. Evidence is reusable: the same piece can support multiple claims in multiple assessments, with the system tracking every use.

## Attestation

An attestation is the finished artifact the assessment produces. It is a CDXA JSON document that records every claim made, the evidence that supports each claim, the team that conducted the assessment, the signatories that stood behind it, and the provenance of the attestation itself.

Attestations are what leaves the system. A regulator, a customer, or a downstream automation consumes the attestation, not the platform's internal state. The [Producing Attestations](/user-guide/producing-attestations/) page walks through how the finished document is generated.

## Signatory

A signatory is a party that has signed an attestation. Signatures are expressed in the JSON Signature Format (JSF) that CDXA specifies, which means a downstream consumer can verify a signature without depending on Assessors Studio at all. Multiple signatories can sign the same attestation, which is how joint attestations by an internal lead and an external auditor are modeled.

## Role

A role is a bundle of permissions that governs what a user can do in the platform. The default roles are administrator, assessor, assessee, standards manager, and standards approver. Every role is defined as a set of permissions, and the permissions themselves are the authoritative mechanism the system uses to grant or deny access; the role name is only a user-facing label. The [Users and Permissions](/administration/users-and-permissions/) page documents the full set of roles and permissions.

## Where these concepts live in the platform

Standards, requirements, entities, assessments, claims, evidence, and attestations each have a dedicated area in the navigation. The [Tour](/getting-started/tour/) page shows you where each one lives. The [User Guide](/user-guide/dashboards/) covers each in depth with screenshots and common workflows.
