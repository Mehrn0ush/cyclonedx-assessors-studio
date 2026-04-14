---
title: Welcome
description: An overview of this documentation site, who it is for, and how it is organized.
---

Welcome to the CycloneDX Assessors Studio documentation. This site is the reference for installing, operating, and using the Assessors Studio platform. Whether you are standing up the service for your organization, running an assessment campaign, or responding to a request for evidence, the material you need is in one of the sections in the left sidebar.

## Who this documentation is for

The documentation serves four overlapping audiences. Read the section that matches your role today, and come back to the others as your responsibilities grow.

Administrators run the platform. They install containers, configure the database, wire up integrations, manage users and permissions, rotate keys, take backups, and keep the service healthy over time. The Administration and Configuration sections were written for them.

Assessors plan and conduct assessments. They scope an engagement, collect evidence, rate claims, negotiate findings with assessees, and ultimately produce a signed attestation. The User Guide is their primary reference.

Assessees respond to assessments. They attach evidence, answer questions, and track what is outstanding across engagements. The User Guide covers their workflows as well.

Standards owners curate the controls the platform assesses against. They import or author requirements, manage the draft-to-published lifecycle, and decide what appears in the catalog everyone else uses. The Standards sections in both the User Guide and Administration were written for them.

## How this documentation is organized

The Introduction puts the platform in context. It explains the CycloneDX Attestations standard, introduces the key concepts the platform uses, and describes the roles that show up later in the docs.

Getting Started takes a fresh install and walks you through the setup wizard, a guided tour of the interface, and a complete end-to-end assessment so you can see how the pieces fit together.

The User Guide is organized by workflow. Each page covers one capability: dashboards, entities, standards, assessments, evidence and claims, attestations, and notifications.

The Administration section is organized by administrative task. Deployment, initial setup, users and permissions, the standards lifecycle, integrations, storage, encryption, monitoring, backups, and upgrades each have their own page.

Configuration is the exhaustive list of every environment variable the platform accepts, with defaults and production guidance.

Operations covers the day-two concerns: health checks, logs, and a troubleshooting runbook for the most common issues.

The Reference section contains the glossary and release notes.

## How to read this site

Each page is a standalone unit that tells you what a capability does, how to use it, and where to go next. Code blocks contain ready-to-run commands; tables describe every option exhaustively; and callouts flag anything that requires special care in production. Use the search box in the top navigation to jump directly to a topic, or browse the sidebar to skim an area end to end.

If something is unclear, imprecise, or wrong, the edit link at the bottom of every page takes you to the source on GitHub so you can file an issue or open a pull request.

## A note on terminology

Assessors Studio is an implementation of the CycloneDX Attestations standard, part of the broader CycloneDX family of machine-readable transparency formats maintained by OWASP and published by Ecma International as ECMA-424. The terminology in this documentation follows the standard: you will see words like *attestation*, *assessor*, *claim*, *evidence*, *standard*, *requirement*, *declaration*, and *signatory* throughout. The [Glossary](/reference/glossary/) defines each of them precisely, and the [Core Concepts](/introduction/concepts/) page introduces them in context.
