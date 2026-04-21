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

The sign step applies a cryptographic signature in the JSON Signature Format (JSF) specified by CycloneDX. JSF operates over a canonical byte serialization (RFC 8785 JCS), which means the signature verifies regardless of whether the document is re-serialized or re-encoded by an intermediate system. The platform's signer is the `@cyclonedx/jsf` package, an in-house JSF implementation that has been verified against the node-webpki.org reference fixtures.

Each signatory on the assessment team signs in turn. The system tracks who has signed and prompts the next signatory until every required signature is applied. A signature block in the document records the signatory's name, role, organization, timestamp, and either the cryptographic signature material or an electronic signature reference.

### Signature material

Signature material is managed per user on the My Signatures section of the profile page. A user can add two kinds of material:

Digital signatures use asymmetric cryptography. The user uploads or pastes a private key in JWK or PEM form, or the platform generates one for them. Supported algorithms cover RSA (RS256, RS384, RS512, PS256, PS384, PS512), ECDSA (ES256, ES384, ES512), and EdDSA (Ed25519, Ed448). The private key is encrypted at rest using the platform's Data Encryption Key envelope and the corresponding public key is embedded in the CycloneDX signatory block on every attestation the user signs. A digital signature produces a detached JSF signature over the canonical hash of the attestation body.

Electronic signatures describe an external signing event, typically one captured by a DocuSign style flow. The user records a signatory name, optional role and organization, and a URI that resolves to the external signing record. The attestation's signatory block includes this as an `externalReference` of type `electronic-signature` rather than a cryptographic signature value.

When you click Sign on an attestation, the dialog first lists every signature record you own. Choose the one you want to apply. Digital records sign in place and embed the JSF envelope; electronic records embed the external reference and rely on the external system for the signing event.

### Managing your signatures

The My Signatures section on your profile page is the management surface for signature material. Add new signatures, rotate keys on existing ones, and retire material you no longer trust from this page. The list shows the signature's type (electronic or digital), the algorithm for digital signatures, the created and last used timestamps, and a count of attestations that cite it. Deleting a record does not revoke signatures already applied to attestations; those remain verifiable using the embedded public key.

Digital signature private keys never leave the platform's encryption envelope. Admins with the encryption rotation permission can cycle the Data Encryption Key that wraps them without any user action required. The public key travels with every signed attestation, so a downstream consumer only needs the attestation itself to verify.

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

### Exporting a standalone document

The attestations list offers an Export action on every record. Export produces a standalone CycloneDX document that can be verified without any further data from the platform: the standard reference, the requirements evaluated, every claim with its state and rationale, the signatory blocks, and the signature envelopes are all inlined.

By default, export emits CycloneDX 1.7. Append `?spec=1.6` to the export URL, or choose 1.6 from the export dialog, when the consuming system does not yet support 1.7. The fallback downgrades the `specVersion` field and the schema URL in the document header; the attestation payload itself is representable in both versions, so the content does not change. Use 1.7 as the default for new integrations and reserve 1.6 for pipelines that have a documented version pin.

The downloaded file's `Content-Type` is `application/vnd.cyclonedx+json` and the filename includes the attestation ID and the spec version, which makes it easy to archive multiple exports of the same attestation side by side.

## Verifying an attestation

Any consumer can verify an attestation without depending on Assessors Studio. The steps are:

1. Fetch the CDXA document.
2. Extract the signatures and the signed content.
3. Verify each signature against the signatory's public key.
4. For each piece of evidence cited by hash, fetch the file and compare the hash.

Because the document uses standard formats (JSON, JSF, SHA-256), every step is accomplished with off the shelf tooling. This is the point of the attestation: it is useful far beyond the producing organization.

### Verify inside Assessors Studio

The attestations list includes a Verify action on every signed row. Verify is a convenience for producers and internal reviewers who want to confirm that the attestation on the platform still matches the signed payload. A user must hold the `attestations.verify` permission to see the action.

Verify runs four checks server side and returns a structured result:

1. It recomputes the canonical hash of the attestation body using the same JCS serialization the signer used, and compares it to the hash stored at the moment of signing. If the two hashes disagree the payload has drifted and the result is marked as not verified.
2. For digital signatures it runs the detached signature through the `@cyclonedx/jsf` verifier using the embedded public key. The result reports the signature type, whether the payload matched, and whether the cryptographic signature validated.
3. For electronic signatures it confirms that the external reference is still intact and reports the signature type. The verifier does not attempt to reach out to the external signing system; that step is the consumer's responsibility.
4. It reports whether the attestation has been rescinded.

The Verify dialog shows each of these outcomes on its own row, along with a list of human readable issues when any check fails. A passing result with a green badge means the document on the platform is byte for byte the document that was signed and has not been rescinded. A failing result tells you which specific check failed so you can decide whether to reissue.

Verify never modifies the attestation. It is safe to run as often as you like, and it writes an entry to the audit log each time so operators can see who verified what and when.

## Rescinding an attestation

Attestations can be rescinded when the producer discovers that the signed document should no longer be relied upon. Rescission is used when the content of the attestation has become materially wrong, when a signatory's authority has been withdrawn, or when the attestation was issued against an assessment that should not have reached Completed. A user must hold the `attestations.rescind` permission to see the action.

From the attestations list, click Rescind on a signed record. The dialog requires a reason. The reason is stored on the attestation alongside the timestamp of the rescission and the identity of the actor, and it travels with the record through every view and every export. A rescission cannot be performed without a reason, because the reason is what downstream consumers use to decide whether to trust a previously fetched copy of the attestation.

Rescission does not delete the attestation. The signed document stays on the platform and its stable URL continues to resolve, because a downstream consumer may already have the old attestation and need to verify that what they hold is what was signed. Instead, the rescinded record carries a visible Rescinded badge in every list, the export embeds a `rescindedAt` marker in the CycloneDX document, and the Verify action reports the rescinded state as an issue. Consumers that honor rescission should stop relying on a rescinded attestation as evidence of the claims it contains.

Rescission is permanent. A rescinded attestation cannot be restored. If the rescission was performed in error the correct response is to issue a new attestation, which can either supersede the rescinded one as a normal correction or simply stand on its own.

## Re-issuing an attestation

An attestation is immutable. If an error is discovered after an attestation has been issued, the correct response is to issue a new attestation that supersedes the old one. The new attestation references the one it supersedes in its provenance metadata, which lets downstream consumers distinguish a correction from an unrelated reassessment.

Do not edit the underlying assessment and re-sign. The platform does not allow that: a Completed assessment's claims are frozen. The reason is that a downstream consumer who already has the old attestation needs the old document to remain verifiable as it was.

## Archiving

Attestations are retained indefinitely by default. Retention is configurable per standard or per entity, but the system never silently deletes an attestation; you must explicitly authorize archival. Archived attestations remain in the system with a special status so historical URLs continue to resolve.
