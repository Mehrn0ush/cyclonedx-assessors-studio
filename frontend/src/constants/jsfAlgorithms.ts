/**
 * JSF asymmetric signature algorithms supported by the platform.
 *
 * These names are the JSF 0.82 identifiers that the backend accepts
 * at /attestations/:id/sign, /me/signatures, and declarations.signature.
 * They are the authoritative enum used by zod schemas in the backend
 * and by the crypto primitives in the @cyclonedx/jsf package.
 *
 * Keep this list in sync with JSF_ASYMMETRIC_ALGORITHMS in
 * backend/packages/jsf/src/algorithms.ts. A backend typecheck will
 * fail if the backend schema widens beyond what the frontend knows
 * about; a drift in the other direction is caught at runtime by
 * zod at the POST boundary.
 *
 * HMAC algorithms (HS256/384/512) are deliberately omitted because
 * symmetric keys are not appropriate for signatory attribution or
 * for the enveloping declarations.signature and document signature.
 */
export const JSF_ASYMMETRIC_ALGORITHMS = [
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
  'Ed25519',
  'Ed448',
] as const

export type JsfAsymmetricAlgorithm = typeof JSF_ASYMMETRIC_ALGORITHMS[number]

/**
 * Human readable labels for the JSF algorithm identifiers, used to
 * render the Sign and My Signatures dropdowns. The value stored on
 * the wire and in the database is always the bare identifier.
 */
export const JSF_ALGORITHM_LABELS: Record<JsfAsymmetricAlgorithm, string> = {
  RS256: 'RS256 (RSA PKCS#1 v1.5 with SHA 256)',
  RS384: 'RS384 (RSA PKCS#1 v1.5 with SHA 384)',
  RS512: 'RS512 (RSA PKCS#1 v1.5 with SHA 512)',
  PS256: 'PS256 (RSA PSS with SHA 256)',
  PS384: 'PS384 (RSA PSS with SHA 384)',
  PS512: 'PS512 (RSA PSS with SHA 512)',
  ES256: 'ES256 (ECDSA on P 256 with SHA 256)',
  ES384: 'ES384 (ECDSA on P 384 with SHA 384)',
  ES512: 'ES512 (ECDSA on P 521 with SHA 512)',
  Ed25519: 'Ed25519 (EdDSA)',
  Ed448: 'Ed448 (EdDSA)',
}
