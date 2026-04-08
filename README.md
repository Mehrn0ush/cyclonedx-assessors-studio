# CycloneDX Assessors Studio

> **Status: Active Development**
> Assessors Studio is currently under active development and is not yet ready for production use.

Assessors Studio is a purpose built platform for operationalizing [CycloneDX Attestations (CDXA)](https://cyclonedx.org/capabilities/attestations/). It enables organizations to perform structured assessments, gather verifiable evidence, assert claims, and issue machine readable attestations using **CycloneDX**, an internationally recognized standard for software and system transparency.

Built for modern assurance workflows, Assessors Studio transforms compliance from static documentation into structured, automatable, and exchangeable artifacts.

## Why CycloneDX Attestations?

CycloneDX Attestations extend traditional SBOMs into formalized claims and verifiable statements. Instead of PDFs, spreadsheets, or point in time audit reports, attestations are machine readable, traceable to supporting evidence, designed for automated validation, and exchangeable across organizational boundaries.

CDXA supports both **electronic signatures** and **digital signatures**, enabling attestations to serve operational, contractual, and legally binding purposes when required.

The model structures assurance around **requirements** (what must be satisfied), **claims** (assertions of conformance), **evidence** (artifacts supporting those claims), and **attestations** (signed statements asserting truthfulness).

## Core Capabilities

### Structured Assessments

Conduct repeatable assessments aligned to defined requirements, with workflow support for contributors, reviewers, and approvers. Role based access control ensures that administrators, assessors, assessees, standards managers, and standards approvers each have appropriate visibility and authority throughout the process.

### Evidence Management

Attach documentation, scan results, test artifacts, third party reports, and other supporting materials directly to claims while preserving provenance and traceability.

### Claim Authoring

Express conformance statements in a standardized format that downstream systems can parse, validate, and automate against. Claims can reference both supporting evidence and counter evidence, with mitigation strategies where applicable.

### Machine Readable Attestations

Generate CycloneDX attestation documents that can be consumed by governance, risk, compliance, procurement, and security automation platforms.

### Electronic and Digital Signatures

Support for both electronic and cryptographic digital signatures enables flexible deployment models, from internal approvals to externally verifiable, legally binding B2B or B2G attestations.

### Standards Library Integration

Import and manage machine readable standards from the growing CycloneDX standards ecosystem. Map internal controls to recognized frameworks, reuse requirement definitions across assessments, and generate attestations aligned to multiple standards simultaneously.

### Customizable Dashboard

A widget based dashboard provides at a glance visibility into assessment activity, compliance posture, and organizational progress. Users can arrange, resize, and configure widgets to match their workflow.

### Internationalization

The interface ships with seven language translations (English, French, German, Spanish, Chinese, Japanese, and Russian) and supports dark and light themes.

## Practical Use Cases

### Regulatory and Policy Compliance

Cyber Resilience Act (CRA) readiness, NIST SSDF alignment, PCI DSS assessments, and internal secure development policy verification.

### Vendor and Supply Chain Assurance

Supplier security posture validation, third party risk documentation, contractual security claim exchange, and automated intake and validation of vendor attestations.

### Secure Development Lifecycle

Secure design confirmation, threat modeling verification, code review attestation, and release readiness approval.

### Product and Platform Transparency

Customer facing trust statements, standardized security posture disclosures, and machine readable product assurance artifacts.

### Executive and Board Reporting

Structured evidence of control maturity, automated compliance dashboards, and audit ready artifact generation.

## Designed for Automation and Interoperability

Because attestations are structured data artifacts, not static documents, they can be validated automatically, electronically or digitally signed, verified independently, integrated into CI/CD pipelines, and exchanged via transparency and assurance ecosystems such as the [Transparency Exchange API](https://tc54.org/tea/).

Assessors Studio enables a shift from narrative compliance to computational, machine verifiable trust.

## Who It's For

Product Security teams, Governance Risk and Compliance (GRC) leaders, Open Source Program Offices (OSPOs), procurement and vendor risk teams, and independent assessors and auditors.

## Technology

Assessors Studio is a full stack web application with a Vue 3 frontend and a Node.js/Express backend. The backend uses Kysely as its query builder and supports both an embedded PGlite database for local development and PostgreSQL for production deployments. The frontend uses Element Plus as its component library with a custom design token system for theming. Both halves are written in TypeScript.

## Getting Started

### Prerequisites

Node.js 24 or later is required.

### Install Dependencies

```bash
npm run install:all
```

### Configure the Backend

```bash
cp backend/.env.example backend/.env
```

Review and update the environment configuration as needed.

### Initialize the Database

```bash
npm run dev:backend
```

The embedded PGlite database is created and migrated automatically on first start.

### Start Development Servers

To start both the backend and frontend simultaneously:

```bash
npm run dev
```

The frontend dev server proxies API requests to the backend, so both must be running for the application to function.

### Build for Production

```bash
npm run build
```

### Run Tests

```bash
npm test
```

### Type Checking

```bash
npm run typecheck
```

## Contributing

Contributions are welcome. Please open an issue to discuss proposed changes before submitting a pull request.

## License

Apache 2.0. See the LICENSE file for details.
