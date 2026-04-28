/**
 * JSS / X.590 SignatureProvider — stub for CycloneDX v2.
 *
 * ITU-T X.590 (October 2023) specifies the "JSON signature scheme"
 * (JSS), a JSON-native signature format published by ITU-T Study
 * Group 17. CycloneDX v2 is expected to adopt X.590 as an alternate
 * signature format to JSF 0.82. Until the v2 schema lands we reserve
 * the `jss` provider name here and throw a recognizable error on
 * every operation, so the registry wiring, the UI signature-format
 * picker, and the DB storage layer can all be written against the
 * final pluggable surface today.
 *
 * When implementing this provider:
 *   - Canonicalization produces JSON bytes per the canonicalization
 *     rules defined in X.590 (to be confirmed against the spec —
 *     JCS is a plausible baseline but the recommendation is
 *     authoritative).
 *   - The envelope shape and signer element names are defined by
 *     X.590 and may differ from JSF's `signature` property.
 *   - `signatureValue` should be encoded per X.590 (base64url is the
 *     expected transport in a JSON envelope).
 */

import type {
  CanonicalizedPayload,
  JsonObject,
  ProviderSignOptions,
  ProviderSignResult,
  ProviderVerifyOptions,
  ProviderVerifyResult,
  SignatureProvider,
} from './types.js';

export class JssNotImplementedError extends Error {
  constructor(
    message = 'The JSS / X.590 SignatureProvider is not implemented yet; CycloneDX v2 adds X.590 support',
  ) {
    super(message);
    this.name = 'JssNotImplementedError';
  }
}

export class JssSignatureProvider implements SignatureProvider {
  readonly name = 'jss';
  readonly signatureFormat = 'x590';
  readonly supportedAlgorithms = [] as readonly string[];

  canonicalize(
    _payload: JsonObject,
    _signer: { algorithm: string; excludes?: string[]; signatureProperty?: string },
  ): CanonicalizedPayload {
    throw new JssNotImplementedError();
  }

  sign(_payload: JsonObject, _options: ProviderSignOptions): Promise<ProviderSignResult> {
    throw new JssNotImplementedError();
  }

  verify(
    _envelope: JsonObject,
    _options?: ProviderVerifyOptions,
  ): Promise<ProviderVerifyResult> {
    throw new JssNotImplementedError();
  }
}
