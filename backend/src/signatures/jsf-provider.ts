/**
 * JSF SignatureProvider — thin adapter over the standalone
 * @cyclonedx/sign package (JSF subpath). The adapter keeps the route
 * layer free of JSF-specific imports and pins a predictable shape for
 * DB storage.
 *
 * The implementation defers every crypto and canonicalization concern
 * to @cyclonedx/sign so that a future WebCrypto or HSM swap lives in
 * exactly one place — the signing library itself.
 */

import { createHash } from 'node:crypto';

import {
  canonicalize,
  type JsonObject as JsfJsonObject,
  type KeyInput as JsfKeyInput,
} from '@cyclonedx/sign';
import {
  computeCanonicalInput,
  sign as jsfSign,
  verify as jsfVerify,
  type JsfSigner,
  type JsfSignOptions,
  type JsfVerifyOptions,
} from '@cyclonedx/sign/jsf';

import type {
  CanonicalizedPayload,
  JsonObject,
  ProviderKeyInput,
  ProviderSignOptions,
  ProviderSignResult,
  ProviderVerifyOptions,
  ProviderVerifyResult,
  SignatureProvider,
} from './types.js';

const JSF_ALGORITHMS = [
  'RS256', 'RS384', 'RS512',
  'PS256', 'PS384', 'PS512',
  'ES256', 'ES384', 'ES512',
  'Ed25519', 'Ed448',
  'HS256', 'HS384', 'HS512',
] as const;

export class JsfSignatureProvider implements SignatureProvider {
  readonly name = 'jsf';
  readonly signatureFormat = 'jsf';
  readonly supportedAlgorithms = JSF_ALGORITHMS;

  canonicalize(
    payload: JsonObject,
    signer: { algorithm: string; excludes?: string[]; signatureProperty?: string },
  ): CanonicalizedPayload {
    const bytes = computeCanonicalInput(
      payload as JsfJsonObject,
      {
        algorithm: signer.algorithm,
        ...(signer.excludes ? { excludes: signer.excludes } : {}),
      } as Omit<JsfSigner, 'value'> & { value?: string },
      signer.signatureProperty,
    );
    return {
      bytes,
      sha256Hex: sha256Hex(bytes),
    };
  }

  sign(payload: JsonObject, options: ProviderSignOptions): ProviderSignResult {
    const jsfOptions = mapSignOptions(options);
    const envelope = jsfSign(payload as JsfJsonObject, jsfOptions);

    // Recompute the canonical bytes so we can return them to the caller
    // alongside the envelope. Both callers and audit logs benefit from
    // having the pre-signature input persisted next to the signature.
    const canonical = this.canonicalize(payload, {
      algorithm: options.algorithm,
      ...(options.excludes ? { excludes: options.excludes } : {}),
      ...(options.signatureProperty ? { signatureProperty: options.signatureProperty } : {}),
    });

    const property = options.signatureProperty ?? 'signature';
    const signer = envelope[property] as unknown as JsfSigner | undefined;
    if (!signer) {
      // Should be impossible: jsfSign only returns on success.
      throw new Error('JSF sign returned an envelope without a signer');
    }

    const result: ProviderSignResult = {
      envelope: envelope as JsonObject,
      algorithm: signer.algorithm,
      signatureValue: signer.value,
      canonicalBytes: canonical.bytes,
      canonicalHashSha256: canonical.sha256Hex,
    };
    if (signer.publicKey) {
      result.publicKey = signer.publicKey;
    }
    return result;
  }

  verify(envelope: JsonObject, options: ProviderVerifyOptions = {}): ProviderVerifyResult {
    const jsfOptions: JsfVerifyOptions = {};
    if (options.publicKey !== undefined) {
      jsfOptions.publicKey = toJsfKeyInput(options.publicKey);
    }
    if (options.allowedAlgorithms) {
      jsfOptions.allowedAlgorithms = [...options.allowedAlgorithms];
    }
    if (options.requireEmbeddedPublicKey) {
      jsfOptions.requireEmbeddedPublicKey = true;
    }
    if (options.signatureProperty) {
      jsfOptions.signatureProperty = options.signatureProperty;
    }

    const jsfResult = jsfVerify(envelope as JsfJsonObject, jsfOptions);
    const out: ProviderVerifyResult = {
      valid: jsfResult.valid,
      reasons: [...jsfResult.errors],
    };
    if (jsfResult.algorithm !== undefined) out.algorithm = jsfResult.algorithm;
    if (jsfResult.publicKey !== undefined) out.publicKey = jsfResult.publicKey;
    if (jsfResult.keyId !== undefined) out.keyId = jsfResult.keyId;
    if (jsfResult.certificatePath !== undefined) out.certificatePath = [...jsfResult.certificatePath];
    if (jsfResult.excludes !== undefined) out.excludes = [...jsfResult.excludes];
    return out;
  }
}

/**
 * Utility exported for tests and the attestations route. Returns the
 * exact bytes a JSF signer would canonicalize before signing.
 */
export function jsfCanonicalBytes(payload: JsonObject): Uint8Array {
  return canonicalize(payload as JsfJsonObject);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function toJsfKeyInput(input: ProviderKeyInput): JsfKeyInput {
  // ProviderKeyInput is intentionally a narrower union than JSF's
  // native KeyInput (we do not surface KeyObject in the public
  // provider API). The runtime values are compatible for the shapes
  // the provider accepts.
  return input as unknown as JsfKeyInput;
}

function mapSignOptions(options: ProviderSignOptions): JsfSignOptions {
  if (!isSupportedAlgorithm(options.algorithm)) {
    throw new Error(`JSF provider does not support algorithm: ${options.algorithm}`);
  }
  const jsfOptions: JsfSignOptions = {
    algorithm: options.algorithm,
    privateKey: toJsfKeyInput(options.privateKey),
  };
  if (options.publicKey !== undefined) {
    if (options.publicKey === false || options.publicKey === 'auto') {
      jsfOptions.publicKey = options.publicKey;
    } else {
      jsfOptions.publicKey = toJsfKeyInput(options.publicKey);
    }
  }
  if (options.keyId !== undefined) jsfOptions.keyId = options.keyId;
  if (options.certificatePath !== undefined) jsfOptions.certificatePath = [...options.certificatePath];
  if (options.excludes !== undefined) jsfOptions.excludes = [...options.excludes];
  if (options.signatureProperty !== undefined) jsfOptions.signatureProperty = options.signatureProperty;
  return jsfOptions;
}

function isSupportedAlgorithm(
  algorithm: string,
): algorithm is (typeof JSF_ALGORITHMS)[number] {
  return (JSF_ALGORITHMS as readonly string[]).includes(algorithm);
}
