/**
 * Detached digital-signature verification helper.
 *
 * Historically this was used by the per-attestation
 * `/api/v1/attestations/:id/verify` endpoint removed in PR3.6. It is
 * kept on the signatures public API because the shape (algorithm name,
 * PEM public key, base64 signature) remains useful for interop with
 * out-of-band detached signatures that callers compute themselves. The
 * signature is detached: it does not live inside a JSF envelope, so the
 * JSF provider's `verify()` cannot be applied directly.
 *
 * This helper bridges that gap. It takes the legacy material
 * (algorithm name, PEM public key, base64 signature) and routes the
 * actual cryptographic verification through the JSF package's
 * `verifyBytes` primitive plus its key normalizer. That keeps the
 * route layer free of `node:crypto` calls and ensures every signature
 * verification in the app shares the same code path.
 *
 * Algorithm names are normalized: callers may pass either the JWS-style
 * identifier accepted by JSF (e.g. `RS256`) or one of the common
 * JCA-style names that Node's crypto module accepts (e.g. `RSA-SHA256`,
 * `sha256WithRSAEncryption`, `ecdsa-with-SHA256`). Callers can keep
 * storing whichever name they were given without needing to translate.
 */

import {
  getAlgorithmSpec,
  toPublicKey,
  verifyBytes,
  type AlgorithmSpec,
  type JsfAlgorithm,
} from '@cyclonedx/jsf';

/**
 * Map JCA-style or other vendor algorithm spellings to the JSF/JWS
 * identifier the algorithm registry recognizes. Returns the input
 * unchanged when it already matches a JSF algorithm — so passing
 * `RS256` is a no-op.
 */
export function normalizeAlgorithm(name: string): JsfAlgorithm {
  const trimmed = name.trim();
  const aliases: Record<string, JsfAlgorithm> = {
    // JCA / OpenSSL aliases for RSA PKCS#1 v1.5
    'RSA-SHA256': 'RS256',
    'RSA-SHA384': 'RS384',
    'RSA-SHA512': 'RS512',
    'sha256WithRSAEncryption': 'RS256',
    'sha384WithRSAEncryption': 'RS384',
    'sha512WithRSAEncryption': 'RS512',
    // ECDSA aliases. NOTE: Node's crypto.createSign produces DER-encoded
    // ECDSA signatures by default, while JSF/JWS uses IEEE P1363 (R||S).
    // Callers signing with crypto.createSign must convert before posting,
    // or supply a JWS-style algorithm so the route knows to expect
    // P1363. The alias here only covers algorithm-name normalization.
    'ecdsa-with-SHA256': 'ES256',
    'ecdsa-with-SHA384': 'ES384',
    'ecdsa-with-SHA512': 'ES512',
    // EdDSA names already match JWS spelling.
    'Ed25519': 'Ed25519',
    'Ed448': 'Ed448',
  };
  const aliased = aliases[trimmed];
  if (aliased) return aliased;
  // Otherwise let the JSF registry validate — getAlgorithmSpec throws on
  // unknown identifiers, which is exactly what callers want.
  getAlgorithmSpec(trimmed);
  return trimmed as JsfAlgorithm;
}

export interface DetachedVerifyOptions {
  /** Algorithm identifier in any spelling normalizeAlgorithm understands. */
  algorithm: string;
  /** PEM-encoded public key (or any input toPublicKey accepts). */
  publicKey: string;
  /** Bytes the signer signed — typically the canonical payload hash. */
  data: Uint8Array;
  /** Signature value as base64 (the legacy on-disk encoding). */
  signatureBase64: string;
}

export interface DetachedVerifyResult {
  /** True when the signature verifies cryptographically. */
  valid: boolean;
  /** Normalized JSF algorithm identifier that was used. */
  algorithm: JsfAlgorithm;
  /** Algorithm spec the verify primitive resolved to. */
  spec: AlgorithmSpec;
  /** Free-form failure reason; present only when valid is false. */
  reason?: string;
}

/**
 * Verify a base64 detached signature over arbitrary bytes using the
 * JSF package's algorithm primitives. Returns a structured result so
 * callers can record both the cryptographic outcome and any
 * normalization metadata.
 */
export function verifyDetachedSignature(
  options: DetachedVerifyOptions,
): DetachedVerifyResult {
  const algorithm = normalizeAlgorithm(options.algorithm);
  const spec = getAlgorithmSpec(algorithm);
  let publicKey;
  try {
    publicKey = toPublicKey(options.publicKey);
  } catch (err) {
    return {
      valid: false,
      algorithm,
      spec,
      reason: `Public key could not be parsed: ${(err as Error).message}`,
    };
  }
  let signatureBytes: Buffer;
  try {
    signatureBytes = Buffer.from(options.signatureBase64, 'base64');
  } catch (err) {
    return {
      valid: false,
      algorithm,
      spec,
      reason: `Signature value is not valid base64: ${(err as Error).message}`,
    };
  }
  let valid = false;
  try {
    valid = verifyBytes(spec, options.data, signatureBytes, publicKey.keyObject, publicKey.curve);
  } catch (err) {
    return {
      valid: false,
      algorithm,
      spec,
      reason: `Signature verification raised an error: ${(err as Error).message}`,
    };
  }
  if (valid) {
    return { valid, algorithm, spec };
  }
  return {
    valid,
    algorithm,
    spec,
    reason: 'Signature did not verify against the supplied public key',
  };
}
